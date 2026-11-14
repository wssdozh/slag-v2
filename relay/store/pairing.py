"""Pairing-сессии: PIN, SAS, обмен ключами. Короткоживущие и одноразовые."""

from __future__ import annotations

import sqlite3
import hashlib
from errors import ApiError
import secrets
import time
from typing import Optional

from settings import *


class PairingMixin:
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
