#!/usr/bin/env python3
"""Notification queue, delivery and Telegram binding.

The interesting invariants are all in storage and in the two loops, not in the HTTP
plumbing: (route, event) is the dedup key, a stale reminder is dropped instead of
delivered, one blocked recipient never blocks another, and a chat id never reaches the
relay database.
"""

import asyncio
import http.client
import json
import os
import shutil
import sqlite3
import tempfile
import time
import unittest
import unittest.mock

from server import (
    ApiError,
    ASSISTANT_ACTION_STALE,
    ASSISTANT_CARD_CHIP_MAX,
    NOTIFY_MAX_PER_HOUR_PER_ROUTE,
    NOTIFY_STALE_SECONDS,
    RelayDatabase,
    SlagRelayServer,
    TG_EXPANDABLE_AFTER,
    TG_TEXT_BUDGET,
    TG_TEXT_LIMIT,
    assistant_card_block,
    render_notification,
)
from tg import render_answer_links, render_note_page
import tg


def sample_action() -> dict:
    """What the app sends with an answer: a caption, a summary and an opaque payload."""
    return {"id": "create-note", "label": "Применить",
            "summary": "«Купить кота», 14 ноя, Личное",
            "payload": {"itemKey": "item-1", "folder": "Личное"}}


def sample_card_action() -> dict:
    """The same action from a device new enough to word the whole card."""
    action = sample_action()
    action["label"] = "Сохранить"
    action["card"] = {"kind": "Черновик таски", "folder": "Входящие",
                      "title": "Свозить кошку в ветклинику", "due": "пн, 16 ноя",
                      "priority": "medium", "actionLabel": "Сохранить"}
    return action


class FakeBot:
    """Stands in for the Bot API: records sends and edits, can fail on demand."""

    def __init__(self):
        self.username = "test_bot"
        self.sent: list[tuple[str, str]] = []
        self.edits: list[tuple[str, int, str]] = []
        self.actions: list[str] = []
        self.calls: list[dict] = []
        # A tap has to be acknowledged even when nothing happens: the person sees a spinning
        # button until `answerCallbackQuery` lands.
        self.callbacks: list[dict] = []
        self.markup_edits: list[dict] = []
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
        if method == "editMessageText":
            self.calls.append(dict(payload))
            if self.failure:
                return False, dict(self.failure)
            if self.reject_markup and payload.get("parse_mode"):
                return False, {"ok": False, "error_code": 400,
                               "description": "Bad Request: can't parse entities"}
            self.edits.append((str(payload["chat_id"]), int(payload["message_id"]), str(payload["text"])))
            return True, {"ok": True, "result": {"message_id": payload["message_id"]}}
        if method == "editMessageReplyMarkup":
            self.calls.append(dict(payload))
            if self.failure:
                return False, dict(self.failure)
            self.markup_edits.append(dict(payload))
            return True, {"ok": True, "result": True}
        if method == "answerCallbackQuery":
            self.callbacks.append(dict(payload))
            return True, {"ok": True, "result": True}
        if method == "sendChatAction":
            self.actions.append(str(payload.get("action")))
            return True, {"ok": True, "result": True}
        if method == "getMe":
            return True, {"ok": True, "result": {"username": self.username}}
        return True, {"ok": True, "result": []}


class FakeDevice:
    """A live socket: answers the relay's probe after `delay` and records every frame it gets."""

    def __init__(self, device_id: str, vault_id: str, server=None,
                 delay: float = 0.0, ai_ready: bool = True, answers: bool = True):
        self.device_id = device_id
        self.vault_id = vault_id
        self.room_id = f"room-{device_id}"
        self.closed = False
        self.token_hash = None
        self.delay = delay
        self.ai_ready = ai_ready
        self.answers = answers
        self.frames: list[str] = []
        self.server = server

    def questions(self) -> list[str]:
        return [frame for frame in self.frames if '"assistant_question"' in frame]

    async def send_text(self, text: str) -> None:
        self.frames.append(text)
        payload = json.loads(text)
        if payload.get("type") != "assistant_probe" or self.server is None or not self.answers:
            return
        if self.delay:
            await asyncio.sleep(self.delay)
        await self.server._handle_ws_message(self, json.dumps({
            "type": "assistant_probe_ack", "id": payload["id"], "aiReady": self.ai_ready}))


class _FakeResponse:
    def __init__(self, body: bytes, status: int = 200):
        self._body = body
        self.status = status
        self.will_close = False

    def read(self) -> bytes:
        return self._body


class _FlakyConnection:
    """An idle keep-alive socket the server already dropped: the first request raises."""

    made = 0
    fail_first = False

    def __init__(self, host=None, timeout=None, context=None):
        _FlakyConnection.made += 1
        self.timeout = timeout

    def request(self, method, path, body=None, headers=None):
        if _FlakyConnection.fail_first:
            _FlakyConnection.fail_first = False
            raise http.client.RemoteDisconnected("the server closed the keep-alive")

    def getresponse(self):
        return _FakeResponse(b'{"ok": true, "result": {"message_id": 7}}')

    def close(self):
        pass


class _UnreachableConnection(_FlakyConnection):
    def request(self, method, path, body=None, headers=None):
        # The token sits in the path, exactly like it does in the real request URL.
        raise OSError(f"cannot connect to {path}")


class TelegramClientTestCase(unittest.TestCase):
    """Reused sockets are the point; a stale one must cost a retry, never a message."""

    def setUp(self):
        _FlakyConnection.made = 0
        _FlakyConnection.fail_first = False

    def test_a_stale_keep_alive_costs_one_retry_not_the_message(self):
        _FlakyConnection.fail_first = True
        with unittest.mock.patch("http.client.HTTPSConnection", _FlakyConnection):
            ok, body = tg.TelegramBot("42:secret")._request("sendMessage", {"chat_id": "1"}, 5)
        self.assertTrue(ok)
        self.assertEqual(body["result"]["message_id"], 7)
        self.assertEqual(_FlakyConnection.made, 2)

    def test_the_next_call_reuses_the_idle_socket(self):
        with unittest.mock.patch("http.client.HTTPSConnection", _FlakyConnection):
            bot = tg.TelegramBot("42:secret")
            bot._request("sendMessage", {"chat_id": "1"}, 5)
            bot._request("sendMessage", {"chat_id": "1"}, 5)
        self.assertEqual(_FlakyConnection.made, 1)

    def test_an_unreachable_api_is_an_error_and_the_token_stays_out_of_it(self):
        with unittest.mock.patch("http.client.HTTPSConnection", _UnreachableConnection):
            ok, body = tg.TelegramBot("42:secret")._request("sendMessage", {"chat_id": "1"}, 5)
        self.assertFalse(ok)
        self.assertEqual(body["error_code"], 0)
        self.assertIn("<bot-token>", body["description"])
        self.assertNotIn("42:secret", body["description"])


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

    def test_answer_note_link_points_at_the_one_page_telegram_keeps(self):
        html = render_answer_links("Нашёл [[Игра на жестах: общение с NPC]] — про NPC.",
                                   "http://relay:8320")
        # Telegram keeps a link entity only for http(s): the relay's own page is the hop that
        # can hand the slag:// scheme to the device, so the answer points there.
        self.assertIn('<a href="http://relay:8320/n?title=', html)
        self.assertIn(">Игра на жестах: общение с NPC</a>", html)
        self.assertNotIn("[[", html)
        href = html.split('href="', 1)[1].split('"', 1)[0]
        self.assertNotIn(" ", href)

    def test_answer_around_a_link_stays_escaped(self):
        html = render_answer_links("[[a < b]] и <b>жирный</b>", "http://relay:8320")
        self.assertIn(">a &lt; b</a>", html)
        self.assertIn("&lt;b&gt;жирный&lt;/b&gt;", html)
        # An unclosed or empty bracket is text, not a link.
        self.assertEqual(render_answer_links("просто [[текст"), "просто [[текст")
        self.assertEqual(render_answer_links("[[]]"), "[[]]")

    def test_a_link_with_nowhere_to_point_is_just_a_title(self):
        # No base URL, no link: the title still must not keep the brackets a model wrote.
        self.assertEqual(render_answer_links("Нашёл [[Заметка]] тут"), "Нашёл Заметка тут")

    def test_the_hand_off_page_carries_only_the_title(self):
        page = render_note_page("<b>Заметка</b> & ко")
        self.assertIn("&lt;b&gt;Заметка&lt;/b&gt; &amp; ко", page)
        self.assertIn('href="slag://note?title=%3Cb%3E', page)
        self.assertNotIn("<script", page)

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

    def test_card_head_collapses_instead_of_leaving_empty_chrome(self):
        # No kind, no folder: an empty chip or a bare "·" would be a card describing nothing.
        self.assertEqual(assistant_card_block({"card": {"title": "Забрать посылку"}}),
                         "<blockquote><b>Забрать посылку</b></blockquote>")

    def test_a_folder_too_long_to_be_a_chip_is_cut_not_wrapped(self):
        block = assistant_card_block({"card": {"title": "т", "folder": "щ" * 90}})
        head = block.split("\n")[0]
        self.assertTrue(head.startswith("<code>") and head.endswith("…</code>"))
        self.assertLessEqual(len(head) - len("<code></code>"), ASSISTANT_CARD_CHIP_MAX + 1)


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

    async def test_one_live_code_per_vault(self):
        self.db.create_notify_invite("vault-1", "firstcode123", "token-1")
        self.db.create_notify_invite("vault-1", "secondcode45", "token-2")
        # The app shows one channel and one code: asking again must revoke the old one.
        self.assertEqual(self.db.pending_notify_invites("vault-1"), 1)
        self.assertIsNone(self.db.get_notify_invite("firstcode123"))
        self.assertIsNotNone(self.db.get_notify_invite("secondcode45"))

        # A redeemed code is history, not a pending one: it must not be swept by the next request.
        self.db.redeem_notify_invite("secondcode45")
        self.db.create_notify_invite("vault-1", "thirdcode678", "token-3")
        self.assertIsNotNone(self.db.get_notify_invite("secondcode45"))

    async def test_channel_state_answers_the_same_for_unknown_and_foreign(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.assertEqual(self.server._notify_channel_state("vault-1", "tok-a"), "active")
        self.assertEqual(self.server._notify_channel_state("vault-1", "tok-unknown"), "pending")
        self.assertEqual(self.server._notify_channel_state("vault-2", "tok-a"), "pending")
        self.notify.block_route("tok-a")
        self.assertEqual(self.server._notify_channel_state("vault-1", "tok-a"), "blocked")

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

    async def test_start_in_a_linked_chat_shows_the_vault_and_the_person(self):
        with self.db.conn:
            self.db.conn.execute(
                "INSERT OR REPLACE INTO vaults (id, name, owner_account_id, created_at, updated_at)"
                " VALUES ('vault_3721cd28-be7a-47f9-aa71-267d341b5121', 'main',"
                " 'acc_28ec1766232017b19a8a7043', ?, ?)", (time.time(), time.time()))
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault_3721cd28-be7a-47f9-aa71-267d341b5121", True)
        await self.server._handle_bot_update({"update_id": 11, "message": {
            "chat": {"id": "chat-a", "type": "private"},
            "from": {"id": "chat-a", "first_name": "Мория", "username": "morii"},
            "text": "/start"}})
        html = self.bot.sent[-1][1]
        # Short, like the app: a name and the four characters that tell two vaults apart.
        self.assertIn("main", html)
        self.assertIn("• <code>5121</code>", html)
        self.assertIn("аккаунт • <code>7043</code>", html)
        self.assertIn("ассистент вкл", html)
        self.assertNotIn("приглашение", html)

    async def test_start_shows_the_profile_name_when_the_account_has_one(self):
        vault_id = "vault_3721cd28-be7a-47f9-aa71-267d341b5121"
        account_id = "acc_28ec1766232017b19a8a7043"
        with self.db.conn:
            self.db.conn.execute(
                "INSERT OR REPLACE INTO accounts (account_id, public_key, plan, created_at)"
                " VALUES (?, ?, 'smile', ?)", (account_id, f"pk-{account_id}", time.time()))
            self.db.conn.execute(
                "INSERT OR REPLACE INTO vaults (id, name, owner_account_id, created_at, updated_at)"
                " VALUES (?, 'main', ?, ?, ?)", (vault_id, account_id, time.time(), time.time()))
        self.db.set_display_name(account_id, "дава")
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", vault_id, True)
        await self.server._handle_bot_update({"update_id": 13, "message": {
            "chat": {"id": "chat-a", "type": "private"}, "from": {"id": "chat-a"}, "text": "/start"}})
        html = self.bot.sent[-1][1]
        # Name on the first line, the vault on the second: the person, then where they are.
        self.assertIn("<b>дава</b> • <code>7043</code>", html)
        self.assertIn("main • <code>5121</code>", html)

    async def test_start_without_a_link_still_points_at_the_app(self):
        await self.server._handle_bot_update({"update_id": 12, "message": {
            "chat": {"id": "chat-1", "type": "private"}, "from": {"id": "chat-1"}, "text": "/start"}})
        self.assertIn("приглашение", self.bot.sent[-1][1])

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

    async def test_assistant_request_does_not_store_the_chat_id(self):
        """The whole point of the two databases: a question must not rebuild the vault↔chat link."""
        self.notify.link("tok-a", "987654321000", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        self.server.rooms["room-1"] = {FakeDevice("dev-1", "vault-1", server=self.server)}
        await self.server._bot_question("987654321000", "секрет")
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])
        conn = sqlite3.connect(self.db_path)
        try:
            dump = "\n".join(conn.iterdump())
        finally:
            conn.close()
        self.assertNotIn("987654321000", dump)
        self.assertEqual(request["route_token"], "tok-a")

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
        # No device answered the probe: the bubble says so, and the question is held for the
        # pending poll instead of being dropped — a silent socket is not a silent device.
        self.assertIn("молчит", self.bot.edits[-1][2])
        self.assertEqual(len(self.db.pending_assistant_requests("vault-1", time.time())), 1)

    async def test_answer_reaches_the_chat_exactly_once(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.assertTrue((await self.server._answer_assistant("vault-1", request_id, "ответ"))["delivered"])
        self.assertEqual(self.bot.sent[-1], ("chat-a", "ответ"))
        # A second device losing the race is the normal outcome, not a 404 in the device log.
        again = await self.server._answer_assistant("vault-1", request_id, "ещё раз")
        self.assertEqual(again, {"delivered": False, "reason": "already"})
        self.assertEqual(self.bot.sent[-1], ("chat-a", "ответ"))

    async def test_question_text_never_survives_the_answer(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "секретный вопрос")
        await self.server._answer_assistant("vault-1", request_id, "ответ")
        self.assertEqual(self.db.get_assistant_request(request_id)["question"], "")

    async def settle(self):
        """Waits for detached stage edits: they are deliberately not awaited by the question path."""
        tasks = list(self.server.stage_tasks)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def test_placeholder_is_edited_in_place_instead_of_a_second_message(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True, "minimal")
        device = FakeDevice("dev-1", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {device}
        await self.server._bot_question("chat-a", "что по задачам?", 501)
        self.assertIn("ищу устройство", self.bot.sent[-1][1])
        await self.settle()
        self.assertIn("передал", self.bot.edits[-1][2])
        self.assertEqual(len(device.questions()), 1)
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.assertEqual(request["mode"], "minimal")
        self.assertEqual(request["question_message_id"], 501)
        self.assertIsNotNone(request["placeholder_message_id"])
        sends_before = len(self.bot.sent)
        await self.server._answer_assistant("vault-1", request["id"], "на связи")
        self.assertEqual(self.bot.edits[-1][1], request["placeholder_message_id"])
        self.assertEqual(len(self.bot.sent), sends_before)

    async def test_device_reports_when_the_model_starts_and_the_bubble_says_so(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        device = FakeDevice("dev-1", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {device}
        await self.server._bot_question("chat-a", "что по задачам?")
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        await self.server._handle_assistant_stage(device, {"id": request["id"], "stage": "thinking"})
        await self.settle()
        self.assertIn("печатает", self.bot.edits[-1][2])
        # The same bubble, from the first status to the answer: one message, no second one.
        self.assertEqual(self.bot.edits[-1][1], request["placeholder_message_id"])
        await self.server._answer_assistant("vault-1", request["id"], "ответ")
        edits_before = len(self.bot.edits)
        # A late stage from a slow device must not overwrite an answer already delivered.
        await self.server._handle_assistant_stage(device, {"id": request["id"], "stage": "thinking"})
        await self.settle()
        self.assertEqual(len(self.bot.edits), edits_before)
        # And a device from another vault cannot rewrite somebody else's bubble either.
        stranger = FakeDevice("dev-2", "vault-2", server=self.server)
        await self.server._handle_assistant_stage(stranger, {"id": request["id"], "stage": "thinking"})
        self.assertEqual(len(self.bot.edits), edits_before)

    async def test_probe_gives_the_question_to_the_fastest_device(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        slow = FakeDevice("dev-slow", "vault-1", server=self.server, delay=0.05)
        fast = FakeDevice("dev-fast", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {slow, fast}
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertEqual(len(fast.questions()), 1)
        self.assertEqual(slow.questions(), [])
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_probe_skips_a_socket_that_never_answers(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        asleep = FakeDevice("dev-asleep", "vault-1", server=self.server, answers=False)
        awake = FakeDevice("dev-awake", "vault-1", server=self.server, delay=0.02)
        self.server.rooms["room-1"] = {asleep, awake}
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertEqual(len(awake.questions()), 1)
        self.assertEqual(asleep.questions(), [])
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_a_device_without_a_model_does_not_steal_the_turn(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        # Faster, but it has no key and no lease: its answer would be the bare task summary.
        blind = FakeDevice("dev-blind", "vault-1", server=self.server, ai_ready=False)
        able = FakeDevice("dev-able", "vault-1", server=self.server, delay=0.02, ai_ready=True)
        self.server.rooms["room-1"] = {blind, able}
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertEqual(len(able.questions()), 1)
        self.assertEqual(blind.questions(), [])
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_one_device_is_not_an_election(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        only = FakeDevice("dev-1", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {only}
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertFalse(any('"assistant_probe"' in frame for frame in only.frames))
        self.assertEqual(len(only.questions()), 1)
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_a_silent_socket_is_not_probed(self):
        """A suspended app holds its socket open and answers nothing, so it is skipped, not waited on."""
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        awake = FakeDevice("dev-awake", "vault-1", server=self.server)
        asleep = FakeDevice("dev-asleep", "vault-1", server=self.server)
        # Silent for far longer than the presence window: its pings stopped, the app is gone.
        asleep.last_frame_at = time.monotonic() - 5 * 60
        self.server.rooms["room-1"] = {awake, asleep}
        await self.server._bot_question("chat-a", "что по задачам?")
        # No probe at all: with one living device the question goes out immediately.
        self.assertFalse(any('"assistant_probe"' in frame for frame in awake.frames))
        self.assertEqual(len(awake.questions()), 1)
        self.assertEqual(asleep.questions(), [])
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_a_device_that_stopped_syncing_does_not_answer(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        now = time.time()
        with self.db.conn:
            self.db.conn.execute(
                "INSERT INTO rooms (room_id, created_at, last_active_at, vault_id) VALUES ('room-1', ?, ?, 'vault-1')",
                (now, now))
            # The pusher wrote the newest bundle, so its own copy is current by definition.
            self.db.conn.execute(
                "INSERT INTO bundles (bundle_id, room_id, from_device_id, sequence, timestamp, payload,"
                " created_at, expires_at) VALUES ('b-1', 'room-1', 'dev-current', 1, '', '{}', ?, ?)",
                (now, now + 3600))
        current = FakeDevice("dev-current", "vault-1", server=self.server)
        stale = FakeDevice("dev-stale", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {current, stale}
        await self.server._bot_question("chat-a", "что по задачам?")
        # An answer from a day-old copy is a lie about the vault, not a slow answer.
        self.assertEqual(stale.questions(), [])
        self.assertEqual(len(current.questions()), 1)
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_a_room_that_went_quiet_is_still_probed(self):
        """Nothing fresh is not the same as nobody there: the probe is the last presence test."""
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        quiet = FakeDevice("dev-quiet", "vault-1", server=self.server)
        quiet.last_frame_at = time.monotonic() - 5 * 60
        self.server.rooms["room-1"] = {quiet}
        await self.server._bot_question("chat-a", "что по задачам?")
        self.assertTrue(any('"assistant_probe"' in frame for frame in quiet.frames))
        self.assertEqual(len(quiet.questions()), 1)
        request = self.db.conn.execute("SELECT * FROM assistant_requests").fetchone()
        self.server._stop_typing(request["id"])

    async def test_no_device_awake_keeps_the_question_for_the_poll(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True, "risky")
        asleep_a = FakeDevice("dev-a", "vault-1", server=self.server, answers=False)
        asleep_b = FakeDevice("dev-b", "vault-1", server=self.server, answers=False)
        self.server.rooms["room-1"] = {asleep_a, asleep_b}
        await self.server._bot_question("chat-a", "что по задачам?")
        # A socket that does not answer the probe is not proof that nobody can answer: the device
        # may still poll `/api/assistant/pending`, so the question is held, not thrown away.
        pending = self.db.pending_assistant_requests("vault-1", time.time())
        self.assertEqual([row["question"] for row in pending], ["что по задачам?"])
        self.assertIn("молчит", self.bot.edits[-1][2])
        self.assertEqual(asleep_a.questions(), [])

    async def test_clear_command_reaches_every_live_device_of_the_vault(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        first = FakeDevice("dev-1", "vault-1", server=self.server)
        second = FakeDevice("dev-2", "vault-1", server=self.server)
        stranger = FakeDevice("dev-3", "vault-2", server=self.server)
        self.server.rooms["room-1"] = {first, second}
        self.server.rooms["room-2"] = {stranger}
        await self.server._handle_bot_update({"update_id": 9, "message": {
            "chat": {"id": "chat-a", "type": "private"}, "from": {"id": "chat-a"}, "text": "/clear"}})
        clears = [frame for frame in first.frames if '"assistant_clear"' in frame]
        self.assertEqual(len(clears), 1)
        self.assertEqual(len([frame for frame in second.frames if '"assistant_clear"' in frame]), 1)
        # Another vault's device must not be told to forget somebody else's conversation.
        self.assertEqual(stranger.frames, [])
        self.assertIn("забыл", self.bot.sent[-1][1])
        # A clear is not a question: nothing is left waiting for an answer that will never come.
        self.assertEqual(self.db.pending_assistant_requests("vault-1", time.time()), [])

    async def test_clear_says_so_when_no_device_can_forget(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        await self.server._handle_bot_update({"update_id": 10, "message": {
            "chat": {"id": "chat-a", "type": "private"}, "from": {"id": "chat-a"}, "text": "/clear"}})
        # The thread lives on the devices, so a clear with none of them online is a refusal, not a
        # cheerful lie that the conversation is gone.
        self.assertIn("не в сети", self.bot.sent[-1][1])
        self.assertNotIn("забыл", self.bot.sent[-1][1])

    async def test_question_falls_back_to_a_fresh_message_when_the_placeholder_dies(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.db.set_assistant_placeholder(request_id, 77)
        self.bot.failure = {"ok": False, "error_code": 400, "description": "message to edit not found"}
        result = await self.server._answer_assistant("vault-1", request_id, "ответ")
        self.assertFalse(result["delivered"])

    async def test_pending_lists_what_a_reconnecting_device_missed(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True, "risky")
        live = self.db.create_assistant_request("vault-1", "tok-a", "первый", mode="risky")
        self.db.create_assistant_request("vault-1", "tok-a", "второй")
        await self.server._answer_assistant("vault-1", live, "ответ")
        pending = self.db.pending_assistant_requests("vault-1", time.time())
        self.assertEqual([row["question"] for row in pending], ["второй"])
        self.assertEqual(pending[0]["mode"], "minimal")

    async def test_expiry_rewrites_the_placeholder_and_names_the_retry(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.db.set_assistant_placeholder(request_id, 88)
        with self.db.conn:
            self.db.conn.execute("UPDATE assistant_requests SET expires_at = ? WHERE id = ?",
                                 (time.time() - 1, request_id))
        await self.server._expire_assistant_requests()
        self.assertEqual(self.bot.edits[-1][:2], ("chat-a", 88))
        self.assertIn("не ответило", self.bot.edits[-1][2])
        self.assertIn("ещё раз", self.bot.edits[-1][2])

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
        await self.server._expire_assistant_requests()
        self.assertIn("не ответило", self.bot.sent[-1][1])
        self.assertIsNotNone(self.db.get_assistant_request(request_id)["answered_at"])


    async def tap(self, chat_id: str, data: str, callback_id: str = "cb-1") -> None:
        await self.server._handle_bot_update({"update_id": 21, "callback_query": {
            "id": callback_id, "data": data,
            "message": {"chat": {"id": chat_id, "type": "private"}, "message_id": 77}}})

    async def test_answer_with_an_action_carries_one_button_for_that_request(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 14-е?")
        self.assertTrue((await self.server._answer_assistant(
            "vault-1", request_id, "предлагаю «Купить кота»", action=sample_action()))["delivered"])
        button = self.bot.calls[-1]["reply_markup"]["inline_keyboard"][0][0]
        # The button carries the request, never the payload: callback data is a plain string that
        # anyone can replay, so the action stays where a tap cannot rewrite it.
        # Bot API 9.4 colours a button; there is no palette, only success/primary/danger.
        self.assertEqual(button["text"], "Применить")
        self.assertEqual(button["style"], "success")
        self.assertEqual(button["callback_data"], f"act:{request_id}")
        self.assertEqual(self.db.get_assistant_request(request_id)["answer_text"],
                         "предлагаю «Купить кота»")

    async def test_answer_card_reads_like_the_app_and_offers_both_answers(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 16-е?")
        await self.server._answer_assistant("vault-1", request_id, "готово, записал.",
                                            action=sample_card_action(), answered_by="dev-1")
        html = str(self.bot.calls[-1]["text"])
        # The bar wraps the title alone: the line that gets saved outranks its own metadata,
        # and the folder is the one field that can afford a second texture.
        lines = html.split("\n")
        self.assertEqual(lines[-3], "Черновик таски · <code>Входящие</code>")
        self.assertEqual(lines[-2], "<blockquote><b>Свозить кошку в ветклинику</b></blockquote>")
        self.assertEqual(lines[-1], "пн, 16 ноя · 🟡 MEDIUM")
        self.assertLess(html.index("пн, 16 ноя"), html.index("MEDIUM"))
        self.assertNotIn("MEDIUM</blockquote>", html)
        row = self.bot.calls[-1]["reply_markup"]["inline_keyboard"][0]
        self.assertEqual([button["text"] for button in row], ["Сохранить", "Отклонить"])
        # Green commits, grey refuses: no `style` key at all is what Telegram draws neutral.
        self.assertEqual(row[0]["style"], "success")
        self.assertNotIn("style", row[1])
        self.assertEqual(row[0]["callback_data"], f"act:{request_id}")
        self.assertEqual(row[1]["callback_data"], f"drop:{request_id}")

    async def test_a_card_from_an_old_device_draws_no_blockquote(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 16-е?")
        await self.server._answer_assistant("vault-1", request_id, "готово",
                                            action=sample_action(), answered_by="dev-1")
        self.assertNotIn("<blockquote>", str(self.bot.calls[-1]["text"]))
        row = self.bot.calls[-1]["reply_markup"]["inline_keyboard"][0]
        self.assertEqual([button["text"] for button in row], ["Применить", "Отклонить"])
        self.assertEqual(row[0]["style"], "success")
        self.assertNotIn("style", row[1])

    async def test_dismiss_kills_the_action_and_a_late_tap_is_stale(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 16-е?")
        await self.server._answer_assistant("vault-1", request_id, "готово, записал.",
                                            action=sample_card_action(), answered_by="dev-1")
        device = FakeDevice("dev-1", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {device}
        await self.tap("chat-a", f"drop:{request_id}")
        self.assertIn("не сохраняю", self.bot.callbacks[-1]["text"])
        self.assertEqual(self.bot.calls[-1]["reply_markup"], {"inline_keyboard": []})
        # The answer stays, the card goes: refusing a note is not refusing the answer.
        self.assertIn("готово, записал.", str(self.bot.calls[-1]["text"]))
        self.assertIn("отклонено", str(self.bot.calls[-1]["text"]))
        self.assertNotIn("<blockquote>", str(self.bot.calls[-1]["text"]))
        self.assertIsNone(self.db.get_assistant_request(request_id)["action_json"])
        # A button left on screen now names an action that no longer exists.
        await self.tap("chat-a", f"act:{request_id}", callback_id="cb-2")
        self.assertEqual(self.bot.callbacks[-1]["text"], ASSISTANT_ACTION_STALE)
        self.assertEqual([f for f in device.frames if '"assistant_action"' in f], [])

    async def test_a_server_that_refuses_buttons_still_delivers_them_without_a_colour(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 16-е?")
        # An older Bot API server refuses the whole message over the `style` field it never had.
        self.bot.reject_markup = True
        await self.server._answer_assistant("vault-1", request_id, "готово",
                                            action=sample_card_action(), answered_by="dev-1")
        fallback = self.bot.calls[-1]["reply_markup"]["inline_keyboard"][0]
        self.assertEqual([button["text"] for button in fallback], ["Сохранить", "Отклонить"])
        self.assertNotIn("style", fallback[0])
        self.assertEqual(fallback[0]["callback_data"], f"act:{request_id}")
        self.assertTrue(self.bot.sent)

    async def test_answer_without_an_action_has_no_keyboard_at_all(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 14-е?")
        await self.server._answer_assistant("vault-1", request_id, "просто ответ")
        # An empty keyboard is not "no button": it is an edit that strips a keyboard that exists.
        self.assertNotIn("reply_markup", self.bot.calls[-1])

    async def test_action_tap_goes_to_the_device_that_wrote_the_answer(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 14-е?")
        action = sample_action()
        await self.server._answer_assistant("vault-1", request_id, "предлагаю", action=action,
                                            answered_by="dev-1")
        first = FakeDevice("dev-1", "vault-1", server=self.server)
        second = FakeDevice("dev-2", "vault-1", server=self.server)
        stranger = FakeDevice("dev-3", "vault-2", server=self.server)
        self.server.rooms["room-1"] = {first, second}
        self.server.rooms["room-2"] = {stranger}
        await self.tap("chat-a", f"act:{request_id}")
        frames = [json.loads(frame) for frame in first.frames if '"assistant_action"' in frame]
        self.assertEqual(frames, [{"type": "assistant_action", "id": request_id, "action": action}])
        # One tap must not become one note per machine: the second device never hears about it.
        self.assertEqual([f for f in second.frames if '"assistant_action"' in f], [])
        # Another vault's device is not the one that offered the action.
        self.assertEqual(stranger.frames, [])
        self.assertEqual(self.bot.callbacks[-1]["callback_query_id"], "cb-1")
        self.assertIn("передал", self.bot.callbacks[-1]["text"])
        outcomes = [row["outcome"] for row in self.db.conn.execute(
            "SELECT outcome FROM delivery_events WHERE kind = 'assistant.action' ORDER BY id")]
        self.assertEqual(outcomes, ["requested", "dispatched"])

    async def test_a_tap_falls_back_when_the_answering_device_is_gone(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "что на 14-е?")
        await self.server._answer_assistant("vault-1", request_id, "предлагаю",
                                           action=sample_action(), answered_by="dev-gone")
        other = FakeDevice("dev-2", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {other}
        await self.tap("chat-a", f"act:{request_id}")
        # A button that silently does nothing is worse than one a sibling device picks up.
        self.assertEqual(len([f for f in other.frames if '"assistant_action"' in f]), 1)

    async def test_a_tap_from_another_chat_or_an_old_request_sends_nothing(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        await self.server._answer_assistant("vault-1", request_id, "ответ", action=sample_action())
        device = FakeDevice("dev-1", "vault-1", server=self.server)
        self.server.rooms["room-1"] = {device}
        # The same string from another chat: callback data is not a capability.
        await self.tap("chat-b", f"act:{request_id}", "cb-foreign")
        self.assertEqual([f for f in device.frames if '"assistant_action"' in f], [])
        self.assertEqual(self.bot.callbacks[-1]["callback_query_id"], "cb-foreign")
        self.assertIn("устарел", self.bot.callbacks[-1]["text"])
        # The window closed before the tap.
        with self.db.conn:
            self.db.conn.execute("UPDATE assistant_requests SET expires_at = ? WHERE id = ?",
                                 (time.time() - 1, request_id))
        await self.tap("chat-a", f"act:{request_id}", "cb-old")
        self.assertEqual([f for f in device.frames if '"assistant_action"' in f], [])
        self.assertEqual(self.bot.callbacks[-1]["callback_query_id"], "cb-old")
        self.assertIn("устарел", self.bot.callbacks[-1]["text"])

    async def test_a_tap_on_something_the_relay_never_sent_is_still_answered(self):
        for data in ("act:", "act:ask_nothing", "hello"):
            await self.tap("chat-a", data, "cb-junk")
            self.assertEqual(self.bot.callbacks[-1]["callback_query_id"], "cb-junk")

    async def test_applied_appends_the_outcome_and_takes_the_button_away(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.db.set_assistant_placeholder(request_id, 42)
        await self.server._answer_assistant("vault-1", request_id, "предлагаю «Купить кота»",
                                            action=sample_action())
        result = await self.server._apply_assistant_action("vault-1", request_id, True, "задача создана")
        self.assertEqual(result, {"applied": True, "edited": True})
        chat_id, message_id, text = self.bot.edits[-1]
        self.assertEqual((chat_id, message_id), ("chat-a", 42))
        self.assertIn("предлагаю «Купить кота»", text)
        self.assertIn("✓ применено: задача создана", text)
        self.assertEqual(self.bot.calls[-1]["reply_markup"], {"inline_keyboard": []})
        # A retry — a lost response, a double submit — must not append the line twice.
        again = await self.server._apply_assistant_action("vault-1", request_id, True, "ещё раз")
        self.assertEqual(again, {"applied": False, "reason": "already"})
        self.assertEqual(sum("ещё раз" in edit[2] for edit in self.bot.edits), 0)
        self.assertIsNotNone(self.db.get_assistant_request(request_id)["applied_at"])

    async def test_a_refused_apply_is_written_as_a_failure(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.db.set_assistant_placeholder(request_id, 42)
        await self.server._answer_assistant("vault-1", request_id, "ответ", action=sample_action())
        await self.server._apply_assistant_action("vault-1", request_id, False, "нет прав")
        self.assertIn("не вышло: нет прав", self.bot.edits[-1][2])
        outcomes = [row["outcome"] for row in self.db.conn.execute(
            "SELECT outcome FROM delivery_events WHERE kind = 'assistant.action' ORDER BY id")]
        self.assertEqual(outcomes, ["requested", "apply_failed"])

    async def test_an_old_request_loses_the_button_even_without_the_stored_text(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        self.db.set_assistant_placeholder(request_id, 42)
        # A row answered before the relay learned to keep its text: only the keyboard can go.
        with self.db.conn:
            self.db.conn.execute("UPDATE assistant_requests SET action_json = ? WHERE id = ?",
                                 (json.dumps(sample_action()), request_id))
        result = await self.server._apply_assistant_action("vault-1", request_id, True, "готово")
        self.assertTrue(result["applied"])
        self.assertEqual(self.bot.edits, [])
        self.assertEqual(self.bot.markup_edits[-1]["reply_markup"], {"inline_keyboard": []})

    async def test_applied_from_another_vault_is_refused(self):
        self.notify.link("tok-a", "chat-a", "A", self.tag)
        self.db.set_assistant_link("tok-a", "vault-1", True)
        request_id = self.db.create_assistant_request("vault-1", "tok-a", "вопрос")
        with self.assertRaises(ApiError):
            await self.server._apply_assistant_action("vault-2", request_id, True, "чужое")
        self.assertEqual(self.bot.edits, [])

    async def test_an_action_the_relay_cannot_render_is_refused(self):
        for broken in ("Применить", {}, {"id": "x"}, {"label": "   "}):
            with self.assertRaises(ApiError):
                SlagRelayServer._validate_assistant_action(broken)
        self.assertEqual(SlagRelayServer._validate_assistant_action(sample_action()), sample_action())

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


class AssistantSchemaMigrationTestCase(unittest.TestCase):
    """An existing relay database gains the action columns without losing what it holds.

    The relay is deployed as a long-lived process next to a real sqlite file, so a schema change
    has to be an `ALTER TABLE` on a live table, not a recreate: the question in flight and its
    placeholder message id must survive the upgrade.
    """

    def test_old_rows_survive_the_action_columns(self):
        tmpdir = tempfile.mkdtemp(prefix="slag_migrate_")
        try:
            path = os.path.join(tmpdir, "relay.db")
            conn = sqlite3.connect(path)
            # The schema exactly as it shipped before an answer could offer an action.
            conn.execute(
                "CREATE TABLE assistant_requests (id TEXT PRIMARY KEY, vault_id TEXT NOT NULL,"
                " route_token TEXT NOT NULL, question TEXT NOT NULL, created_at REAL NOT NULL,"
                " expires_at REAL NOT NULL, answered_at REAL, question_message_id INTEGER,"
                " placeholder_message_id INTEGER, mode TEXT NOT NULL DEFAULT 'minimal',"
                " attempts INTEGER NOT NULL DEFAULT 1)")
            conn.execute("INSERT INTO assistant_requests (id, vault_id, route_token, question,"
                         " created_at, expires_at) VALUES ('ask_old', 'vault-1', 'tok-a', 'старый', 1, 2)")
            conn.commit()
            conn.close()
            db = RelayDatabase(path)
            try:
                columns = {row["name"] for row in db.conn.execute("PRAGMA table_info(assistant_requests)")}
                self.assertTrue({"action_json", "action_label", "answer_text", "applied_at"} <= columns)
                row = db.get_assistant_request("ask_old")
                self.assertEqual(row["question"], "старый")
                self.assertIsNone(row["action_json"])
                self.assertIsNone(row["applied_at"])
            finally:
                db.conn.close()
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
