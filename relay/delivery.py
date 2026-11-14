"""Доставка уведомлений: очередь → Bot API, с лимитами, ретраем и тихими отказами.

Одно задание — одно сообщение. Старше часа — закрывается неотправленным: ноутбук,
проснувшийся через неделю, не должен вываливать backlog.
"""

from __future__ import annotations

import time
import asyncio
import hashlib
import hmac
from errors import ApiError
from tg import TG_KINDS, TG_STAMP_MAX, TelegramBot, render_notification, tg_escape
from typing import Optional

from settings import *
from tg import render_notification, tg_escape


class DeliveryDomain:
    def _notify_tag(self, vault_id: str) -> str:
        """Vault fingerprint stored next to the chat id, never the vault id itself."""
        if not self.notify_pepper:
            return ""
        return hmac.new(self.notify_pepper, vault_id.encode("utf-8"), hashlib.sha256).hexdigest()[:32]

    def _notify_channel_state(self, vault_id: str, route_token: str) -> str:
        """`pending | active | blocked`, with one answer for every channel that is not ours.

        Unknown, someone else's and never-linked must read the same, otherwise this endpoint
        turns into an oracle for which channels exist.
        """
        tag = self._notify_tag(vault_id)
        route = self.notify.get(route_token)
        if not route or not tag or not hmac.compare_digest(route["vault_tag"], tag):
            return "pending"
        return "blocked" if route["blocked_at"] is not None else "active"

    def _arm_notifications(self, body: dict, vault_id: str) -> tuple[int, list[dict]]:
        """Validate an arm payload and queue it. Caller has already authorized the vault."""
        item_key = body.get("itemKey", "")
        if not isinstance(item_key, str) or not item_key or len(item_key) > 200:
            raise ApiError(400, "invalid_notification")
        event_key = body.get("eventKey")
        if event_key is not None and (not isinstance(event_key, str) or not event_key or len(event_key) > 128):
            raise ApiError(400, "invalid_notification")
        if event_key is None:
            return self.db.arm_notify_jobs(vault_id, item_key, None, 0.0, [])
        fire_at = body.get("fireAt")
        raw_routes = body.get("routes")
        if not isinstance(fire_at, (int, float)) or isinstance(fire_at, bool):
            raise ApiError(400, "invalid_notification")
        # A job that fires in 3000 is a queue squat, one that fired last week is noise.
        now = time.time()
        if not (now - NOTIFY_LEEWAY_SECONDS <= fire_at <= now + NOTIFY_MAX_LEAD_SECONDS):
            raise ApiError(400, "invalid_notification")
        if not isinstance(raw_routes, list) or not raw_routes or len(raw_routes) > 20:
            raise ApiError(400, "invalid_notification")
        # Presentation is rendered by the relay, so it is validated here, not trusted as markup.
        kind = body.get("kind", "task")
        stamp = body.get("stamp", "")
        spoiler = body.get("spoiler", False)
        tz = body.get("tz", 0)
        if (kind not in TG_KINDS or not isinstance(stamp, str) or len(stamp) > TG_STAMP_MAX
                or not isinstance(spoiler, bool) or not isinstance(tz, int) or isinstance(tz, bool)
                or not -1440 <= tz <= 1440):
            raise ApiError(400, "invalid_notification")
        if self.db.count_notify_jobs(vault_id) > NOTIFY_MAX_JOBS_PER_VAULT:
            raise ApiError(429, "notify_queue_full")
        vault_tag = self._notify_tag(vault_id)
        routes: list[dict] = []
        dropped: list[dict] = []
        for entry in raw_routes:
            if not isinstance(entry, dict):
                raise ApiError(400, "invalid_notification")
            token = entry.get("token")
            title = entry.get("title", "")
            bodytext = entry.get("body", "")
            if (not isinstance(token, str) or not token or len(token) > 128 or not isinstance(title, str)
                    or not isinstance(bodytext, str) or len(title) > 200 or len(bodytext) > 1500):
                raise ApiError(400, "invalid_notification")
            route = self.notify.get(token)
            # One uniform answer for "unknown" and "someone else's": a token must not be
            # usable as an oracle for which channels exist.
            if not route or not vault_tag or not hmac.compare_digest(route["vault_tag"], vault_tag):
                dropped.append({"token": token, "reason": "not_linked"})
            elif route["blocked_at"] is not None:
                dropped.append({"token": token, "reason": "blocked"})
            else:
                routes.append({"token": token, "title": title, "body": bodytext})
        armed, _ = self.db.arm_notify_jobs(vault_id, item_key, event_key, float(fire_at), routes,
                                           {"kind": kind, "stamp": stamp.strip(),
                                            "spoiler": spoiler, "tz": tz})
        return armed, dropped

    def _armed_digest(self, vault_id: str) -> str:
        """What the relay holds that a device will run: the only fact it can add on its own.

        Returns an empty string when the queue is empty — the caller already said the one thing
        worth saying, and "в очереди пусто" is noise on top of "устройство молчит".
        """
        rows = self.db.conn.execute(
            "SELECT title, stamp FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL"
            " ORDER BY fire_at LIMIT 2", (vault_id,)).fetchall()
        if not rows:
            return ""
        total = self.db.conn.execute(
            "SELECT COUNT(*) AS n FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL",
            (vault_id,)).fetchone()["n"]
        next_row = rows[0]
        when = f" — {next_row['stamp']}" if next_row["stamp"] else ""
        tail = f" (и ещё {total - 1})" if total > 1 else ""
        return f"в очереди ближайшее: «{next_row['title']}»{when}{tail}"

    async def notify_delivery_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            try:
                await self._deliver_notifications()
            except Exception as exc:
                logger.error("Notification delivery error: %s", exc)

    async def _deliver_notifications(self) -> None:
        if not self.bot:
            return
        now = time.time()

        for job in self.db.due_notify_jobs(now, NOTIFY_BATCH_SIZE):
            route_token, event_key = job["route_token"], job["event_key"]
            # Late is not the same as wanted: a device that wakes up after a week must not
            # dump a backlog into someone's Telegram.
            if now - job["fire_at"] > NOTIFY_STALE_SECONDS:
                self.db.finish_notify_job(route_token, event_key)
                continue
            route = self.notify.get(route_token)
            if not route or route["blocked_at"] is not None:
                self.db.finish_notify_job(route_token, event_key)
                continue
            # Recipients are people, not a channel: a compromised or hostile vault cannot
            # turn one chat into a firehose.
            if self.db.notify_sent_last_hour(route_token) >= NOTIFY_MAX_PER_HOUR_PER_ROUTE:
                self.db.finish_notify_job(route_token, event_key)
                logger.warning("Telegram rate cap reached for a route, dropping the message")
                continue
            if not self.db.claim_notify_job(route_token, event_key, now):
                continue
            html, plain = render_notification(job["title"], job["body"], job["kind"], job["stamp"],
                                              bool(job["spoiler"]))
            ok, body = await self._send_telegram(route["chat_id"], html, plain, timeout=20)
            if ok:
                self.db.finish_notify_job(route_token, event_key)
                continue
            retry_after = TelegramBot.retry_after(body)
            if retry_after:
                self.db.release_notify_job(route_token, event_key)
                await asyncio.sleep(retry_after)
                continue
            if body.get("error_code") == 403:
                self.notify.block_route(route_token)
                self.db.finish_notify_job(route_token, event_key)
                continue
            if job["attempts"] >= 1:
                # Second failure: give up. A missing reminder is worse than a duplicate, but a
                # retry storm on a broken token is worse than both.
                self.db.finish_notify_job(route_token, event_key)
                continue
            self.db.release_notify_job(route_token, event_key)
            logger.warning("Telegram send failed (%s), one retry left: %s",
                           body.get("error_code"), body.get("description"))
