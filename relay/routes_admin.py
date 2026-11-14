"""Админка: статистика, аккаунты, биллинг, AI, аудит, комнаты, графики.

Часть `_route_http`: одна функция на домен, порядок вызовов задаёт `router.py`, а
`_NEXT` значит «здесь не нашлось, ищи дальше» — иначе prefix-блоки перестанут
проваливаться сквозь себя, как было в одной длинной цепочке `if`.
"""

import asyncio
import base64
import json
import mimetypes
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
import urllib.parse
from pathlib import Path

import settings
from settings import *
from ai_proxy import AiProxy
from errors import ApiError
from fmt import hash_token, iso_time
from assistant_card import *
from router import _NEXT


class AdminRoutes:
    async def _route_admin(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
        if method == "GET" and path == "/api/admin/stats":
            self._admin_auth(headers)
            now = time.time()
            accounts_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM accounts").fetchone()["c"]
            devices_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM devices").fetchone()["c"]
            bundles_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundles").fetchone()["c"]
            total_cache = self.db.conn.execute("SELECT COALESCE(SUM(LENGTH(payload)), 0) AS s FROM bundles").fetchone()["s"]
            active_sessions = self.db.conn.execute("SELECT COUNT(*) AS c FROM auth_sessions WHERE expires_at > ?", (now,)).fetchone()["c"]
            pending_pairings = self.db.conn.execute("SELECT COUNT(*) AS c FROM pairing_sessions WHERE expires_at > ?", (now,)).fetchone()["c"]
            total_vaults = self.db.conn.execute("SELECT COUNT(*) AS c FROM vaults").fetchone()["c"]
            db_size = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            return {
                "status": "ok",
                "uptime": int(now - self.start_time),
                "totalAccounts": accounts_count,
                "totalDevices": devices_count,
                "activeRooms": len(self.rooms),
                "totalBundles": bundles_count,
                "totalCacheBytes": total_cache,
                "activeSessions": active_sessions,
                "pendingPairings": pending_pairings,
                "totalVaults": total_vaults,
                "dbSizeBytes": db_size,
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
                vault_rows = self.db.conn.execute("""
                    SELECT v.id, v.name, v.updated_at,
                           (SELECT COUNT(*) FROM vault_grants WHERE vault_id = v.id AND status = 'accepted') AS grants_count
                    FROM vaults v WHERE v.owner_account_id = ? ORDER BY v.updated_at DESC
                """, (acc_id,)).fetchall()
                p["vaults"] = [{"id": v["id"], "name": v["name"], "updatedAt": iso_time(v["updated_at"]),
                                "grantsCount": v["grants_count"]} for v in vault_rows]
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
                self.db.record_audit("change_plan", "account", account_id, f"plan={plan_name}")
                return {"status": "ok", "account": self.db.account_payload(account_id)}, 200

            if len(parts) == 5 and parts[4] == "toggle-status" and method == "POST":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                account = self.db.conn.execute("SELECT status FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
                if not account:
                    raise ApiError(404, "account_not_found")
                new_status = "blocked" if account["status"] == "active" else "active"
                with self.db.conn:
                    self.db.conn.execute("UPDATE accounts SET status = ? WHERE account_id = ?", (new_status, account_id))
                    if new_status == "blocked":
                        self.db.conn.execute("DELETE FROM auth_sessions WHERE account_id = ?", (account_id,))
                self.db.record_audit("toggle_status", "account", account_id, f"status={new_status}")
                return {"status": "ok", "account": self.db.account_payload(account_id)}, 200

            if len(parts) == 6 and parts[4] == "devices" and method == "POST":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                device_id = urllib.parse.unquote(parts[5])
                self.db.revoke_device(account_id, device_id)
                self.db.record_audit("revoke_device", "device", device_id, f"account={account_id}")
                return {"status": "ok", "deviceId": device_id, "accountStatus": "revoked"}, 200

        if method == "GET" and path == "/api/admin/billing/stats":
            self._admin_auth(headers)
            accounts = self.db.conn.execute("SELECT plan, status FROM accounts").fetchall()
            active_accounts = [a for a in accounts if a["status"] == "active"]
            paid_count = sum(1 for a in active_accounts if a["plan"] in ("smile", "angry"))
            free_count = sum(1 for a in active_accounts if a["plan"] == "free")
            mrr = sum(190 if a["plan"] == "smile" else 490 if a["plan"] == "angry" else 0 for a in active_accounts)
            rev_row = self.db.conn.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM billing_transactions WHERE status = 'paid'").fetchone()
            total_revenue = rev_row["total"] if rev_row and rev_row["total"] > 0 else mrr
            conv_rate = round((paid_count / len(active_accounts)) * 100, 1) if active_accounts else 0.0
            return {
                "status": "ok",
                "mrr": mrr,
                "totalRevenue": total_revenue,
                "paidAccounts": paid_count,
                "freeAccounts": free_count,
                "conversionRate": conv_rate,
            }, 200

        if method == "GET" and path == "/api/admin/billing/transactions":
            self._admin_auth(headers)
            tx_rows = self.db.conn.execute("""
                SELECT id, account_id, amount, currency, plan, period_days, status, created_at
                FROM billing_transactions ORDER BY created_at DESC LIMIT 50
            """).fetchall()
            tx_list = [{
                "id": t["id"],
                "accountId": t["account_id"],
                "amount": t["amount"],
                "currency": t["currency"],
                "plan": t["plan"],
                "periodDays": t["period_days"],
                "status": t["status"],
                "createdAt": iso_time(t["created_at"]),
            } for t in tx_rows]
            return {"status": "ok", "transactions": tx_list}, 200

        if method == "POST" and path == "/api/admin/billing/grant":
            self._admin_auth(headers)
            account_id = body.get("accountId", "").strip()
            plan = body.get("plan", "smile").strip().lower()
            period_days = int(body.get("periodDays", 30))
            amount = float(body.get("amount", 190.0 if plan == "smile" else 490.0))
            if plan not in PLANS or period_days <= 0:
                raise ApiError(400, "invalid_grant_parameters")
            account = self.db.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
            if not account:
                raise ApiError(404, "account_not_found")
            now = time.time()
            expires_at = now + period_days * 86400
            tx_id = f"tx_{secrets.token_hex(8)}"
            with self.db.conn:
                self.db.conn.execute(
                    "UPDATE accounts SET plan = ?, expires_at = ?, status = 'active' WHERE account_id = ?",
                    (plan, expires_at, account_id)
                )
                self.db.conn.execute(
                    "INSERT INTO billing_transactions VALUES (?, ?, ?, 'RUB', ?, ?, 'paid', ?)",
                    (tx_id, account_id, amount, plan, period_days, now)
                )
            self.db.record_audit("grant_subscription", "account", account_id, f"plan={plan}, days={period_days}, amount={amount}")
            return {"status": "ok", "transactionId": tx_id, "account": self.db.account_payload(account_id)}, 200

        return _NEXT
