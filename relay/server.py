#!/usr/bin/env python3
"""SLAG zero-knowledge asyncio relay with optional account authentication."""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import os
from pathlib import Path
import secrets
import sqlite3
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Dict, Optional, Set, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DEFAULT_PORT = 8320
DEFAULT_TTL_SECONDS = 7 * 24 * 3600
PAIRING_TTL_SECONDS = 300
CHALLENGE_TTL_SECONDS = 300
DEVICE_REQUEST_TTL_SECONDS = 600
SESSION_TTL_SECONDS = 12 * 3600
PLANS = {
    "free": {"label": "Free", "devices": 2, "cache_mb": 1024},
    "smile": {"label": "Smile", "devices": 5, "cache_mb": 10 * 1024},
    "angry": {"label": "Angry", "devices": 15, "cache_mb": 50 * 1024},
}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("slag-relay")


def iso_time(value: Optional[float]) -> Optional[str]:
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class ApiError(Exception):
    def __init__(self, status: int, error: str):
        super().__init__(error)
        self.status = status
        self.error = error


class WebSocketConnection:
    """Minimal RFC 6455 WebSocket handler over asyncio streams."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, room_id: str, device_id: str,
                 account_id: Optional[str] = None, max_cache_bytes: int = 1024 * 1024 * 1024):
        self.reader = reader
        self.writer = writer
        self.room_id = room_id
        self.device_id = device_id
        self.account_id = account_id
        self.max_cache_bytes = max_cache_bytes
        self.closed = False
        self.token_hash = None
        self.vault_id = None

    async def send_text(self, text: str) -> None:
        if self.closed:
            return
        payload = text.encode("utf-8")
        length = len(payload)
        header = bytearray([0x81])
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", length))
        try:
            self.writer.write(header + payload)
            await self.writer.drain()
        except (ConnectionResetError, BrokenPipeError):
            self.closed = True

    async def read_frame(self) -> Optional[Tuple[int, bytes]]:
        try:
            first_two = await self.reader.readexactly(2)
            byte1, byte2 = first_two[0], first_two[1]
            opcode = byte1 & 0x0F
            masked = (byte2 & 0x80) != 0
            length = byte2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", await self.reader.readexactly(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", await self.reader.readexactly(8))[0]
            if length > 16 * 1024 * 1024 or not masked or not (byte1 & 0x80):
                return None
            mask = await self.reader.readexactly(4) if masked else None
            payload = bytearray(await self.reader.readexactly(length)) if length else bytearray()
            if masked and mask:
                for i in range(len(payload)):
                    payload[i] ^= mask[i % 4]
            if opcode == 0x8:
                return opcode, b""
            if opcode == 0x9:
                self.writer.write(bytearray([0x8A, len(payload)]) + payload)
                await self.writer.drain()
                return await self.read_frame()
            return opcode, bytes(payload)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return None

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(bytearray([0x88, 0x00]))
            await self.writer.drain()
            self.writer.close()
            await self.writer.wait_closed()
        except Exception:
            pass


class RelayDatabase:
    """SQLite persistence; all account-era schema changes are additive."""

    DEFAULT_MAX_CACHE_BYTES = 1024 * 1024 * 1024

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        columns = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def _init_schema(self) -> None:
        with self.conn:
            self.conn.executescript("""
                CREATE TABLE IF NOT EXISTS rooms (
                    room_id TEXT PRIMARY KEY,
                    created_at REAL NOT NULL,
                    last_active_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS bundles (
                    bundle_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    from_device_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_bundles_room ON bundles(room_id, created_at);
                CREATE TABLE IF NOT EXISTS bundle_acks (
                    bundle_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    acked_at REAL NOT NULL,
                    PRIMARY KEY(bundle_id, device_id)
                );
                CREATE TABLE IF NOT EXISTS pairing_sessions (
                    pin TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL UNIQUE,
                    host_device_id TEXT NOT NULL,
                    host_public_key TEXT NOT NULL,
                    host_nonce TEXT NOT NULL,
                    guest_ephemeral_pk TEXT,
                    sas_code TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_guest',
                    exchange_payload TEXT,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS accounts (
                    account_id TEXT PRIMARY KEY,
                    public_key TEXT NOT NULL UNIQUE,
                    plan TEXT NOT NULL DEFAULT 'free',
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    public_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    paired_at REAL NOT NULL,
                    last_seen_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id, status);
                CREATE TABLE IF NOT EXISTS auth_challenges (
                    challenge TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_challenges_account ON auth_challenges(account_id);
                CREATE TABLE IF NOT EXISTS pending_auth_requests (
                    id TEXT PRIMARY KEY,
                    secret_hash TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    public_key TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    completed_at REAL
                );
                CREATE INDEX IF NOT EXISTS idx_pending_auth_expiry ON pending_auth_requests(expires_at);
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    token_hash TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_device ON auth_sessions(account_id, device_id);
                CREATE TABLE IF NOT EXISTS vaults (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_account_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_vaults_owner ON vaults(owner_account_id);
                CREATE TABLE IF NOT EXISTS vault_grants (
                    vault_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    encrypted_key TEXT,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY(vault_id, device_id)
                );
                CREATE INDEX IF NOT EXISTS idx_grants_device ON vault_grants(device_id, status);
            """)
            self._ensure_column("rooms", "vault_id", "TEXT")
            self._ensure_column("rooms", "retired", "INTEGER NOT NULL DEFAULT 0")
            self._ensure_column("bundles", "sync_id", "INTEGER")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_bundles_room_sync ON bundles(room_id, sync_id)")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS device_cursors (
                device_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                last_sync_id INTEGER NOT NULL DEFAULT 0,
                updated_at REAL NOT NULL,
                PRIMARY KEY(device_id, room_id)
            )""")
            # ponytail: durable ID tombstones prevent post-expiry replay; compact only with a protocol replay horizon.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS bundle_receipts (
                bundle_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, created_at REAL NOT NULL)""")
            self.conn.execute("INSERT OR IGNORE INTO bundle_receipts SELECT bundle_id, room_id, created_at FROM bundles")
            self._ensure_column("pairing_sessions", "host_account_id", "TEXT")
            self._ensure_column("pairing_sessions", "host_token_hash", "TEXT")
            self._ensure_column("pairing_sessions", "guest_device_id", "TEXT")
            self._ensure_column("pairing_sessions", "guest_account_id", "TEXT")

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

    def save_bundle(self, room_id: str, bundle_id: str, from_device: str, seq: int, ts: str,
                    payload_json: str, ttl: int = DEFAULT_TTL_SECONDS,
                    max_cache_bytes: int = DEFAULT_MAX_CACHE_BYTES, account_id: Optional[str] = None,
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

    def create_pairing_session(self, host_device_id: str, host_public_key: str, host_nonce: str,
                               host_account_id: Optional[str] = None, host_token_hash: Optional[str] = None) -> dict:
        session_id = secrets.token_hex(16)
        now = time.time()
        with self.conn:
            formatted_pin = ""
            for _ in range(10):
                pin = f"{secrets.randbelow(1000000):06d}"
                candidate = f"{pin[:3]}-{pin[3:]}"
                if not self.conn.execute("SELECT 1 FROM pairing_sessions WHERE pin = ? AND expires_at > ?",
                                         (candidate, now)).fetchone():
                    formatted_pin = candidate
                    break
            if not formatted_pin:
                pin = f"{secrets.randbelow(1000000):06d}"
                formatted_pin = f"{pin[:3]}-{pin[3:]}"
            self.conn.execute("""
                INSERT INTO pairing_sessions
                (pin, session_id, host_device_id, host_public_key, host_nonce, status, created_at, expires_at,
                 host_account_id, host_token_hash)
                VALUES (?, ?, ?, ?, ?, 'pending_guest', ?, ?, ?, ?)
            """, (formatted_pin, session_id, host_device_id, host_public_key, host_nonce, now,
                  now + PAIRING_TTL_SECONDS, host_account_id, host_token_hash))
        return {"pin": formatted_pin, "sessionId": session_id, "expiresIn": PAIRING_TTL_SECONDS}

    def get_pairing_by_pin(self, pin: str) -> Optional[sqlite3.Row]:
        clean_pin = pin.strip()
        if len(clean_pin) == 6 and clean_pin.isdigit():
            clean_pin = f"{clean_pin[:3]}-{clean_pin[3:]}"
        return self.conn.execute("SELECT * FROM pairing_sessions WHERE pin = ? AND expires_at > ?",
                                 (clean_pin, time.time())).fetchone()

    def claim_pairing_session(self, pin: str, guest_ephemeral_pk: str, guest_device_id: Optional[str] = None,
                              guest_account_id: Optional[str] = None) -> Optional[dict]:
        clean_pin = pin.strip()
        if len(clean_pin) == 6 and clean_pin.isdigit():
            clean_pin = f"{clean_pin[:3]}-{clean_pin[3:]}"
        now = time.time()
        with self.conn:
            row = self.conn.execute("SELECT * FROM pairing_sessions WHERE pin = ? AND expires_at > ? AND status = 'pending_guest'",
                                    (clean_pin, now)).fetchone()
            if not row:
                return None
            if row["host_account_id"] and row["host_account_id"] != guest_account_id:
                raise ApiError(403, "pairing_account_mismatch")
            combined = f"{row['host_public_key']}:{guest_ephemeral_pk}:{clean_pin}".encode("utf-8")
            sas_code = str(int(hashlib.sha256(combined).hexdigest()[:8], 16) % 9000 + 1000)
            self.conn.execute("""
                UPDATE pairing_sessions
                SET guest_ephemeral_pk = ?, sas_code = ?, status = 'pending_approval',
                    guest_device_id = ?, guest_account_id = ? WHERE pin = ?
            """, (guest_ephemeral_pk, sas_code, guest_device_id, guest_account_id, clean_pin))
            return {"sessionId": row["session_id"], "sasCode": sas_code, "status": "pending_approval"}

    def get_pairing_session(self, session_id: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM pairing_sessions WHERE session_id = ? AND expires_at > ?",
                                 (session_id, time.time())).fetchone()

    def approve_pairing_session(self, session_id: str, exchange_payload: str) -> bool:
        with self.conn:
            res = self.conn.execute("""
                UPDATE pairing_sessions SET status = 'approved', exchange_payload = ?
                WHERE session_id = ? AND expires_at > ? AND status = 'pending_approval'
            """, (exchange_payload, session_id, time.time()))
            return res.rowcount > 0

    def reject_pairing_session(self, session_id: str) -> bool:
        with self.conn:
            res = self.conn.execute("UPDATE pairing_sessions SET status = 'rejected' WHERE session_id = ? AND expires_at > ?",
                                    (session_id, time.time()))
            return res.rowcount > 0

    def poll_pairing_session(self, session_id: str) -> Optional[dict]:
        row = self.get_pairing_session(session_id)
        if not row:
            return None
        return {"sessionId": row["session_id"], "status": row["status"], "sasCode": row["sas_code"],
                "guestDeviceId": row["guest_device_id"], "exchangePayload": row["exchange_payload"],
                "expiresIn": max(0, int(row["expires_at"] - time.time()))}

    def create_challenge(self, account_id: str) -> str:
        challenge = secrets.token_urlsafe(32)
        now = time.time()
        with self.conn:
            self.conn.execute("DELETE FROM auth_challenges WHERE account_id = ?", (account_id,))
            self.conn.execute("INSERT INTO auth_challenges (challenge, account_id, expires_at) VALUES (?, ?, ?)",
                              (challenge, account_id, now + CHALLENGE_TTL_SECONDS))
        return challenge

    def consume_challenge(self, account_id: str, challenge: str) -> bool:
        with self.conn:
            row = self.conn.execute("SELECT expires_at FROM auth_challenges WHERE account_id = ? AND challenge = ?",
                                    (account_id, challenge)).fetchone()
            if row:
                self.conn.execute("DELETE FROM auth_challenges WHERE challenge = ?", (challenge,))
            return bool(row and row["expires_at"] > time.time())

    def account_payload(self, account_id: str) -> dict:
        account = self.conn.execute("SELECT * FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
        if not account:
            raise ApiError(404, "account_not_found")
        plan = PLANS.get(account["plan"], PLANS["free"])
        return {
            "id": account_id, "plan": account["plan"], "planLabel": plan["label"], "expiresAt": None,
            "maxDevices": plan["devices"], "maxCacheMb": plan["cache_mb"],
            "usedCacheMb": round(self.get_account_cache_bytes(account_id) / (1024 * 1024), 3),
            "allowAttachments": True, "hasAiLease": account["plan"] in ("smile", "angry")
        }

    def device_payload(self, row: sqlite3.Row) -> dict:
        return {"id": row["id"], "name": row["name"], "platform": row["platform"], "publicKey": row["public_key"],
                "status": row["status"], "pairedAt": iso_time(row["paired_at"]), "lastSeenAt": iso_time(row["last_seen_at"])}

    def _insert_session(self, account_id: str, device_id: str) -> tuple[str, float]:
        token = secrets.token_urlsafe(32)
        expires_at = time.time() + SESSION_TTL_SECONDS
        self.conn.execute("INSERT INTO auth_sessions (token_hash, account_id, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                          (hash_token(token), account_id, device_id, time.time(), expires_at))
        return token, expires_at

    def register_account(self, account_id: str, public_key: str, device: dict) -> tuple[str, float]:
        now = time.time()
        with self.conn:
            if self.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone():
                raise ApiError(409, "account_already_exists")
            if self.conn.execute("SELECT 1 FROM devices WHERE id = ?", (device["id"],)).fetchone():
                raise ApiError(409, "device_already_exists")
            self.conn.execute("INSERT INTO accounts (account_id, public_key, plan, created_at) VALUES (?, ?, 'free', ?)",
                              (account_id, public_key, now))
            self.conn.execute("""
                INSERT INTO devices (id, account_id, name, platform, public_key, status, paired_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
            """, (device["id"], account_id, device["name"], device["platform"], device["publicKey"], now, now))
            return self._insert_session(account_id, device["id"])

    def login_account(self, account_id: str, device: dict) -> tuple[str, float] | dict:
        now = time.time()
        with self.conn:
            existing = self.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            if existing and existing["account_id"] != account_id:
                raise ApiError(409, "device_already_exists")
            if not existing:
                self.conn.execute("""
                    INSERT INTO devices (id, account_id, name, platform, public_key, status, paired_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """, (device["id"], account_id, device["name"], device["platform"], device["publicKey"], now, now))
                return {"status": "pending_device", "deviceId": device["id"]}
            if existing["public_key"] != device["publicKey"]:
                raise ApiError(403, "device_key_mismatch")
            if existing["status"] == "revoked":
                raise ApiError(403, "device_revoked")
            if existing["status"] != "active":
                return {"status": "pending_device", "deviceId": device["id"]}
            self.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (now, device["id"]))
            return self._insert_session(account_id, device["id"])

    def create_device_request(self, account_id: str, device: dict) -> dict:
        request_id = secrets.token_urlsafe(24)
        secret = secrets.token_urlsafe(32)
        now = time.time()
        with self.conn:
            self.conn.execute("INSERT INTO pending_auth_requests VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                              (request_id, hash_token(secret), account_id, device["id"], device["publicKey"],
                               now, now + DEVICE_REQUEST_TTL_SECONDS))
        return {"requestId": request_id, "continuationSecret": secret,
                "expiresAt": iso_time(now + DEVICE_REQUEST_TTL_SECONDS), "expiresIn": DEVICE_REQUEST_TTL_SECONDS}

    def authenticate(self, token: str) -> Optional[dict]:
        return self.authenticate_hash(hash_token(token)) if token else None

    def authenticate_hash(self, token_hash: str) -> Optional[dict]:
        row = self.conn.execute("""
            SELECT s.token_hash, s.account_id, s.device_id, s.expires_at, a.plan
            FROM auth_sessions s
            JOIN accounts a ON a.account_id = s.account_id
            JOIN devices d ON d.id = s.device_id AND d.account_id = s.account_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND d.status = 'active'
        """, (token_hash, time.time())).fetchone()
        if row:
            self.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (time.time(), row["device_id"]))
            return dict(row)
        return None

    def logout(self, token_hash: str) -> None:
        with self.conn:
            self.conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))

    def list_devices(self, account_id: str) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM devices WHERE account_id = ? ORDER BY paired_at", (account_id,)).fetchall()
        return [self.device_payload(row) for row in rows]

    def approve_device(self, account_id: str, device_id: str) -> None:
        row = self.conn.execute("SELECT * FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone()
        if not row:
            raise ApiError(404, "device_not_found")
        if row["status"] == "active":
            return
        if row["status"] != "pending":
            raise ApiError(409, "device_not_pending")
        active = self.conn.execute("SELECT COUNT(*) AS n FROM devices WHERE account_id = ? AND status = 'active'", (account_id,)).fetchone()["n"]
        if active >= PLANS[self.conn.execute("SELECT plan FROM accounts WHERE account_id = ?", (account_id,)).fetchone()["plan"]]["devices"]:
            raise ApiError(403, "device_limit_exceeded")
        with self.conn:
            self.conn.execute("UPDATE devices SET status = 'active', last_seen_at = ? WHERE id = ?", (time.time(), device_id))

    def rename_device(self, account_id: str, device_id: str, name: str) -> None:
        with self.conn:
            res = self.conn.execute("UPDATE devices SET name = ? WHERE id = ? AND account_id = ?", (name, device_id, account_id))
        if not res.rowcount:
            raise ApiError(404, "device_not_found")

    def revoke_device(self, account_id: str, device_id: str) -> None:
        if not self.conn.execute("SELECT 1 FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone():
            raise ApiError(404, "device_not_found")
        with self.conn:
            res = self.conn.execute("UPDATE devices SET status = 'revoked' WHERE id = ? AND account_id = ?", (device_id, account_id))
            self.conn.execute("DELETE FROM auth_sessions WHERE account_id = ? AND device_id = ?", (account_id, device_id))
            self.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE device_id = ?", (time.time(), device_id))
        if not res.rowcount:
            raise ApiError(404, "device_not_found")

    def vault_payload(self, vault_id: str) -> dict:
        vault = self.conn.execute("SELECT * FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        grants = self.conn.execute("SELECT * FROM vault_grants WHERE vault_id = ? ORDER BY device_id", (vault_id,)).fetchall()
        return {"id": vault["id"], "name": vault["name"], "ownerAccountId": vault["owner_account_id"],
                "grants": [{"deviceId": g["device_id"], "mode": g["mode"], "status": g["status"]} for g in grants]}

    def list_vaults(self, account_id: str, device_id: str) -> dict:
        accepted = self.conn.execute("""
            SELECT v.id FROM vaults v JOIN vault_grants g ON g.vault_id = v.id
            WHERE g.device_id = ? AND g.status = 'accepted'
        """, (device_id,)).fetchall()
        ids = sorted(row["id"] for row in accepted)
        invitations = self.conn.execute("""
            SELECT v.id, v.name, g.mode, g.encrypted_key FROM vaults v
            JOIN vault_grants g ON g.vault_id = v.id
            WHERE g.device_id = ? AND g.status = 'pending' ORDER BY v.id
        """, (device_id,)).fetchall()
        return {"vaults": [self.vault_payload(vault_id) for vault_id in ids],
                "invitations": [{"id": row["id"], "name": row["name"], "mode": row["mode"], "encryptedKey": row["encrypted_key"]}
                                for row in invitations]}

    def upsert_owned_vault(self, vault_id: str, name: str, account_id: str, device_id: str,
                           encrypted_key: Optional[str] = None) -> dict:
        vault_id = vault_id or f"vault_{secrets.token_hex(16)}"
        now = time.time()
        with self.conn:
            row = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
            if row and row["owner_account_id"] != account_id:
                raise ApiError(403, "vault_not_owned")
            if row:
                grant = self.conn.execute("SELECT mode, status FROM vault_grants WHERE vault_id = ? AND device_id = ?",
                                          (vault_id, device_id)).fetchone()
                if not grant or grant["status"] != "accepted" or grant["mode"] != "read-write":
                    raise ApiError(403, "vault_access_denied")
                self.conn.execute("UPDATE vaults SET name = ?, updated_at = ? WHERE id = ?", (name, now, vault_id))
                return self.vault_payload(vault_id)
            else:
                self.conn.execute("INSERT INTO vaults (id, name, owner_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                                  (vault_id, name, account_id, now, now))
            current = self.conn.execute("SELECT encrypted_key FROM vault_grants WHERE vault_id = ? AND device_id = ?",
                                        (vault_id, device_id)).fetchone()
            key = encrypted_key if encrypted_key is not None else (current["encrypted_key"] if current else None)
            self.conn.execute("""
                INSERT INTO vault_grants (vault_id, device_id, mode, status, encrypted_key, updated_at)
                VALUES (?, ?, 'read-write', 'accepted', ?, ?)
                ON CONFLICT(vault_id, device_id) DO UPDATE SET mode = 'read-write', status = 'accepted',
                    encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at
            """, (vault_id, device_id, key, now))
        return self.vault_payload(vault_id)

    def set_vault_grant(self, vault_id: str, account_id: str, device_id: str, mode: str,
                        encrypted_key: Optional[str], status: str = "pending") -> None:
        vault = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        if vault["owner_account_id"] != account_id:
            raise ApiError(403, "vault_not_owned")
        device = self.conn.execute("SELECT account_id, status FROM devices WHERE id = ?", (device_id,)).fetchone()
        if not device or device["account_id"] != account_id:
            raise ApiError(404, "device_not_found")
        if status in ("pending", "accepted") and device["status"] != "active":
            raise ApiError(409, "device_not_active")
        with self.conn:
            self.conn.execute("""
                INSERT INTO vault_grants (vault_id, device_id, mode, status, encrypted_key, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(vault_id, device_id) DO UPDATE SET mode = excluded.mode,
                    status = CASE WHEN vault_grants.status = 'accepted' AND excluded.status = 'pending'
                        AND vault_grants.mode = excluded.mode AND vault_grants.encrypted_key IS excluded.encrypted_key
                        THEN 'accepted' ELSE excluded.status END,
                    encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at
            """, (vault_id, device_id, mode, status, encrypted_key, time.time()))

    def revoke_vault_grant(self, vault_id: str, account_id: str, device_id: str) -> None:
        vault = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        if vault["owner_account_id"] != account_id:
            raise ApiError(403, "vault_not_owned")
        with self.conn:
            res = self.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE vault_id = ? AND device_id = ?",
                                    (time.time(), vault_id, device_id))
        if not res.rowcount:
            raise ApiError(404, "grant_not_found")

    def respond_to_grant(self, vault_id: str, device_id: str, accept: bool) -> dict:
        row = self.conn.execute("""
            SELECT g.*, v.name FROM vault_grants g JOIN vaults v ON v.id = g.vault_id
            WHERE g.vault_id = ? AND g.device_id = ? AND g.status = 'pending'
        """, (vault_id, device_id)).fetchone()
        if not row:
            raise ApiError(404, "invitation_not_found")
        with self.conn:
            self.conn.execute("UPDATE vault_grants SET status = ?, updated_at = ? WHERE vault_id = ? AND device_id = ?",
                              ("accepted" if accept else "revoked", time.time(), vault_id, device_id))
        if accept:
            return {"id": vault_id, "name": row["name"], "mode": row["mode"], "encryptedKey": row["encrypted_key"]}
        return {"status": "ok"}

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


class SlagRelayServer:
    def __init__(self, host: str, port: int, db_path: str, require_account_auth: Optional[bool] = None,
                 admin_token: Optional[str] = None):
        self.host = host
        self.port = port
        self.start_time = time.time()
        self.rooms: Dict[str, Set[WebSocketConnection]] = {}
        self.failed_claim_attempts: Dict[str, list[float]] = {}
        if require_account_auth is None:
            value = os.environ.get("SLAG_REQUIRE_ACCOUNT_AUTH", "false").strip().lower()
            if value not in ("1", "true", "yes", "on", "0", "false", "no", "off"):
                raise ValueError("SLAG_REQUIRE_ACCOUNT_AUTH must be a boolean")
            require_account_auth = value in ("1", "true", "yes", "on")
        self.require_account_auth = require_account_auth
        if admin_token is None:
            admin_token = os.environ.get("SLAG_ADMIN_TOKEN")
        self.admin_token = admin_token.strip() if admin_token and admin_token.strip() else None
        self.db = RelayDatabase(db_path)

    def _cors_headers(self) -> str:
        return ("Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Admin-Token\r\n")

    def _http_response(self, status_code: int, status_text: str, content_type: str, body: bytes) -> bytes:
        headers = [f"HTTP/1.1 {status_code} {status_text}", f"Content-Type: {content_type}",
                   f"Content-Length: {len(body)}", "Connection: close", self._cors_headers().strip(), "", ""]
        return "\r\n".join(headers).encode("utf-8") + body

    def _json_response(self, data: dict, status: int = 200) -> bytes:
        labels = {200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 400: "Bad Request",
                  401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict",
                  413: "Payload Too Large", 429: "Too Many Requests", 502: "Bad Gateway"}
        return self._http_response(status, labels.get(status, "Error"), "application/json", json.dumps(data).encode("utf-8"))

    async def _send_response(self, writer: asyncio.StreamWriter, resp_bytes: bytes) -> None:
        try:
            writer.write(resp_bytes)
            await writer.drain()
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    @staticmethod
    def _bearer(headers: dict, allow_raw: bool = False) -> str:
        value = headers.get("authorization", "").strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value if allow_raw else ""

    def _auth(self, headers: dict) -> dict:
        auth = self.db.authenticate(self._bearer(headers))
        if not auth:
            raise ApiError(401, "unauthorized")
        return auth

    def _admin_auth(self, headers: dict) -> None:
        if not self.admin_token:
            raise ApiError(403, "admin_not_configured")
        token = headers.get("x-admin-token", "").strip() or self._bearer(headers)
        if not token or not secrets.compare_digest(token, self.admin_token):
            raise ApiError(401, "invalid_admin_token")

    @staticmethod
    def _validate_account_id(account_id: str) -> None:
        if not isinstance(account_id, str) or not account_id.startswith("acc_") or len(account_id) != 28:
            raise ApiError(400, "invalid_account_id")
        try:
            bytes.fromhex(account_id[4:])
        except ValueError:
            raise ApiError(400, "invalid_account_id")

    @staticmethod
    def _validate_device(device: dict) -> None:
        if not isinstance(device, dict) or not all(isinstance(device.get(k), str) and device.get(k) for k in ("id", "name", "platform", "publicKey")):
            raise ApiError(400, "invalid_device")
        try:
            jwk = json.loads(device["publicKey"])
            if not isinstance(jwk, dict) or jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
                raise ValueError
            if not all(isinstance(jwk.get(k), str) and jwk[k] for k in ("x", "y")):
                raise ValueError
            SlagRelayServer._device_public_key(device["publicKey"])
        except (ValueError, TypeError, json.JSONDecodeError):
            raise ApiError(400, "invalid_device_public_key")

    @staticmethod
    def _device_public_key(public_key: str):
        jwk = json.loads(public_key)
        x, y = (base64.urlsafe_b64decode(jwk[k] + "=" * (-len(jwk[k]) % 4)) for k in ("x", "y"))
        if len(x) != 32 or len(y) != 32:
            raise ValueError("invalid device coordinates")
        return ec.EllipticCurvePublicNumbers(int.from_bytes(x, "big"), int.from_bytes(y, "big"), ec.SECP256R1()).public_key()

    def _verify_device_signature(self, public_key: str, challenge: str, signature: str) -> None:
        try:
            raw = bytes.fromhex(signature)
            if len(raw) != 64:
                raise ValueError
            self._device_public_key(public_key).verify(
                encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
                challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        except (ValueError, TypeError, InvalidSignature):
            raise ApiError(401, "invalid_device_signature")

    def _verify_account_signature(self, account_id: str, public_key: str, challenge: str, signature: str) -> None:
        self._validate_account_id(account_id)
        try:
            key_bytes = bytes.fromhex(public_key)
            signature_bytes = bytes.fromhex(signature)
            if len(key_bytes) != 33 or len(signature_bytes) != 64:
                raise ValueError
            if hashlib.sha256(key_bytes).hexdigest()[:24] != account_id[4:]:
                raise ApiError(400, "account_key_mismatch")
            key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), key_bytes)
            r = int.from_bytes(signature_bytes[:32], "big")
            s = int.from_bytes(signature_bytes[32:], "big")
            key.verify(encode_dss_signature(r, s), challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        except ApiError:
            raise
        except (ValueError, TypeError, InvalidSignature):
            raise ApiError(401, "invalid_signature")

    def _pair_participant(self, session_id: str, auth: dict, host_only: bool = False) -> sqlite3.Row:
        row = self.db.get_pairing_session(session_id)
        if not row:
            raise ApiError(404, "session_not_found")
        is_host = row["host_token_hash"] == auth["token_hash"] and row["host_device_id"] == auth["device_id"]
        is_guest = (not host_only and row["guest_device_id"] == auth["device_id"]
                    and row["guest_account_id"] == auth["account_id"])
        if not is_host and not is_guest:
            raise ApiError(403, "not_pairing_participant")
        return row

    def _authorize_vault(self, auth: dict, vault_id: str, write: bool = False) -> str:
        vault = self.db.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        grant = self.db.conn.execute("""
            SELECT mode FROM vault_grants WHERE vault_id = ? AND device_id = ? AND status = 'accepted'
        """, (vault_id, auth["device_id"])).fetchone()
        if (vault["owner_account_id"] != auth["account_id"] or not grant
                or (write and grant["mode"] != "read-write")):
            raise ApiError(403, "vault_access_denied")
        return vault["owner_account_id"]

    def _authorize_room(self, auth: dict, room_id: str, vault_id: str) -> str:
        if not vault_id:
            raise ApiError(400, "missing_vault")
        owner_account_id = self._authorize_vault(auth, vault_id)
        room = self.db.conn.execute("SELECT vault_id, retired FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        if room and (room["vault_id"] != vault_id or room["retired"]):
            raise ApiError(403, "room_bound_to_another_vault")
        self.db.touch_room(room_id, vault_id)
        return owner_account_id

    async def handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            req_line_bytes = await reader.readline()
            if not req_line_bytes:
                writer.close()
                return
            parts = req_line_bytes.decode("utf-8", errors="replace").strip().split(" ")
            if len(parts) < 2:
                writer.close()
                return
            method, full_path = parts[0].upper(), parts[1]
            headers = {}
            while True:
                line = await reader.readline()
                if not line or line in (b"\r\n", b"\n"):
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if ":" in decoded:
                    key, value = decoded.split(":", 1)
                    headers[key.strip().lower()] = value.strip()
            if method == "OPTIONS":
                await self._send_response(writer, self._http_response(204, "No Content", "text/plain", b""))
                return
            if headers.get("upgrade", "").lower() == "websocket":
                await self.handle_ws_upgrade(reader, writer, method, full_path, headers)
            else:
                await self.handle_http_request(reader, writer, method, full_path, headers)
        except Exception as exc:
            logger.debug("Connection error: %s", type(exc).__name__)
            writer.close()

    async def handle_http_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                                  method: str, full_path: str, headers: dict) -> None:
        parsed = urllib.parse.urlsplit(full_path)
        path = parsed.path
        query = {key: values[-1] for key, values in urllib.parse.parse_qs(parsed.query).items()}
        try:
            content_len = int(headers.get("content-length", 0))
            if content_len < 0 or content_len > 16 * 1024 * 1024:
                raise ApiError(413, "payload_too_large")
            body_bytes = await reader.readexactly(content_len) if content_len else b""
            try:
                body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                if not isinstance(body, dict):
                    raise ValueError
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                raise ApiError(400, "invalid_json")
            response = await self._route_http(method, path, query, body, headers, writer)
            if response is not None:
                data, status = response
                await self._send_response(writer, self._json_response(data, status))
        except ApiError as exc:
            await self._send_response(writer, self._json_response({"error": exc.error}, exc.status))
        except (ValueError, TypeError) as exc:
            logger.debug("Bad request: %s", type(exc).__name__)
            await self._send_response(writer, self._json_response({"error": "bad_request"}, 400))

    async def _route_http(self, method: str, path: str, query: dict, body: dict, headers: dict,
                          writer: asyncio.StreamWriter) -> Optional[tuple[dict, int]]:
        if method == "GET" and path == "/health":
            return {"status": "ok", "service": "slag-relay", "version": "0.2.0",
                    "uptime": int(time.time() - self.start_time), "activeRooms": len(self.rooms),
                    "timestamp": int(time.time()), "authRequired": self.require_account_auth}, 200

        if method == "GET" and path == "/api/admin/stats":
            self._admin_auth(headers)
            accounts_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM accounts").fetchone()["c"]
            devices_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM devices").fetchone()["c"]
            bundles_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundles").fetchone()["c"]
            total_cache = self.db.conn.execute("SELECT COALESCE(SUM(LENGTH(payload)), 0) AS s FROM bundles").fetchone()["s"]
            return {
                "status": "ok",
                "uptime": int(time.time() - self.start_time),
                "totalAccounts": accounts_count,
                "totalDevices": devices_count,
                "activeRooms": len(self.rooms),
                "totalBundles": bundles_count,
                "totalCacheBytes": total_cache,
            }, 200

        if method == "GET" and path == "/api/admin/accounts":
            self._admin_auth(headers)
            rows = self.db.conn.execute("SELECT account_id, created_at FROM accounts ORDER BY created_at DESC").fetchall()
            accounts_list = []
            for r in rows:
                acc_id = r["account_id"]
                p = self.db.account_payload(acc_id)
                p["createdAt"] = iso_time(r["created_at"])
                p["devices"] = self.db.list_devices(acc_id)
                accounts_list.append(p)
            return {"status": "ok", "accounts": accounts_list}, 200

        if path.startswith("/api/admin/accounts/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and method == "PATCH":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                plan_name = body.get("plan")
                if plan_name not in PLANS:
                    raise ApiError(400, "invalid_plan")
                account = self.db.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
                if not account:
                    raise ApiError(404, "account_not_found")
                with self.db.conn:
                    self.db.conn.execute("UPDATE accounts SET plan = ? WHERE account_id = ?", (plan_name, account_id))
                return {"status": "ok", "account": self.db.account_payload(account_id)}, 200

        if method == "POST" and path == "/api/auth/challenge":
            account_id = body.get("accountId", "")
            self._validate_account_id(account_id)
            return {"challenge": self.db.create_challenge(account_id), "expiresIn": CHALLENGE_TTL_SECONDS}, 200

        if method == "POST" and path in ("/api/auth/register", "/api/auth/login"):
            account_id = body.get("accountId", "")
            public_key = body.get("publicKey", "")
            challenge = body.get("challenge", "")
            signature = body.get("signature", "")
            device = body.get("device")
            self._validate_device(device)
            if not self.db.consume_challenge(account_id, challenge):
                raise ApiError(401, "invalid_or_expired_challenge")
            self._verify_account_signature(account_id, public_key, challenge, signature)
            if path.endswith("/register"):
                token, expires_at = self.db.register_account(account_id, public_key, device)
                saved_device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
                return {"token": token, "expiresAt": iso_time(expires_at), "account": self.db.account_payload(account_id),
                        "device": self.db.device_payload(saved_device)}, 201
            account = self.db.conn.execute("SELECT public_key FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
            if not account or account["public_key"] != public_key:
                raise ApiError(401, "invalid_account_credentials")
            existing = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            if existing and existing["account_id"] == account_id and existing["status"] == "active":
                self._verify_device_signature(existing["public_key"], challenge, body.get("deviceSignature", ""))
            result = self.db.login_account(account_id, device)
            if isinstance(result, dict):
                return {**result, **self.db.create_device_request(account_id, device)}, 202
            token, expires_at = result
            saved_device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            return {"token": token, "expiresAt": iso_time(expires_at), "account": self.db.account_payload(account_id),
                    "device": self.db.device_payload(saved_device)}, 200

        if method == "POST" and path.startswith("/api/auth/device-requests/"):
            parts = path.strip("/").split("/")
            if len(parts) != 5 or parts[4] != "complete":
                raise ApiError(404, "not_found")
            request_id = urllib.parse.unquote(parts[3])
            secret = body.get("continuationSecret", "")
            challenge = body.get("challenge", "")
            signature = body.get("deviceSignature", "")
            if not all(isinstance(value, str) and value for value in (secret, challenge, signature)):
                raise ApiError(401, "invalid_device_request_credentials")
            # Consume the challenge and request and mint the session in one transaction.
            with self.db.conn:
                request = self.db.conn.execute("SELECT * FROM pending_auth_requests WHERE id = ?", (request_id,)).fetchone()
                if not request or not secrets.compare_digest(request["secret_hash"], hash_token(secret)):
                    raise ApiError(401, "invalid_device_request_credentials")
                if request["completed_at"] is not None:
                    raise ApiError(409, "device_request_completed")
                consumed = self.db.conn.execute(
                    "DELETE FROM auth_challenges WHERE account_id = ? AND challenge = ? AND expires_at > ?",
                    (request["account_id"], challenge, time.time()))
                if consumed.rowcount != 1:
                    raise ApiError(401, "invalid_or_expired_challenge")
                self._verify_device_signature(request["public_key"], challenge, signature)
                if request["expires_at"] <= time.time():
                    return {"status": "expired"}, 200
                device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (request["device_id"],)).fetchone()
                if (not device or device["account_id"] != request["account_id"]
                        or device["public_key"] != request["public_key"] or device["status"] == "revoked"):
                    return {"status": "rejected"}, 200
                if device["status"] != "active":
                    return {"status": "pending"}, 200
                completed = self.db.conn.execute(
                    "UPDATE pending_auth_requests SET completed_at = ? WHERE id = ? AND completed_at IS NULL AND expires_at > ?",
                    (time.time(), request_id, time.time()))
                if completed.rowcount != 1:
                    raise ApiError(409, "device_request_completed")
                token, expires_at = self.db._insert_session(request["account_id"], request["device_id"])
                self.db.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (time.time(), request["device_id"]))
                return {"token": token, "expiresAt": iso_time(expires_at),
                        "account": self.db.account_payload(request["account_id"]),
                        "device": self.db.device_payload(device)}, 200

        if method == "POST" and path == "/api/auth/logout":
            auth = self._auth(headers)
            self.db.logout(auth["token_hash"])
            return {"status": "ok"}, 200

        if method == "GET" and path == "/api/account":
            auth = self._auth(headers)
            return {"account": self.db.account_payload(auth["account_id"]), "devices": self.db.list_devices(auth["account_id"])}, 200

        if path.startswith("/api/account/devices/"):
            path = path.replace("/api/account/devices/", "/api/devices/", 1)
        if path.startswith("/api/devices/"):
            auth = self._auth(headers)
            parts = path.strip("/").split("/")
            device_id = urllib.parse.unquote(parts[2]) if len(parts) >= 3 else ""
            if method == "POST" and len(parts) == 4 and parts[3] == "approve":
                self.db.approve_device(auth["account_id"], device_id)
                return {"status": "ok"}, 200
            if method == "PATCH" and len(parts) == 3:
                name = body.get("name", "")
                if not isinstance(name, str) or not name.strip() or len(name.strip()) > 64:
                    raise ApiError(400, "invalid_device_name")
                self.db.rename_device(auth["account_id"], device_id, name.strip())
                return {"status": "ok"}, 200
            if method == "DELETE" and len(parts) == 3:
                self.db.revoke_device(auth["account_id"], device_id)
                return {"status": "ok"}, 200

        if method == "GET" and path == "/api/vaults":
            auth = self._auth(headers)
            return self.db.list_vaults(auth["account_id"], auth["device_id"]), 200

        if path.startswith("/api/vaults/"):
            auth = self._auth(headers)
            parts = path.strip("/").split("/")
            vault_id = urllib.parse.unquote(parts[2]) if len(parts) >= 3 else ""
            if method == "PUT" and len(parts) == 3:
                name = body.get("name", "")
                if not isinstance(name, str) or not name.strip():
                    raise ApiError(400, "invalid_vault_name")
                return self.db.upsert_owned_vault(vault_id, name.strip(), auth["account_id"], auth["device_id"]), 200
            if method == "POST" and len(parts) == 4 and parts[3] == "rotate":
                self._authorize_vault(auth, vault_id, write=True)
                with self.db.conn:
                    self.db.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE vault_id = ? AND device_id != ?",
                                         (time.time(), vault_id, auth["device_id"]))
                    self.db.conn.execute("UPDATE rooms SET retired = 1 WHERE vault_id = ?", (vault_id,))
                return {"status": "ok"}, 200
            if method == "PUT" and len(parts) == 5 and parts[3] == "grants":
                self._authorize_vault(auth, vault_id, write=True)
                mode = body.get("mode")
                encrypted_key = body.get("encryptedKey")
                if mode not in ("read-write", "receive-only") or not isinstance(encrypted_key, str):
                    raise ApiError(400, "invalid_grant")
                target_device = urllib.parse.unquote(parts[4])
                if target_device == auth["device_id"]:
                    raise ApiError(409, "self_grant_not_allowed")
                self.db.set_vault_grant(vault_id, auth["account_id"], target_device, mode, encrypted_key)
                return {"status": "ok"}, 200
            if method == "POST" and len(parts) == 4 and parts[3] in ("accept", "decline"):
                return self.db.respond_to_grant(vault_id, auth["device_id"], parts[3] == "accept"), 200
            if method == "DELETE" and len(parts) == 5 and parts[3] == "grants":
                self._authorize_vault(auth, vault_id, write=True)
                self.db.revoke_vault_grant(vault_id, auth["account_id"], urllib.parse.unquote(parts[4]))
                return {"status": "ok"}, 200

        if method == "POST" and path == "/api/pair/create":
            auth = self._auth(headers) if self.require_account_auth or self._bearer(headers) else None
            host_device = auth["device_id"] if auth else body.get("deviceId", "anonymous")
            if auth and body.get("deviceId") not in (None, host_device):
                raise ApiError(403, "device_mismatch")
            return self.db.create_pairing_session(host_device, body.get("publicKey", ""),
                                                  body.get("clientNonce", secrets.token_hex(16)),
                                                  auth["account_id"] if auth else None,
                                                  auth["token_hash"] if auth else None), 200

        if method == "POST" and path == "/api/pair/claim":
            peername = writer.get_extra_info("peername")
            client_ip = peername[0] if peername else "unknown"
            now = time.time()
            attempts = [t for t in self.failed_claim_attempts.get(client_ip, []) if now - t < 300]
            if len(attempts) >= 5:
                return {"error": "too_many_attempts_retry_later"}, 429
            auth = self._auth(headers) if self.require_account_auth or self._bearer(headers) else None
            guest_device = auth["device_id"] if auth else None
            if auth and body.get("deviceId") != guest_device:
                raise ApiError(403, "device_mismatch")
            result = self.db.claim_pairing_session(body.get("pin", ""), body.get("publicKey", secrets.token_hex(16)),
                                                   guest_device, auth["account_id"] if auth else None)
            if result:
                self.failed_claim_attempts.pop(client_ip, None)
                logger.info("Pairing claim: session [%s] from [%s]", result["sessionId"][:8], client_ip)
                return result, 200
            attempts.append(now)
            self.failed_claim_attempts[client_ip] = attempts
            return {"error": "invalid_or_expired_pin"}, 404

        if method == "POST" and path == "/api/pair/approve":
            session_id = body.get("sessionId", "")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                auth = self._auth(headers)
                pair = self._pair_participant(session_id, auth, host_only=True)
                mode = body.get("mode")
                encrypted_key = body.get("encryptedKey")
                vault_name = body.get("vaultName", "")
                if (pair["status"] != "pending_approval" or mode not in ("read-write", "receive-only")
                        or not isinstance(encrypted_key, str) or not isinstance(vault_name, str) or not vault_name.strip()):
                    raise ApiError(400, "invalid_pairing_vault")
                vault = self.db.upsert_owned_vault(body.get("vaultId", ""), vault_name.strip(),
                                                   auth["account_id"], auth["device_id"])
                self.db.set_vault_grant(vault["id"], auth["account_id"], pair["guest_device_id"], mode, encrypted_key, "accepted")
                host = self.db.conn.execute("SELECT name, platform FROM devices WHERE id = ?", (auth["device_id"],)).fetchone()
                exchange = {"vaultId": vault["id"], "vaultName": vault["name"], "mode": mode, "encryptedKey": encrypted_key,
                            "hostDeviceId": auth["device_id"], "hostDeviceName": host["name"], "hostPlatform": host["platform"]}
                payload = base64.b64encode(json.dumps(exchange).encode("utf-8")).decode("ascii")
            else:
                payload = body.get("encryptedPayload", "")
            ok = self.db.approve_pairing_session(session_id, payload)
            logger.info("Pairing approval ok=%s", ok)
            return {"status": "approved" if ok else "failed"}, 200 if ok else 400

        if method == "POST" and path == "/api/pair/reject":
            session_id = body.get("sessionId", "")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                self._pair_participant(session_id, self._auth(headers))
            ok = self.db.reject_pairing_session(session_id)
            return {"status": "rejected" if ok else "failed"}, 200 if ok else 400

        if method == "POST" and path == "/api/pair/exchange":
            session_id = body.get("sessionId", "")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                raise ApiError(403, "use_pair_approve")
            ok = self.db.approve_pairing_session(session_id, body.get("encryptedPayload", ""))
            return {"status": "ok" if ok else "failed"}, 200 if ok else 400

        if method == "GET" and path == "/api/pair/poll":
            session_id = query.get("session", "")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                self._pair_participant(session_id, self._auth(headers))
            status = self.db.poll_pairing_session(session_id)
            if not status:
                raise ApiError(404, "session_not_found")
            return status, 200

        if path.startswith("/api/rooms/") and len(path.strip("/").split("/")) == 4:
            parts = path.strip("/").split("/")
            room_id, action = urllib.parse.unquote(parts[2]), parts[3]
            if action not in ("bundle", "bundles", "ack"):
                return {"error": "not_found", "path": path}, 404
            auth = owner_account_id = vault_id = None
            max_cache = self.db.DEFAULT_MAX_CACHE_BYTES
            room = self.db.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
            if self.require_account_auth or self._bearer(headers) or (room and room["vault_id"]):
                auth = self._auth(headers)
                vault_id = query.get("vault", "")
                owner_account_id = self._authorize_room(auth, room_id, vault_id)
                max_cache = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024

            if method == "POST" and action == "bundle":
                if auth:
                    self._authorize_vault(auth, vault_id, write=True)
                bundle = body.get("bundle", body)
                if not isinstance(bundle, dict):
                    raise ApiError(400, "invalid_bundle")
                bundle_id = bundle.get("bundleId", secrets.token_hex(12))
                from_device = bundle.get("fromDeviceId", "unknown")
                if auth and from_device != auth["device_id"]:
                    raise ApiError(403, "device_mismatch")
                seq = int(bundle.get("sequence", 0))
                timestamp = bundle.get("timestamp", str(time.time()))
                payload_str = json.dumps(bundle)
                logger.info("HTTP bundle received (%d B)", len(payload_str))
                saved = self.db.save_bundle(room_id, bundle_id, from_device, seq, timestamp, payload_str,
                                            max_cache_bytes=max_cache, account_id=owner_account_id, vault_id=vault_id)
                if not saved:
                    return {"error": "cache_limit_exceeded"}, 413
                sync_id = saved
                bundle_to_broadcast = dict(bundle)
                bundle_to_broadcast["syncId"] = sync_id
                await self._broadcast_to_room(room_id, json.dumps({"type": "bundle", "bundle": bundle_to_broadcast}), exclude_device=from_device)
                return {"status": "delivered", "bundleId": bundle_id, "syncId": sync_id}, 200

            if method == "GET" and action == "bundles":
                device_id = query.get("device", "")
                if auth:
                    if device_id and device_id != auth["device_id"]:
                        raise ApiError(403, "device_mismatch")
                    device_id = auth["device_id"]
                limit = max(1, min(1000, int(query.get("limit", 100))))
                since_sync_id = 0
                try:
                    since_sync_id = int(query.get("since", "0"))
                except (ValueError, TypeError):
                    since_sync_id = 0
                return {"bundles": self.db.get_pending_bundles(room_id, device_id, limit, since_sync_id=since_sync_id)}, 200

            if method == "POST" and action == "ack":
                device_id = body.get("deviceId", "")
                if auth:
                    if device_id and device_id != auth["device_id"]:
                        raise ApiError(403, "device_mismatch")
                    device_id = auth["device_id"]
                bundle_ids = body.get("bundleIds", [])
                if not isinstance(bundle_ids, list):
                    raise ApiError(400, "invalid_bundle_ids")
                return {"status": "ok", "acked": self.db.record_acks(device_id, bundle_ids, room_id)}, 200

        if method == "POST" and path == "/api/ai/chat":
            auth_token = self._bearer(headers, allow_raw=not self.require_account_auth)
            if not auth_token:
                return {"error": "unauthorized"}, 401
            if self.require_account_auth:
                auth = self.db.authenticate(auth_token)
                if not auth:
                    return {"error": "unauthorized"}, 401
                if auth["plan"] == "free":
                    return {"error": "subscription_required"}, 403
            elif auth_token.startswith("free_") or auth_token == "free":
                return {"error": "subscription_required"}, 403

            master_api_key = os.environ.get("KIE_API_KEY", "").strip()
            if not master_api_key:
                return {"id": f"chatcmpl-{secrets.token_hex(8)}", "object": "chat.completion", "created": int(time.time()),
                        "model": body.get("model", "deepseek-v4-1-flash"),
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": "Запрос обработан через защищённый релей-шлюз SLAG (без логов в памяти)."}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 15, "completion_tokens": 12, "total_tokens": 27}}, 200

            upstream_url = os.environ.get("KIE_BASE_URL", "https://api.kie.ai").rstrip("/") + "/v1/chat/completions"
            req = urllib.request.Request(upstream_url, data=json.dumps(body).encode("utf-8"),
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": master_api_key if master_api_key.startswith("Bearer ") else f"Bearer {master_api_key}",
                                                  "User-Agent": "SLAG-Relay-Gateway/0.2.0"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    await self._send_response(writer, self._http_response(resp.status, "OK", "application/json", resp.read()))
            except urllib.error.HTTPError as exc:
                await self._send_response(writer, self._http_response(exc.code, "Upstream Error", "application/json", exc.read()))
            except Exception as exc:
                logger.warning("Upstream AI gateway exception: %s", type(exc).__name__)
                await self._send_response(writer, self._json_response({"error": "upstream_gateway_failed"}, 502))
            return None

        if method in ("GET", "HEAD") and not path.startswith("/api/") and path != "/health":
            static_dir = os.environ.get("SLAG_STATIC_DIR") or str(Path(__file__).resolve().parent / "dist")
            if os.path.isdir(static_dir):
                clean_path = path.lstrip("/")
                target = (Path(static_dir) / clean_path).resolve()
                if not str(target).startswith(str(Path(static_dir).resolve())):
                    raise ApiError(403, "access_denied")
                if clean_path and target.is_file():
                    mime, _ = mimetypes.guess_type(str(target))
                    data = b"" if method == "HEAD" else target.read_bytes()
                    await self._send_response(writer, self._http_response(200, "OK", mime or "application/octet-stream", data))
                    return None
                index_html = Path(static_dir) / "index.html"
                if index_html.is_file():
                    data = b"" if method == "HEAD" else index_html.read_bytes()
                    await self._send_response(writer, self._http_response(200, "OK", "text/html; charset=utf-8", data))
                    return None

        return {"error": "not_found", "path": path}, 404

    async def handle_ws_upgrade(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                                method: str, full_path: str, headers: dict) -> None:
        parsed = urllib.parse.urlsplit(full_path)
        path = parsed.path
        query = {key: values[-1] for key, values in urllib.parse.parse_qs(parsed.query).items()}
        try:
            account_id = vault_id = None
            max_cache = self.db.DEFAULT_MAX_CACHE_BYTES
            device_id = query.get("device", f"device-{secrets.token_hex(4)}")
            room_id = urllib.parse.unquote(path[4:]).strip("/") if path.startswith("/ws/") else ""
            auth = None
            if not room_id:
                raise ApiError(404, "room_not_found")
            room = self.db.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
            if self.require_account_auth or query.get("token") or self._bearer(headers) or (room and room["vault_id"]):
                token = query.get("token", "") or self._bearer(headers)
                auth = self.db.authenticate(token)
                if not auth:
                    raise ApiError(401, "unauthorized")
                if device_id != auth["device_id"]:
                    raise ApiError(403, "device_mismatch")
                vault_id = query.get("vault", "")
                account_id = self._authorize_room(auth, room_id, vault_id)
                max_cache = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024

            ws_key = headers.get("sec-websocket-key", "")
            if not ws_key:
                raise ApiError(400, "missing_sec_websocket_key")
            accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode("utf-8")).digest()).decode("ascii")
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode("ascii"))
            await writer.drain()
            conn = WebSocketConnection(reader, writer, room_id, device_id, account_id, max_cache)
            conn.token_hash = auth["token_hash"] if auth else None
            conn.vault_id = vault_id
            self.rooms.setdefault(room_id, set()).add(conn)
            self.db.touch_room(room_id, vault_id)
            logger.info("WebSocket connected")
            await conn.send_text(json.dumps({"type": "welcome", "deviceId": device_id, "roomId": room_id,
                                             "connectedDevices": len(self.rooms[room_id])}))
            for item in self.db.get_pending_bundles(room_id, device_id):
                self._check_ws_auth(conn)
                bundle_payload = item["payload"]
                if isinstance(bundle_payload, dict):
                    bundle_payload["syncId"] = item.get("syncId", 0)
                await conn.send_text(json.dumps({"type": "bundle", "bundle": bundle_payload}))
            try:
                while not conn.closed:
                    frame = await conn.read_frame()
                    if frame is None:
                        break
                    opcode, payload = frame
                    if opcode == 0x8:
                        break
                    if opcode == 0x1:
                        await self._handle_ws_message(conn, payload.decode("utf-8", errors="replace"))
            finally:
                if room_id in self.rooms:
                    self.rooms[room_id].discard(conn)
                    if not self.rooms[room_id]:
                        del self.rooms[room_id]
                await conn.close()
                logger.info("WebSocket disconnected")
        except ApiError as exc:
            await self._send_response(writer, self._json_response({"error": exc.error}, exc.status))
        except Exception as exc:
            logger.debug("WS error: %s", type(exc).__name__)
            writer.close()

    def _check_ws_auth(self, conn: WebSocketConnection, write: bool = False) -> None:
        if conn.token_hash:
            auth = self.db.authenticate_hash(conn.token_hash)
            if not auth:
                raise ApiError(401, "unauthorized")
            self._authorize_room(auth, conn.room_id, conn.vault_id)
            self._authorize_vault(auth, conn.vault_id, write=write)
            conn.max_cache_bytes = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024
        else:
            room = self.db.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (conn.room_id,)).fetchone()
            if self.require_account_auth or (room and room["vault_id"]):
                raise ApiError(401, "unauthorized")

    async def _handle_ws_message(self, conn: WebSocketConnection, text: str) -> None:
        try:
            msg = json.loads(text)
            if not isinstance(msg, dict):
                return
            self._check_ws_auth(conn, write=msg.get("type") == "bundle")
            await self._process_ws_message(conn, msg)
        except ApiError as exc:
            await conn.send_text(json.dumps({"type": "error", "code": exc.error}))
        except (ValueError, TypeError):
            await conn.send_text(json.dumps({"type": "error", "code": "invalid_message"}))

    async def _process_ws_message(self, conn: WebSocketConnection, msg: dict) -> None:
        msg_type = msg.get("type")
        if msg_type == "ping":
            await conn.send_text(json.dumps({"type": "pong", "ts": int(time.time())}))
            return
        if msg_type == "ack":
            bundle_ids = msg.get("bundleIds") or ([msg.get("bundleId")] if msg.get("bundleId") else [])
            if bundle_ids:
                self.db.record_acks(conn.device_id, bundle_ids, conn.room_id)
            return
        if msg_type == "bundle":
            bundle = msg.get("bundle", {})
            if not isinstance(bundle, dict):
                return
            bundle_id = bundle.get("bundleId", secrets.token_hex(12))
            from_device = bundle.get("fromDeviceId", conn.device_id)
            if conn.account_id and from_device != conn.device_id:
                await conn.send_text(json.dumps({"type": "error", "code": "device_mismatch"}))
                return
            seq = int(bundle.get("sequence", 0))
            timestamp = bundle.get("timestamp", str(time.time()))
            payload_str = json.dumps(bundle)
            vault_id = self.db.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (conn.room_id,)).fetchone()["vault_id"]
            saved = self.db.save_bundle(conn.room_id, bundle_id, from_device, seq, timestamp, payload_str,
                                        max_cache_bytes=conn.max_cache_bytes, account_id=conn.account_id, vault_id=vault_id)
            if not saved:
                await conn.send_text(json.dumps({"type": "error", "code": "cache_limit_exceeded"}))
                return
            sync_id = saved
            bundle_to_broadcast = dict(bundle)
            bundle_to_broadcast["syncId"] = sync_id
            await self._broadcast_to_room(conn.room_id, json.dumps({"type": "bundle", "bundle": bundle_to_broadcast}), exclude_device=conn.device_id)
            await conn.send_text(json.dumps({"type": "server_ack", "bundleId": bundle_id, "sequence": seq, "syncId": sync_id}))

    async def _broadcast_to_room(self, room_id: str, message_str: str, exclude_device: Optional[str] = None) -> None:
        for client in list(self.rooms.get(room_id, set())):
            if exclude_device and client.device_id == exclude_device:
                continue
            try:
                self._check_ws_auth(client)
            except ApiError:
                await client.close()
                continue
            await client.send_text(message_str)

    async def background_cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            try:
                self.db.cleanup_expired()
            except Exception as exc:
                logger.error("Cleanup error: %s", exc)

    async def run(self) -> None:
        server = await asyncio.start_server(self.handle_connection, self.host, self.port)
        addrs = ", ".join(str(sock.getsockname()) for sock in server.sockets)
        logger.info("SLAG Relay Server running on %s (DB: %s, account auth: %s)", addrs, self.db.db_path, self.require_account_auth)
        asyncio.create_task(self.background_cleanup_loop())
        async with server:
            await server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="SLAG v2 Zero-Knowledge Relay Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--db", default="data/relay.db")
    parser.add_argument("--admin-token", default=os.environ.get("SLAG_ADMIN_TOKEN"))
    args = parser.parse_args()
    relay = SlagRelayServer(args.host, args.port, args.db, admin_token=args.admin_token)
    try:
        asyncio.run(relay.run())
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")


if __name__ == "__main__":
    main()
