"""`NotifyStore` — второй файл рядом с relay.db: `route_token → chat_id`.

Идентичность лежит отдельно от vault id намеренно: см. DEPLOYMENT.md, «a chat id never
reaches relay.db». Модуль — лист, чтобы очередь и бот не тянули друг друга.
"""

import os
import sqlite3
import time
from typing import Optional

from settings import logger


class NotifyStore:
    """route_token -> chat_id, kept in its own file on purpose.

    The relay database knows vaults, accounts and devices; this one must never learn any of
    them, otherwise one dump becomes "this person's public key = that Telegram account".
    A route token means nothing outside this file, and no query here joins across files.
    """

    def __init__(self, db_path: str):
        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
        except sqlite3.Error as exc:
            logger.warning("Notify SQLite tuning unavailable: %s", exc)
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS notify_routes (
                    route_token TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    label TEXT NOT NULL DEFAULT '',
                    vault_tag TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL,
                    blocked_at REAL
                )""")
            columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(notify_routes)")}
            if "vault_tag" not in columns:
                self.conn.execute("ALTER TABLE notify_routes ADD COLUMN vault_tag TEXT NOT NULL DEFAULT ''")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_routes_chat ON notify_routes(chat_id)")
        # Whoever can read this file owns every Telegram channel in it: keep it to the owner.
        if db_path != ":memory:" and os.name == "posix":
            try:
                os.chmod(db_path, 0o600)
            except OSError as exc:
                logger.warning("Cannot tighten notify db permissions: %s", exc)

    def link(self, route_token: str, chat_id: str, label: str, vault_tag: str = "") -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("""
                INSERT INTO notify_routes (route_token, chat_id, label, vault_tag, created_at, blocked_at)
                VALUES (?, ?, ?, ?, ?, NULL)
                ON CONFLICT(route_token) DO UPDATE SET chat_id = excluded.chat_id,
                    label = excluded.label, vault_tag = excluded.vault_tag, blocked_at = NULL
            """, (route_token, chat_id, label, vault_tag, now))

    def get(self, route_token: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_routes WHERE route_token = ?", (route_token,)).fetchone()

    def routes_for_chat(self, chat_id: str) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_routes WHERE chat_id = ? AND blocked_at IS NULL",
                                 (chat_id,)).fetchall()

    def block_chat(self, chat_id: str) -> int:
        with self.conn:
            res = self.conn.execute("UPDATE notify_routes SET blocked_at = ? WHERE chat_id = ? AND blocked_at IS NULL",
                                    (time.time(), chat_id))
        return res.rowcount

    def block_route(self, route_token: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_routes SET blocked_at = ? WHERE route_token = ?",
                              (time.time(), route_token))
