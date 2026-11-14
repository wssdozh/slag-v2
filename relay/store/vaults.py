"""Хранилища и гранты на них: владелец, режим доступа, accept/decline."""

import sqlite3
import secrets
from errors import ApiError
import time
from typing import Optional

from settings import *


class VaultsMixin:
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
