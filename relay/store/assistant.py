"""`assistant_requests`: вопрос из бота, ответ устройства и применённый action.

Текст вопроса тут живёт до ответа или истечения и стирается в `finish_assistant_request`:
он нужен только чтобы спросить устройство, и ни для чего больше.
"""

import sqlite3
import secrets
from assistant_card import assistant_action_label
import json
import time
from typing import Optional

from settings import *


class AssistantMixin:
    def set_assistant_link(self, route_token: str, vault_id: str, enabled: bool,
                           mode: str = "minimal") -> None:
        with self.conn:
            if enabled:
                self.conn.execute(
                    "INSERT INTO assistant_links (route_token, vault_id, enabled_at, mode)"
                    " VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(route_token) DO UPDATE SET vault_id = excluded.vault_id,"
                    " mode = excluded.mode",
                    (route_token, vault_id, time.time(), mode))
            else:
                self.conn.execute("DELETE FROM assistant_links WHERE route_token = ?", (route_token,))

    def assistant_link(self, route_token: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM assistant_links WHERE route_token = ?", (route_token,)).fetchone()

    def create_assistant_request(self, vault_id: str, route_token: str, question: str,
                                 mode: str = "minimal",
                                 question_message_id: Optional[int] = None) -> str:
        request_id = f"ask_{secrets.token_hex(8)}"
        now = time.time()
        with self.conn:
            self.conn.execute(
                "INSERT INTO assistant_requests (id, vault_id, route_token, question, created_at,"
                " expires_at, mode, question_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (request_id, vault_id, route_token, question, now,
                 now + ASSISTANT_REQUEST_TTL_SECONDS, mode, question_message_id))
        return request_id

    def set_assistant_placeholder(self, request_id: str, message_id: Optional[int]) -> None:
        """The bubble the answer will overwrite. Without it the answer falls back to a new message."""
        with self.conn:
            self.conn.execute("UPDATE assistant_requests SET placeholder_message_id = ? WHERE id = ?",
                              (int(message_id) if message_id is not None else None, request_id))

    def get_assistant_request(self, request_id: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM assistant_requests WHERE id = ?", (request_id,)).fetchone()

    def finish_assistant_request(self, request_id: str) -> None:
        # The text is answered or dead by now: keeping it would turn a delivery queue into an
        # archive of somebody's questions.
        with self.conn:
            self.conn.execute("UPDATE assistant_requests SET answered_at = ?, question = ''"
                              " WHERE id = ? AND answered_at IS NULL",
                              (time.time(), request_id))

    def set_assistant_answer(self, request_id: str, text: str, action: Optional[dict],
                             answered_by: str = "") -> None:
        """What was actually sent, kept next to the request while its bubble is still editable.

        `/applied` has to append to that exact message, so the relay stores the text it rendered
        and the action it offered — the chat is the only place the answer exists otherwise. The
        device that wrote the answer is stored too: it is the one that will apply the action, and
        asking every socket would apply one tap as many times as there are machines online.
        """
        label = assistant_action_label(action)
        encoded = json.dumps(action) if label else None
        with self.conn:
            self.conn.execute(
                "UPDATE assistant_requests SET answer_text = ?, action_json = ?, action_label = ?,"
                " answered_by = ? WHERE id = ?", (text, encoded, label, answered_by or None, request_id))

    def mark_assistant_applied(self, request_id: str) -> bool:
        """True for the call that won the race, False for every retry: the edit happens once."""
        with self.conn:
            res = self.conn.execute(
                "UPDATE assistant_requests SET applied_at = ? WHERE id = ? AND applied_at IS NULL",
                (time.time(), request_id))
        return res.rowcount == 1

    def dismiss_assistant_action(self, request_id: str) -> bool:
        """True for the tap that dismissed a card; a second tap, or one after applying, is not.

        Clearing `action_json` is the whole point: it is what makes a leftover `act:` button on
        the same message answer "stale" instead of creating the note the person just refused.
        """
        with self.conn:
            res = self.conn.execute(
                "UPDATE assistant_requests SET action_json = NULL, action_label = NULL"
                " WHERE id = ? AND action_json IS NOT NULL AND applied_at IS NULL", (request_id,))
        return res.rowcount == 1

    def expired_assistant_requests(self, now: float, limit: int = 20) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM assistant_requests WHERE answered_at IS NULL AND expires_at <= ? LIMIT ?",
            (now, limit)).fetchall()

    def pending_assistant_requests(self, vault_id: str, now: float) -> list[sqlite3.Row]:
        """What a reconnecting device missed: the socket broadcast does not survive a reconnect."""
        return self.conn.execute(
            "SELECT * FROM assistant_requests WHERE vault_id = ? AND answered_at IS NULL AND expires_at > ?"
            " ORDER BY created_at LIMIT 20", (vault_id, now)).fetchall()
