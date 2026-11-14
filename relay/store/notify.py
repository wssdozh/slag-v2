"""Очередь уведомлений: инвайты, задания, лимиты и телеметрия доставки.

Здесь нет chat_id: только `route_token` и `HMAC(pepper, vault_id)`. Кто получатель —
знает исключительно `notify_routes.db`.
"""

import sqlite3
import hashlib
import hmac
import secrets
import time
from typing import Optional

from settings import *


class NotifyMixin:
    def create_notify_invite(self, vault_id: str, code: str, route_token: str) -> float:
        """One live code per vault: asking again revokes the previous one.

        A pile of valid codes is a pile of open doors, and the app shows a single channel
        anyway — so the new code replaces the old instead of queueing beside it.
        """
        now = time.time()
        expires_at = now + NOTIFY_INVITE_TTL_SECONDS
        with self.conn:
            self.conn.execute("DELETE FROM notify_invites WHERE vault_id = ? AND redeemed_at IS NULL", (vault_id,))
            self.conn.execute(
                "INSERT INTO notify_invites (code, route_token, vault_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                (code, route_token, vault_id, now, expires_at))
        return expires_at

    def get_notify_invite(self, code: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_invites WHERE code = ?", (code,)).fetchone()

    def pending_notify_invites(self, vault_id: str) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS n FROM notify_invites WHERE vault_id = ? AND redeemed_at IS NULL AND expires_at > ?",
                                (vault_id, time.time())).fetchone()
        return row["n"] if row else 0

    def redeem_notify_invite(self, code: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_invites SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL",
                              (time.time(), code))

    def count_notify_jobs(self, vault_id: str) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS n FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL",
                                (vault_id,)).fetchone()
        return row["n"] if row else 0

    def count_notify_jobs_for_account(self, account_id: str) -> int:
        row = self.conn.execute("""
            SELECT COUNT(*) AS n FROM notify_jobs j JOIN vaults v ON v.id = j.vault_id
            WHERE v.owner_account_id = ? AND j.sent_at IS NULL
        """, (account_id,)).fetchone()
        return row["n"] if row else 0

    def notify_sent_last_hour(self, route_token: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) AS n FROM notify_jobs WHERE route_token = ? AND sent_at > ?",
            (route_token, time.time() - 3600)).fetchone()
        return row["n"] if row else 0

    def arm_notify_jobs(self, vault_id: str, item_key: str, event_key: Optional[str], fire_at: float,
                        routes: list[dict], presentation: Optional[dict] = None) -> tuple[int, list[dict]]:
        """Idempotent: the (route, event) primary key is the whole dedup story.

        `routes` is the full desired recipient set for the item: a recipient dropped from it
        loses the already-queued job, otherwise deleting a route in settings would still
        deliver the message that was armed a minute earlier.

        A repeat arm refreshes an unsent job (edited text, toggled spoiler) but only from the
        same timezone: two devices in different zones would otherwise pull the moment back and
        forth every reconcile, so the first arm keeps the clock and the second keeps quiet.
        """
        now = time.time()
        armed = 0
        if not event_key:
            with self.conn:
                self.conn.execute("DELETE FROM notify_jobs WHERE vault_id = ? AND item_key = ? AND sent_at IS NULL",
                                  (vault_id, item_key))
            return 0, []
        look = presentation or {}
        kind = look.get("kind", "task")
        stamp = look.get("stamp", "")
        spoiler = 1 if look.get("spoiler") else 0
        tz = int(look.get("tz", 0))
        tokens = [route["token"] for route in routes]
        placeholders = ",".join("?" for _ in tokens)
        with self.conn:
            self.conn.execute(
                "DELETE FROM notify_jobs WHERE vault_id = ? AND item_key = ? AND sent_at IS NULL "
                f"AND (event_key != ? OR route_token NOT IN ({placeholders}))",
                (vault_id, item_key, event_key, *tokens))
            for route in routes:
                res = self.conn.execute("""
                    INSERT INTO notify_jobs
                        (route_token, event_key, item_key, vault_id, fire_at, title, body, created_at,
                         kind, stamp, spoiler, tz)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(route_token, event_key) DO UPDATE SET
                        title = excluded.title, body = excluded.body, fire_at = excluded.fire_at,
                        kind = excluded.kind, stamp = excluded.stamp, spoiler = excluded.spoiler
                    WHERE notify_jobs.sent_at IS NULL AND notify_jobs.tz = excluded.tz
                """, (route["token"], event_key, item_key, vault_id, fire_at,
                      route.get("title", ""), route.get("body", ""), now,
                      kind, stamp, spoiler, tz))
                armed += res.rowcount
        return armed, []

    def log_delivery_event(self, kind: str, outcome: str, route_tag: str = "", request_id: str = "",
                           device_count: int = 0, latency_ms: Optional[int] = None,
                           error_code: str = "") -> None:
        with self.conn:
            self.conn.execute(
                "INSERT INTO delivery_events (at, kind, route_tag, request_id, outcome, device_count,"
                " latency_ms, error_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (time.time(), kind, route_tag, request_id, outcome, device_count, latency_ms, error_code))

    def purge_delivery_events(self, older_than: float) -> int:
        with self.conn:
            res = self.conn.execute("DELETE FROM delivery_events WHERE at < ?", (older_than,))
        return res.rowcount

    def due_notify_jobs(self, now: float, limit: int) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM notify_jobs WHERE sent_at IS NULL AND fire_at <= ? ORDER BY fire_at LIMIT ?",
            (now, limit)).fetchall()

    def claim_notify_job(self, route_token: str, event_key: str, now: float) -> bool:
        with self.conn:
            res = self.conn.execute("""
                UPDATE notify_jobs SET claimed_at = ?, attempts = attempts + 1
                WHERE route_token = ? AND event_key = ? AND sent_at IS NULL
                  AND (claimed_at IS NULL OR claimed_at < ?)
            """, (now, route_token, event_key, now - NOTIFY_CLAIM_LEASE_SECONDS))
        return res.rowcount == 1

    def finish_notify_job(self, route_token: str, event_key: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_jobs SET sent_at = ? WHERE route_token = ? AND event_key = ?",
                              (time.time(), route_token, event_key))

    def release_notify_job(self, route_token: str, event_key: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_jobs SET claimed_at = NULL WHERE route_token = ? AND event_key = ?",
                              (route_token, event_key))
