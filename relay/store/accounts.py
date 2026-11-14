"""Аккаунты, устройства, сессии и аудит.

Токен сессии хранится хэшем, аккаунт — только публичным ключом: приватный ключ
не покидает устройство, и серверу нечего терять.
"""

import sqlite3
import hashlib
import secrets
import time
from typing import Optional

from fmt import hash_token, iso_time
from settings import *
from errors import ApiError


class AccountsMixin:
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

    def record_audit(self, action: str, target_type: str, target_id: str, details: str) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT INTO audit_logs (id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (f"aud_{secrets.token_hex(6)}", action, target_type, target_id, details, time.time())
            )

    def record_ai_usage(self, account_id: str, model: str, prompt_tokens: int, completion_tokens: int,
                        latency_ms: float) -> None:
        """Stores token and latency counters only — never the prompt or the reply text."""
        with self.conn:
            self.conn.execute(
                "INSERT INTO ai_usage_logs VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"ai_{secrets.token_hex(6)}", account_id, model,
                 max(0, int(prompt_tokens)), max(0, int(completion_tokens)), float(latency_ms), time.time())
            )

    def count_ai_requests_since(self, account_id: str, since_ts: float) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) AS c FROM ai_usage_logs WHERE account_id = ? AND created_at >= ?",
            (account_id, since_ts)
        ).fetchone()
        return int(row["c"])

    def account_payload(self, account_id: str) -> dict:
        account = self.conn.execute("SELECT * FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
        if not account:
            raise ApiError(404, "account_not_found")
        plan = PLANS.get(account["plan"], PLANS["free"])
        status = account["status"] if "status" in account.keys() else "active"
        expires_at = iso_time(account["expires_at"]) if "expires_at" in account.keys() and account["expires_at"] else None
        return {
            "id": account_id, "plan": account["plan"], "planLabel": plan["label"], "expiresAt": expires_at,
            "status": status,
            "maxDevices": plan["devices"], "maxCacheMb": plan["cache_mb"],
            "usedCacheMb": round(self.get_account_cache_bytes(account_id) / (1024 * 1024), 3),
            "allowAttachments": True, "hasAiLease": account["plan"] in ("smile", "angry") and status == "active"
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
        now = time.time()
        row = self.conn.execute("""
            SELECT s.token_hash, s.account_id, s.device_id, s.expires_at, a.plan
            FROM auth_sessions s
            JOIN accounts a ON a.account_id = s.account_id
            JOIN devices d ON d.id = s.device_id AND d.account_id = s.account_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND d.status = 'active' AND COALESCE(a.status, 'active') = 'active'
        """, (token_hash, now)).fetchone()
        if row:
            # A used session slides forward, so an open app never gets logged out. Only once the
            # half of the term is gone: the websocket authenticates every message and a row write
            # per ping is waste.
            renewed = self.conn.execute(
                "UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at < ?",
                (now + SESSION_TTL_SECONDS, token_hash, now + SESSION_TTL_SECONDS / 2))
            self.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (now, row["device_id"]))
            if renewed.rowcount:
                self.conn.commit()
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
        if row["status"] not in ("pending", "revoked"):
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

    def forget_device(self, account_id: str, device_id: str) -> None:
        if not self.conn.execute("SELECT 1 FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone():
            raise ApiError(404, "device_not_found")
        with self.conn:
            self.conn.execute("DELETE FROM vault_grants WHERE device_id = ?", (device_id,))
            self.conn.execute("DELETE FROM auth_sessions WHERE device_id = ?", (device_id,))
            self.conn.execute("DELETE FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id))
