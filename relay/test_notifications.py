#!/usr/bin/env python3
"""Notification queue, delivery and Telegram binding.

The interesting invariants are all in storage and in the two loops, not in the HTTP
plumbing: (route, event) is the dedup key, a stale reminder is dropped instead of
delivered, one blocked recipient never blocks another, and a chat id never reaches the
relay database.
"""

import os
import shutil
import sqlite3
import tempfile
import time
import unittest

from server import (
    ApiError,
    NOTIFY_MAX_PER_HOUR_PER_ROUTE,
    NOTIFY_STALE_SECONDS,
    SlagRelayServer,
    TG_EXPANDABLE_AFTER,
    TG_TEXT_BUDGET,
    TG_TEXT_LIMIT,
    render_notification,
)


class FakeBot:
    """Stands in for the Bot API: records sends, can fail on demand."""

    def __init__(self):
        self.username = "test_bot"
        self.sent: list[tuple[str, str]] = []
        self.calls: list[dict] = []
        self.failure: dict | None = None
        # Telegram refuses markup it cannot parse; the relay must then retry without it.
        self.reject_markup = False

    async def call(self, method: str, payload: dict, timeout: float = 20):
        if method == "sendMessage":
            self.calls.append(dict(payload))
            if self.failure:
                return False, dict(self.failure)
            if self.reject_markup and payload.get("parse_mode"):
                return False, {"ok": False, "error_code": 400,
                               "description": "Bad Request: can't parse entities"}
            self.sent.append((str(payload["chat_id"]), str(payload["text"])))
            return True, {"ok": True, "result": {"message_id": len(self.sent)}}
        if method == "getMe":
            return True, {"ok": True, "result": {"username": self.username}}
        return True, {"ok": True, "result": []}


class RenderTestCase(unittest.TestCase):
    """The renderer is pure: escaping, the character budget and the HTML it produces."""

    def test_user_text_is_escaped_not_interpreted(self):
        html, plain = render_notification("Сдать <b>отчёт</b> & ко", "a < b", "task", "", False)
        self.assertIn("&lt;b&gt;отчёт&lt;/b&gt;", html)
        self.assertIn("&amp; ко", html)
        self.assertIn("a &lt; b", html)
        self.assertNotIn("<b>отчёт</b>", html)
        # The fallback twin is the text a human typed, not the escaped one.
        self.assertIn("<b>отчёт</b>", plain)

    def test_overdue_leads_with_the_marker_and_the_deadline(self):
        html, _ = render_notification("T", "тело", "overdue", "12 нояб., 18:00", False)
        self.assertTrue(html.startswith("⚠️ "))
        self.assertIn("срок был <code>12 нояб., 18:00</code>", html)
        self.assertIn("<blockquote>", html)

    def test_spoiler_hides_the_body_and_a_long_body_collapses(self):
        body = "а" * (TG_EXPANDABLE_AFTER + 20)
        html, _ = render_notification("T", body, "task", "", True)
        self.assertIn('<span class="tg-spoiler">', html)
        self.assertIn("<blockquote expandable>", html)
        # A stray attribute in the closing tag is a 400 on every message.
        self.assertIn("</blockquote>", html)
        self.assertNotIn("</blockquote expandable>", html)

    def test_escaping_never_pushes_the_message_over_the_limit(self):
        body = "&" * 1500  # five characters of markup per character of text
        html, plain = render_notification("T", body, "task", "13 нояб., 14:30", False)
        self.assertLessEqual(len(html), TG_TEXT_BUDGET)
        self.assertLessEqual(len(plain), TG_TEXT_LIMIT)
        self.assertIn("…</blockquote>", html)

    def test_no_stamp_line_without_a_deadline(self):
        html, _ = render_notification("T", "тело", "task", "", False)
        self.assertNotIn("<code>", html)
        self.assertNotIn("срок", html)

    def test_empty_title_still_renders_a_message(self):
        html, _ = render_notification("   ", "", "task", "", False)
        self.assertEqual(html, "<b>напоминание</b>")


class NotificationTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="slag_notify_")
        self.db_path = os.path.join(self.tmpdir, "relay.db")
        self.server = SlagRelayServer("127.0.0.1", 0, self.db_path, require_account_auth=False,
                                      bot_token="", notify_pepper="test-pepper")
        self.server.bot = FakeBot()
        self.bot: FakeBot = self.server.bot
        self.db = self.server.db
        self.notify = self.server.notify
        self.tag = self.server._notify_tag("vault-1")

    async def asyncTearDown(self):
        self.db.conn.close()
        self.notify.conn.close()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    async def arm(self, item_key: str, event_key: str, routes: list[dict], fire_at: float | None = None,
                  **presentation):
        payload = {
            "vaultId": "vault-1", "itemKey": item_key, "eventKey": event_key,
            "fireAt": time.time() - 1 if fire_at is None else fire_at, "routes": routes,
        }
        payload.update(presentation)
        return self.server._arm_notifications(payload, "vault-1")

    async def test_invite_lifecycle(self):
        expires = self.db.create_notify_invite("vault-1", "abc123def456", "route-token-1")
        self.assertGreater(expires, time.time())
        invite = self.db.get_notify_invite("abc123def456")
        self.assertEqual(invite["vault_id"], "vault-1")
        self.assertIsNone(invite["redeemed_at"])
        self.assertEqual(self.db.pending_notify_invites("vault-1"), 1)

        self.db.redeem_notify_invite("abc123def456")
        self.assertIsNotNone(self.db.get_notify_invite("abc123def456")["redeemed_at"])
        self.db.redeem_notify_invite("abc123def456")
        self.assertEqual(self.db.pending_notify_invites("vault-1"), 0)

    async def test_same_event_is_delivered_once_per_route(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.notify.link("tok-b", "chat-b", "B", self.tag)
        routes = [{"token": "tok-a", "title": "Отчёт", "body": ""},
                  {"token": "tok-b", "title": "Отчёт", "body": ""}]

        armed, dropped = await self.arm("item-1", "ev-1", routes)
        self.assertEqual((armed, dropped), (2, []))
        # Two devices arming the same reminder must not produce two messages. The repeat now
        # refreshes the queued job, so it counts as accepted rather than as new.
        armed, _ = await self.arm("item-1", "ev-1", routes)
        self.assertEqual(armed, 2)
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 2)

        await self.server._deliver_notifications()
        self.assertEqual(sorted(chat for chat, _ in self.bot.sent), ["chat-a", "chat-b"])

        await self.server._deliver_notifications()
        self.assertEqual(len(self.bot.sent), 2)

    async def test_one_blocked_recipient_does_not_block_the_rest(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.notify.link("tok-b", "chat-b", "B", self.tag)
        self.notify.block_route("tok-b")
        armed, dropped = await self.arm("item-1", "ev-1", [
            {"token": "tok-a", "title": "T", "body": ""},
            {"token": "tok-b", "title": "T", "body": ""},
        ])
        self.assertEqual(armed, 1)
        self.assertEqual(dropped, [{"token": "tok-b", "reason": "blocked"}])
        await self.server._deliver_notifications()
        self.assertEqual([chat for chat, _ in self.bot.sent], ["chat-a"])

    async def test_removing_a_recipient_drops_the_queued_job(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.notify.link("tok-b", "chat-b", "B", self.tag)
        routes = [{"token": "tok-a", "title": "T", "body": ""},
                  {"token": "tok-b", "title": "T", "body": ""}]
        self.assertEqual((await self.arm("item-1", "ev-1", routes))[0], 2)
        # The same event, one recipient fewer: the removed one must not get the message.
        # The remaining route is refreshed, so the call still reports one accepted job.
        self.assertEqual((await self.arm("item-1", "ev-1", routes[:1]))[0], 1)
        await self.server._deliver_notifications()
        self.assertEqual([chat for chat, _ in self.bot.sent], ["chat-a"])

    async def test_unlinked_token_is_dropped_not_queued(self):
        armed, dropped = await self.arm("item-1", "ev-1", [{"token": "nobody", "title": "T", "body": ""}])
        self.assertEqual(armed, 0)
        self.assertEqual(dropped, [{"token": "nobody", "reason": "not_linked"}])
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 0)

    async def test_stale_reminder_is_dropped_instead_of_delivered(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        # Queued an hour ago while the relay was down: the moment is gone, not postponed.
        old = time.time() - NOTIFY_STALE_SECONDS - 60
        with self.db.conn:
            self.db.conn.execute(
                "INSERT INTO notify_jobs (route_token, event_key, item_key, vault_id, fire_at,"
                " title, body, created_at) VALUES ('tok-a', 'ev-1', 'item-1', 'vault-1', ?, 'T', '', ?)",
                (old, old))
        await self.server._deliver_notifications()
        self.assertEqual(self.bot.sent, [])
        # Closed, not retried on the next tick.
        self.assertEqual(self.db.due_notify_jobs(time.time(), 10), [])

    async def test_bot_start_links_a_private_chat_once(self):
        self.db.create_notify_invite("vault-1", "abc123def456", "route-token-1")
        update = {"update_id": 1, "message": {
            "chat": {"id": 42, "type": "private"}, "from": {"id": 42, "first_name": "Ann"},
            "text": "/start abc123def456"}}
        await self.server._handle_bot_update(update)
        route = self.notify.get("route-token-1")
        self.assertEqual(route["chat_id"], "42")
        self.assertEqual(route["label"], "Ann")
        self.assertIsNotNone(self.db.get_notify_invite("abc123def456")["redeemed_at"])

        await self.server._handle_bot_update(update)
        self.assertIn("уже использован", self.bot.sent[-1][1])

    async def test_bot_start_ignores_groups_and_bad_codes(self):
        self.db.create_notify_invite("vault-1", "abc123def456", "route-token-1")
        await self.server._handle_bot_update({"update_id": 2, "message": {
            "chat": {"id": 7, "type": "group"}, "from": {"id": 7}, "text": "/start abc123def456"}})
        self.assertIsNone(self.notify.get("route-token-1"))

        await self.server._handle_bot_update({"update_id": 3, "message": {
            "chat": {"id": 8, "type": "private"}, "from": {"id": 8}, "text": "/start ../../etc"}})
        self.assertIn("не похож", self.bot.sent[-1][1])

        await self.server._handle_bot_update({"update_id": 4, "message": {
            "chat": {"id": 8, "type": "private"}, "from": {"id": 8}, "text": "/start ffffffffffff"}})
        self.assertIn("недействителен", self.bot.sent[-1][1])

    async def test_chat_id_never_reaches_the_relay_database(self):
        self.notify.link("tok-a", "987654321000", "A", self.tag)
        self.db.create_notify_invite("vault-1", "abc123def456", "tok-b")
        conn = sqlite3.connect(self.db_path)
        try:
            dump = "\n".join(conn.iterdump())
        finally:
            conn.close()
        self.assertNotIn("987654321000", dump)
        self.assertIn("987654321000", "\n".join(self.notify.conn.iterdump()))

    async def test_forbidden_bot_marks_route_and_stops(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": ""}])
        self.bot.failure = {"ok": False, "error_code": 403, "description": "Forbidden: bot was blocked by the user"}
        await self.server._deliver_notifications()
        self.assertIsNotNone(self.notify.get("tok-a")["blocked_at"])
        self.bot.failure = None
        await self.server._deliver_notifications()
        self.assertEqual(self.bot.sent, [])


    async def test_foreign_vault_cannot_arm_someone_elses_channel(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        payload = {"itemKey": "item-1", "eventKey": "ev-1", "fireAt": time.time() + 60,
                   "routes": [{"token": "tok-a", "title": "спам", "body": "от чужого имени"}]}
        armed, dropped = self.server._arm_notifications(payload, "vault-2")
        self.assertEqual((armed, dropped), (0, [{"token": "tok-a", "reason": "not_linked"}]))
        self.assertEqual(self.db.count_notify_jobs("vault-2"), 0)
        await self.server._deliver_notifications()
        self.assertEqual(self.bot.sent, [])

    async def test_unknown_and_foreign_tokens_answer_identically(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        payload = {"itemKey": "item-1", "eventKey": "ev-1", "fireAt": time.time() + 60}
        _, unknown = self.server._arm_notifications(
            {**payload, "routes": [{"token": "nope", "title": "T", "body": ""}]}, "vault-1")
        _, foreign = self.server._arm_notifications(
            {**payload, "routes": [{"token": "tok-a", "title": "T", "body": ""}]}, "vault-2")
        self.assertEqual(unknown[0]["reason"], foreign[0]["reason"])
        self.assertEqual(unknown[0]["reason"], "not_linked")

    async def test_fire_at_outside_the_window_is_rejected(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        for fire_at in (time.time() + 10 * 365 * 86400, time.time() - 3600):
            with self.assertRaises(ApiError):
                await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": ""}],
                               fire_at=fire_at)

    async def test_one_route_cannot_be_flooded(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        now = time.time()
        with self.db.conn:
            for index in range(NOTIFY_MAX_PER_HOUR_PER_ROUTE):
                self.db.conn.execute(
                    "INSERT INTO notify_jobs (route_token, event_key, item_key, vault_id, fire_at,"
                    " title, body, created_at, sent_at)"
                    " VALUES ('tok-a', ?, ?, 'vault-1', ?, 'старое', '', ?, ?)",
                    (f"sent-{index}", f"item-{index}", now - 60, now - 60, now - 30))
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": ""}])
        await self.server._deliver_notifications()
        self.assertEqual(self.bot.sent, [])


    async def test_question_from_bot_needs_an_enabled_route(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertIn("включить", self.bot.sent[-1][1])
        self.db.set_assistant_link("tok-a", "vault-1", True)
        await self.server._bot_question("chat-a", "что по задачам?")
        # The relay has no model: without a live device it says so instead of making something up.
        self.assertIn("не подключалось", self.bot.sent[-1][1])
        self.assertEqual(self.db.expired_assistant_requests(time.time() + 10_000), [])

    async def test_answer_reaches_the_chat_exactly_once(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.assertTrue(await self.server._answer_assistant("vault-1", request_id, "ответ"))
        self.assertEqual(self.bot.sent[-1], ("chat-a", "ответ"))
        with self.assertRaises(ApiError):
            await self.server._answer_assistant("vault-1", request_id, "ещё раз")

    async def test_answer_from_another_vault_is_refused(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        with self.assertRaises(ApiError):
            await self.server._answer_assistant("vault-2", request_id, "чужой ответ")
        self.assertEqual(self.bot.sent, [])

    async def test_unanswered_question_expires_with_an_honest_reply(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        with self.db.conn:
            self.db.conn.execute("UPDATE assistant_requests SET expires_at = ? WHERE id = ?",
                                 (time.time() - 1, request_id))
        await self.server._deliver_notifications()
        self.assertIn("не ответило", self.bot.sent[-1][1])
        self.assertIsNotNone(self.db.get_assistant_request(request_id)["answered_at"])


    async def test_delivered_reminder_carries_the_markup(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "Сдать <b>отчёт</b>", "body": "a < b"}],
                       kind="overdue", stamp="12 нояб., 18:00")
        await self.server._deliver_notifications()
        payload = self.bot.calls[-1]
        self.assertEqual(payload["parse_mode"], "HTML")
        self.assertIn("&lt;b&gt;отчёт&lt;/b&gt;", payload["text"])
        self.assertIn("срок был <code>12 нояб., 18:00</code>", payload["text"])
        self.assertTrue(payload["text"].startswith("⚠️"))

    async def test_refused_markup_still_delivers_the_text(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": "тело"}])
        self.bot.reject_markup = True
        await self.server._deliver_notifications()
        # First try with markup is refused, the second without it goes through.
        self.assertEqual(len(self.bot.calls), 2)
        self.assertIsNone(self.bot.calls[-1].get("parse_mode"))
        self.assertEqual(self.bot.sent, [("chat-a", "T\nтело")])
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 0)

    async def test_answer_from_a_device_is_escaped(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.assertTrue(await self.server._answer_assistant("vault-1", request_id, "<b>жирный</b> & <i>x</i>"))
        self.assertEqual(self.bot.sent[-1][1], "&lt;b&gt;жирный&lt;/b&gt; &amp; &lt;i&gt;x&lt;/i&gt;")

    async def test_arm_rejects_presentation_it_cannot_render(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        routes = [{"token": "tok-a", "title": "T", "body": ""}]
        for broken in ({"kind": "reminder"}, {"stamp": "я" * 41}, {"tz": 5000}, {"spoiler": "да"}):
            with self.assertRaises(ApiError):
                await self.arm("item-1", "ev-1", routes, **broken)
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 0)

    async def test_rearm_refreshes_an_unsent_job_but_never_across_timezones(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "старое", "body": ""}], tz=180)
        # Same zone: an edited note reaches the queued job instead of firing stale text.
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "новое", "body": ""}], tz=180)
        job = self.db.conn.execute("SELECT * FROM notify_jobs").fetchone()
        self.assertEqual(job["title"], "новое")

        fire_at = time.time() + 600
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "лиссабон", "body": ""}],
                       fire_at=fire_at, tz=0)
        job = self.db.conn.execute("SELECT * FROM notify_jobs").fetchone()
        # Another timezone neither rewrites the text nor pulls the moment: the first arm owns it.
        self.assertEqual(job["title"], "новое")
        self.assertLess(job["fire_at"], fire_at)


if __name__ == "__main__":
    unittest.main()
