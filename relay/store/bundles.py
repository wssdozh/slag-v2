"""Бандлы: приём, водарки, выдача недоставленного, подтверждения."""

from __future__ import annotations

import sqlite3
import json
from errors import ApiError
import time
from typing import Optional

from settings import *
from store.base import MAX_CACHE_BYTES


class BundlesMixin:
    def save_bundle(self, room_id: str, bundle_id: str, from_device: str, seq: int, ts: str,
                    payload_json: str, ttl: int = DEFAULT_TTL_SECONDS,
                    max_cache_bytes: int = MAX_CACHE_BYTES, account_id: Optional[str] = None,
                    vault_id: Optional[str] = None) -> bool:
        if not isinstance(bundle_id, str) or not bundle_id or len(bundle_id) > 256:
            raise ApiError(400, "invalid_bundle_id")
        if self.conn.execute("SELECT 1 FROM bundle_receipts WHERE bundle_id = ?", (bundle_id,)).fetchone():
            raise ApiError(409, "bundle_replay")
        room = self.conn.execute("SELECT vault_id, retired FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        if room and (room["vault_id"] != vault_id or room["retired"]):
            raise ApiError(403, "room_binding_conflict")
        payload_len = len(payload_json.encode("utf-8"))
        current_cache = self.get_account_cache_bytes(account_id) if account_id else self.get_room_cache_bytes(room_id)
        if current_cache + payload_len > max_cache_bytes:
            logger.warning("Cache limit exceeded")
            return False
        now = time.time()
        self.touch_room(room_id, vault_id)
        with self.conn:
            max_row = self.conn.execute("SELECT COALESCE(MAX(sync_id), 0) AS max_id FROM bundles WHERE room_id = ?", (room_id,)).fetchone()
            sync_id = int(max_row["max_id"]) + 1
            self.conn.execute("""
                INSERT INTO bundles
                (bundle_id, room_id, from_device_id, sequence, timestamp, payload, created_at, expires_at, sync_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (bundle_id, room_id, from_device, seq, ts, payload_json, now, now + ttl, sync_id))
            self.conn.execute("INSERT INTO bundle_receipts VALUES (?, ?, ?)", (bundle_id, room_id, now))
        return sync_id

    def get_room_watermarks(self, room_id: str) -> dict:
        row = self.conn.execute("""
            SELECT COALESCE(MAX(sync_id), 0) AS head,
                   COALESCE(MIN(sync_id), 0) AS oldest
            FROM bundles WHERE room_id = ? AND expires_at > ?
        """, (room_id, time.time())).fetchone()
        return {"head": int(row["head"]), "oldest": int(row["oldest"])}

    def get_pending_bundles(self, room_id: str, device_id: str, limit: int = 100, since_sync_id: int = 0) -> list[dict]:
        if since_sync_id > 0:
            rows = self.conn.execute("""
                SELECT b.bundle_id, b.room_id, b.from_device_id, b.sequence, b.timestamp, b.payload, COALESCE(b.sync_id, 0) AS sync_id
                FROM bundles b
                WHERE b.room_id = ? AND b.from_device_id != ?
                  AND COALESCE(b.sync_id, 0) > ?
                  AND b.expires_at > ?
                ORDER BY b.sync_id ASC, b.created_at ASC LIMIT ?
            """, (room_id, device_id, since_sync_id, time.time(), limit)).fetchall()
        else:
            rows = self.conn.execute("""
                SELECT b.bundle_id, b.room_id, b.from_device_id, b.sequence, b.timestamp, b.payload, COALESCE(b.sync_id, 0) AS sync_id
                FROM bundles b
                WHERE b.room_id = ? AND b.from_device_id != ?
                  AND b.bundle_id NOT IN (SELECT bundle_id FROM bundle_acks WHERE device_id = ?)
                  AND b.expires_at > ?
                ORDER BY b.created_at ASC LIMIT ?
            """, (room_id, device_id, device_id, time.time(), limit)).fetchall()
        return [{
            "bundleId": row["bundle_id"], "roomId": row["room_id"],
            "fromDeviceId": row["from_device_id"], "sequence": row["sequence"],
            "timestamp": row["timestamp"], "syncId": row["sync_id"],
            "payload": json.loads(row["payload"])
        } for row in rows]

    def record_acks(self, device_id: str, bundle_ids: list[str], room_id: str) -> int:
        if not isinstance(bundle_ids, list) or not all(isinstance(item, str) for item in bundle_ids):
            raise ApiError(400, "invalid_bundle_ids")
        count = 0
        with self.conn:
            for bundle_id in bundle_ids:
                res = self.conn.execute("""INSERT OR IGNORE INTO bundle_acks (bundle_id, device_id, acked_at)
                    SELECT bundle_id, ?, ? FROM bundles WHERE bundle_id = ? AND room_id = ?
                    AND from_device_id != ? AND expires_at > ?""",
                    (device_id, time.time(), bundle_id, room_id, device_id, time.time()))
                count += int(res.rowcount > 0)
        return count
