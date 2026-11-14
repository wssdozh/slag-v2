"""Соединение и общая часть хранилища: комнаты, кэш, срок годности строк."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from typing import Optional

from settings import *
from store.schema import apply_schema


MAX_CACHE_BYTES = 1024 * 1024 * 1024


class StoreBase:
    DEFAULT_MAX_CACHE_BYTES = MAX_CACHE_BYTES

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        # A bundle is broadcast right after save_bundle returns, so the commit sits directly
        # on the delivery latency path. WAL + NORMAL takes the fsync out of that path.
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
        except sqlite3.Error as exc:
            logger.warning("SQLite tuning unavailable: %s", exc)
        apply_schema(self.conn)

    def record_telemetry(self, event_type: str, platform: str = "unknown", metadata: Optional[dict] = None) -> str:
        event_id = f"evt_{secrets.token_hex(8)}"
        meta_json = json.dumps(metadata or {})
        with self.conn:
            self.conn.execute(
                "INSERT INTO telemetry_events (id, event_type, platform, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (event_id, event_type, platform, meta_json, time.time())
            )
        return event_id

    def purge_room_bundles(self, room_id: str) -> int:
        with self.conn:
            res = self.conn.execute("DELETE FROM bundles WHERE room_id = ?", (room_id,))
            count = res.rowcount
        return count

    def room_vault(self, room_id: str) -> Optional[str]:
        """Which vault a room speaks for. The row outlives the socket, so it is not presence."""
        row = self.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        return row["vault_id"] if row else None

    def touch_room(self, room_id: str, vault_id: Optional[str] = None) -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("""
                INSERT INTO rooms (room_id, created_at, last_active_at, vault_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(room_id) DO UPDATE SET
                    last_active_at = excluded.last_active_at,
                    vault_id = COALESCE(rooms.vault_id, excluded.vault_id)
            """, (room_id, now, now, vault_id))

    def get_room_cache_bytes(self, room_id: str) -> int:
        row = self.conn.execute("SELECT COALESCE(SUM(LENGTH(CAST(payload AS BLOB))), 0) AS total FROM bundles WHERE room_id = ? AND expires_at > ?",
                                (room_id, time.time())).fetchone()
        return int(row["total"])

    def get_account_cache_bytes(self, account_id: str) -> int:
        row = self.conn.execute("""
            SELECT COALESCE(SUM(LENGTH(CAST(b.payload AS BLOB))), 0) AS total
            FROM bundles b
            JOIN rooms r ON r.room_id = b.room_id
            JOIN vaults v ON v.id = r.vault_id
            WHERE v.owner_account_id = ? AND b.expires_at > ?
        """, (account_id, time.time())).fetchone()
        return int(row["total"])

    def cleanup_expired(self) -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("DELETE FROM bundles WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM bundle_acks WHERE bundle_id NOT IN (SELECT bundle_id FROM bundles)")
            self.conn.execute("DELETE FROM pairing_sessions WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM auth_challenges WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
            # Keep expired requests briefly so clients can distinguish expiry from bad credentials.
            self.conn.execute("DELETE FROM pending_auth_requests WHERE expires_at <= ?", (now - 24 * 3600,))
            # An invite row is the one place a vault id meets a chat id, so it must not linger.
            self.conn.execute("DELETE FROM notify_invites WHERE expires_at <= ?", (now - NOTIFY_INVITE_KEEP_SECONDS,))
            self.conn.execute("DELETE FROM notify_jobs WHERE sent_at IS NOT NULL AND sent_at <= ?", (now - 86400,))
