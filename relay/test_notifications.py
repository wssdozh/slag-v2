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

from server import NOTIFY_STALE_SECONDS, SlagRelayServer


class FakeBot:
    """Stands in for the Bot API: records sends, can fail on demand."""

    def __init__(self):
        self.username = "test_bot"
        self.sent: list[tuple[str, str]] = []
        self.failure: dict | None = None

    async def call(self, method: str, payload: dict, timeout: float = 20):
        if method == "sendMessage":
            if self.failure:
                return False, dict(self.failure)
            self.sent.append((str(payload["chat_id"]), str(payload["text"])))
            return True, {"ok": True, "result": {"message_id": len(self.sent)}}
        if method == "getMe":
            return True, {"ok": True, "result": {"username": self.username}}
        return True, {"ok": True, "result": []}


class NotificationTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="slag_notify_")
        self.db_path = os.path.join(self.tmpdir, "relay.db")
        self.server = SlagRelayServer("127.0.0.1", 0, self.db_path, require_account_auth=False, bot_token="")
        self.server.bot = FakeBot()
        self.bot: FakeBot = self.server.bot
        self.db = self.server.db
        self.notify = self.server.notify

    async def asyncTearDown(self):
        self.db.conn.close()
        self.notify.conn.close()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    async def arm(self, item_key: str, event_key: str, routes: list[dict], fire_at: float | None = None):
        return self.server._arm_notifications({
            "vaultId": "vault-1", "itemKey": item_key, "eventKey": event_key,
            "fireAt": time.time() - 1 if fire_at is None else fire_at, "routes": routes,
        }, "vault-1")

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
        self.notify.link("tok-a", "chat-a", "A")
        self.notify.link("tok-b", "chat-b", "B")
        routes = [{"token": "tok-a", "title": "Отчёт", "body": ""},
                  {"token": "tok-b", "title": "Отчёт", "body": ""}]

        armed, dropped = await self.arm("item-1", "ev-1", routes)
        self.assertEqual((armed, dropped), (2, []))
        # Two devices arming the same reminder must not produce two messages.
        armed, _ = await self.arm("item-1", "ev-1", routes)
        self.assertEqual(armed, 0)
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 2)

        await self.server._deliver_notifications()
        self.assertEqual(sorted(chat for chat, _ in self.bot.sent), ["chat-a", "chat-b"])

        await self.server._deliver_notifications()
        self.assertEqual(len(self.bot.sent), 2)

    async def test_one_blocked_recipient_does_not_block_the_rest(self):
        self.notify.link("tok-a", "chat-a", "A")
        self.notify.link("tok-b", "chat-b", "B")
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
        self.notify.link("tok-a", "chat-a", "A")
        self.notify.link("tok-b", "chat-b", "B")
        routes = [{"token": "tok-a", "title": "T", "body": ""},
                  {"token": "tok-b", "title": "T", "body": ""}]
        self.assertEqual((await self.arm("item-1", "ev-1", routes))[0], 2)
        # The same event, one recipient fewer: the removed one must not get the message.
        self.assertEqual((await self.arm("item-1", "ev-1", routes[:1]))[0], 0)
        await self.server._deliver_notifications()
        self.assertEqual([chat for chat, _ in self.bot.sent], ["chat-a"])

    async def test_unlinked_token_is_dropped_not_queued(self):
        armed, dropped = await self.arm("item-1", "ev-1", [{"token": "nobody", "title": "T", "body": ""}])
        self.assertEqual(armed, 0)
        self.assertEqual(dropped, [{"token": "nobody", "reason": "not_linked"}])
        self.assertEqual(self.db.count_notify_jobs("vault-1"), 0)

    async def test_stale_reminder_is_dropped_instead_of_delivered(self):
        self.notify.link("tok-a", "chat-a", "A")
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": ""}],
                       fire_at=time.time() - NOTIFY_STALE_SECONDS - 60)
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
        self.notify.link("tok-a", "987654321000")
        self.db.create_notify_invite("vault-1", "abc123def456", "tok-b")
        conn = sqlite3.connect(self.db_path)
        try:
            dump = "\n".join(conn.iterdump())
        finally:
            conn.close()
        self.assertNotIn("987654321000", dump)
        self.assertIn("987654321000", "\n".join(self.notify.conn.iterdump()))

    async def test_forbidden_bot_marks_route_and_stops(self):
        self.notify.link("tok-a", "chat-a", "A")
        await self.arm("item-1", "ev-1", [{"token": "tok-a", "title": "T", "body": ""}])
        self.bot.failure = {"ok": False, "error_code": 403, "description": "Forbidden: bot was blocked by the user"}
        await self.server._deliver_notifications()
        self.assertIsNotNone(self.notify.get("tok-a")["blocked_at"])
        self.bot.failure = None
        await self.server._deliver_notifications()
        self.assertEqual(self.bot.sent, [])


if __name__ == "__main__":
    unittest.main()
