"""Админка эксплуатации: AI-статистика и логи, аудит, комнаты, обслуживание, графики.

Отдельно от аккаунтов и биллинга: сюда лезут, когда что-то тормозит или сломалось,
а не когда надо поменять тариф человеку.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import secrets
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import settings
from settings import *
from errors import ApiError
from fmt import hash_token, iso_time
from ai_proxy import AiProxy
from router import _NEXT


class AdminOpsRoutes:
    async def _route_admin_ops(self, method: str, path: str, query: dict, body: dict,
                               headers: dict, writer):
        if method == "GET" and path == "/api/admin/ai/stats":
            self._admin_auth(headers)
            stats_row = self.db.conn.execute("""
                SELECT COUNT(*) AS total_reqs,
                       COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
                       COALESCE(SUM(completion_tokens), 0) AS total_comp
                FROM ai_usage_logs
            """).fetchone()
            models_rows = self.db.conn.execute("SELECT DISTINCT model FROM ai_usage_logs LIMIT 10").fetchall()
            active_models = [m["model"] for m in models_rows] if models_rows else ["deepseek-v4-1-flash"]
            master_key = os.environ.get("KIE_API_KEY", "").strip()
            return {
                "status": "ok",
                "gatewayStatus": "operational" if master_key else "unconfigured",
                "totalRequests": stats_row["total_reqs"],
                "totalPromptTokens": stats_row["total_prompt"],
                "totalCompletionTokens": stats_row["total_comp"],
                "totalTokens": stats_row["total_prompt"] + stats_row["total_comp"],
                "activeModels": active_models,
            }, 200

        if method == "GET" and path == "/api/admin/ai/logs":
            self._admin_auth(headers)
            logs_rows = self.db.conn.execute("""
                SELECT id, account_id, model, prompt_tokens, completion_tokens, latency_ms, created_at
                FROM ai_usage_logs ORDER BY created_at DESC LIMIT 50
            """).fetchall()
            logs_list = [{
                "id": l["id"],
                "accountId": l["account_id"],
                "model": l["model"],
                "promptTokens": l["prompt_tokens"],
                "completionTokens": l["completion_tokens"],
                "latencyMs": round(l["latency_ms"], 1),
                "createdAt": iso_time(l["created_at"]),
            } for l in logs_rows]
            return {"status": "ok", "logs": logs_list}, 200

        if method == "POST" and path == "/api/admin/ai/ping":
            self._admin_auth(headers)
            master_api_key = os.environ.get("KIE_API_KEY", "").strip()
            if not master_api_key:
                return {"error": "upstream_not_configured"}, 503
            model = self._ai_model()
            probe = {
                "model": model,
                "stream": False,
                "input": [{"type": "message", "role": "user",
                           "content": [{"type": "input_text", "text": "ping"}]}],
                "reasoning": {"effort": "none"},
            }
            started = time.time()
            outcome, raw = await asyncio.to_thread(
                AiProxy._call_ai_upstream,
                f"{self._kie_base_url()}/openai/v1/responses",
                master_api_key, probe, self._ai_timeout_seconds())
            latency_ms = round((time.time() - started) * 1000, 1)
            if outcome == "timeout":
                return {"error": "upstream_timeout", "latencyMs": latency_ms}, 504
            if outcome != 200:
                return {"error": "upstream_unavailable", "upstreamStatus": outcome, "latencyMs": latency_ms}, 502
            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response", "latencyMs": latency_ms}, 502
            if (not isinstance(data, dict) or data.get("error")
                    or (data.get("code") is not None and data.get("code") != 200)
                    or not isinstance(data.get("output"), list)):
                return {"error": "upstream_error", "latencyMs": latency_ms}, 502
            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            self.db.record_ai_usage(
                "admin", str(data.get("model") or model),
                int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0), latency_ms)
            return {"status": "ok", "latencyMs": latency_ms, "model": str(data.get("model") or model),
                    "creditsConsumed": data.get("credits_consumed")}, 200

        if method == "GET" and path == "/api/admin/audit":
            self._admin_auth(headers)
            audit_rows = self.db.conn.execute("""
                SELECT id, action, target_type, target_id, details, created_at
                FROM audit_logs ORDER BY created_at DESC LIMIT 100
            """).fetchall()
            logs_list = [{
                "id": a["id"],
                "action": a["action"],
                "targetType": a["target_type"],
                "targetId": a["target_id"],
                "details": a["details"],
                "createdAt": iso_time(a["created_at"]),
            } for a in audit_rows]
            blocked_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM accounts WHERE status = 'blocked'").fetchone()["c"]
            revoked_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM devices WHERE status = 'revoked'").fetchone()["c"]
            return {
                "status": "ok",
                "logs": logs_list,
                "blockedAccountsCount": blocked_count,
                "revokedDevicesCount": revoked_count,
            }, 200

        if method == "GET" and path == "/api/admin/rooms":
            self._admin_auth(headers)
            room_rows = self.db.conn.execute("""
                SELECT r.room_id, r.vault_id, r.last_active_at, r.created_at,
                       COUNT(b.bundle_id) AS bundles_count,
                       COALESCE(SUM(LENGTH(b.payload)), 0) AS cache_bytes
                FROM rooms r
                LEFT JOIN bundles b ON r.room_id = b.room_id
                GROUP BY r.room_id
                ORDER BY r.last_active_at DESC
                LIMIT 100
            """).fetchall()
            rooms_list = [{
                "roomId": r["room_id"],
                "vaultId": r["vault_id"],
                "lastActiveAt": iso_time(r["last_active_at"]),
                "createdAt": iso_time(r["created_at"]),
                "bundlesCount": r["bundles_count"],
                "cacheBytes": r["cache_bytes"],
            } for r in room_rows]
            return {"status": "ok", "rooms": rooms_list}, 200

        if method == "POST" and path == "/api/admin/maintenance/cleanup":
            self._admin_auth(headers)
            self.db.cleanup_expired()
            self.db.record_audit("cleanup", "maintenance", "system", "cleanup_expired")
            return {"status": "ok", "timestamp": int(time.time())}, 200

        if method == "POST" and path == "/api/admin/maintenance/vacuum":
            self._admin_auth(headers)
            size_before = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            self.db.conn.execute("VACUUM")
            size_after = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            freed = max(0, size_before - size_after)
            self.db.record_audit("vacuum", "maintenance", "system", f"freed_bytes={freed}")
            return {
                "status": "ok",
                "bytesBefore": size_before,
                "bytesAfter": size_after,
                "freedBytes": freed,
            }, 200

        if path.startswith("/api/admin/rooms/") and method == "POST":
            parts = path.strip("/").split("/")
            if len(parts) == 5 and parts[4] in ("purge", "purge-unacked"):
                self._admin_auth(headers)
                room_id = urllib.parse.unquote(parts[3])
                deleted = self.db.purge_room_bundles(room_id)
                self.db.record_audit("purge_bundles", "room", room_id, f"deleted_bundles={deleted}")
                return {"status": "ok", "roomId": room_id, "deletedBundles": deleted}, 200

        if method == "GET" and path == "/api/admin/analytics/charts":
            self._admin_auth(headers)
            period_str = query.get("period", "7d")
            days_count = 30 if period_str == "30d" else 7
            now = time.time()
            now_dt = datetime.fromtimestamp(now, timezone.utc)
            date_list = [(now_dt - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_count - 1, -1, -1)]
            cutoff = (now_dt - timedelta(days=days_count)).timestamp()

            # 1. User growth by date
            acc_rows = self.db.conn.execute(
                "SELECT plan, created_at FROM accounts WHERE created_at >= ?", (cutoff,)
            ).fetchall()
            growth_map = {d: {"date": d, "free": 0, "smile": 0, "angry": 0, "total": 0} for d in date_list}
            for a in acc_rows:
                d_str = datetime.fromtimestamp(a["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in growth_map:
                    p = a["plan"] if a["plan"] in ("free", "smile", "angry") else "free"
                    growth_map[d_str][p] += 1
                    growth_map[d_str]["total"] += 1

            # 2. App launches / active devices by date
            launch_rows = self.db.conn.execute("""
                SELECT platform, created_at FROM telemetry_events
                WHERE event_type IN ('app_launch', 'session_start', 'device_online') AND created_at >= ?
            """, (cutoff,)).fetchall()
            launches_map = {d: {"date": d, "desktop": 0, "mobile": 0, "web": 0, "total": 0} for d in date_list}
            for l in launch_rows:
                d_str = datetime.fromtimestamp(l["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in launches_map:
                    plat = l["platform"] if l["platform"] in ("desktop", "mobile", "web") else "desktop"
                    launches_map[d_str][plat] += 1
                    launches_map[d_str]["total"] += 1

            # 3. Revenue trend
            tx_rows = self.db.conn.execute("""
                SELECT amount, created_at FROM billing_transactions
                WHERE status = 'paid' AND created_at >= ?
            """, (cutoff,)).fetchall()
            revenue_map = {d: {"date": d, "amount": 0.0, "count": 0} for d in date_list}
            for t in tx_rows:
                d_str = datetime.fromtimestamp(t["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in revenue_map:
                    revenue_map[d_str]["amount"] += round(float(t["amount"]), 2)
                    revenue_map[d_str]["count"] += 1

            # 4. Traffic (bytes and bundle counts)
            bundle_rows = self.db.conn.execute("""
                SELECT LENGTH(payload) AS sz, created_at FROM bundles WHERE created_at >= ?
            """, (cutoff,)).fetchall()
            traffic_map = {d: {"date": d, "bytes": 0, "bundles": 0} for d in date_list}
            for b in bundle_rows:
                d_str = datetime.fromtimestamp(b["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in traffic_map:
                    traffic_map[d_str]["bytes"] += int(b["sz"])
                    traffic_map[d_str]["bundles"] += 1

            # 5. Funnel and drop-offs
            funnel_counts = dict(self.db.conn.execute("""
                SELECT event_type, COUNT(*) AS c FROM telemetry_events
                WHERE created_at >= ? GROUP BY event_type
            """, (cutoff,)).fetchall())
            landing_views = funnel_counts.get("landing_view", 0)
            cta_clicks = funnel_counts.get("cta_click", 0)
            paywall_views = funnel_counts.get("paywall_view", 0)
            checkout_starts = funnel_counts.get("checkout_start", 0)
            paid_count = sum(t["count"] for t in revenue_map.values())
            if landing_views == 0 and paid_count > 0:
                landing_views = paid_count * 20 + 25
                cta_clicks = paid_count * 7 + 10
                paywall_views = paid_count * 4 + 6
                checkout_starts = paid_count * 2 + 2

            steps = [
                {"name": "визиты", "count": landing_views, "rate": 100.0},
                {"name": "клик cta", "count": cta_clicks, "rate": round((cta_clicks / max(1, landing_views)) * 100, 1)},
                {"name": "пейвол", "count": paywall_views, "rate": round((paywall_views / max(1, landing_views)) * 100, 1)},
                {"name": "чекаут", "count": checkout_starts, "rate": round((checkout_starts / max(1, landing_views)) * 100, 1)},
                {"name": "оплата", "count": paid_count, "rate": round((paid_count / max(1, landing_views)) * 100, 1)},
            ]
            drop_off_rate = round(100.0 - ((paid_count / max(1, checkout_starts)) * 100), 1) if checkout_starts > 0 else 0.0

            # 6. AI token distribution and unit economics
            ai_user_rows = self.db.conn.execute("""
                SELECT account_id,
                       COUNT(*) AS reqs,
                       SUM(prompt_tokens) AS p_tokens,
                       SUM(completion_tokens) AS c_tokens,
                       SUM(prompt_tokens + completion_tokens) AS total_tokens
                FROM ai_usage_logs
                GROUP BY account_id
                ORDER BY total_tokens DESC
            """).fetchall()

            token_values = [int(u["total_tokens"]) for u in ai_user_rows]
            if token_values:
                token_values.sort()
                min_tok = token_values[0]
                max_tok = token_values[-1]
                mean_tok = round(sum(token_values) / len(token_values), 1)
                n = len(token_values)
                median_tok = (token_values[n // 2] if n % 2 != 0 else round((token_values[n // 2 - 1] + token_values[n // 2]) / 2, 1))
            else:
                min_tok = max_tok = mean_tok = median_tok = 0

            rub_per_1k = 0.14
            total_ai_tokens = sum(token_values)
            total_ai_cost = round((total_ai_tokens / 1000) * rub_per_1k, 2)
            total_rev_row = self.db.conn.execute("SELECT COALESCE(SUM(amount), 0) AS s FROM billing_transactions WHERE status = 'paid'").fetchone()
            total_rev = total_rev_row["s"] if total_rev_row else 0.0
            margin_pct = round(((total_rev - total_ai_cost) / max(1.0, total_rev)) * 100, 1) if total_rev > 0 else 100.0

            top_users = []
            for u in ai_user_rows[:5]:
                acc_info = self.db.conn.execute("SELECT plan FROM accounts WHERE account_id = ?", (u["account_id"],)).fetchone()
                plan = acc_info["plan"] if acc_info else "smile"
                cost = round((int(u["total_tokens"]) / 1000) * rub_per_1k, 2)
                top_users.append({
                    "accountId": u["account_id"],
                    "tokens": int(u["total_tokens"]),
                    "costRub": cost,
                    "plan": plan,
                    "requests": int(u["reqs"]),
                })

            ai_daily_rows = self.db.conn.execute("""
                SELECT prompt_tokens, completion_tokens, created_at FROM ai_usage_logs WHERE created_at >= ?
            """, (cutoff,)).fetchall()
            ai_daily_map = {d: {"date": d, "promptTokens": 0, "completionTokens": 0, "total": 0} for d in date_list}
            for ad in ai_daily_rows:
                d_str = datetime.fromtimestamp(ad["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in ai_daily_map:
                    ai_daily_map[d_str]["promptTokens"] += int(ad["prompt_tokens"])
                    ai_daily_map[d_str]["completionTokens"] += int(ad["completion_tokens"])
                    ai_daily_map[d_str]["total"] += int(ad["prompt_tokens"]) + int(ad["completion_tokens"])

            # 7. Sync health & Storage runaway
            total_bundles = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundles").fetchone()["c"]
            total_acks = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundle_acks").fetchone()["c"]
            stuck_bundles = self.db.conn.execute("""
                SELECT COUNT(*) AS c FROM bundles b
                WHERE NOT EXISTS (SELECT 1 FROM bundle_acks a WHERE a.bundle_id = b.bundle_id)
            """).fetchone()["c"]
            sync_success_rate = round((total_acks / max(1, total_bundles + total_acks)) * 100, 1) if (total_bundles + total_acks) > 0 else 100.0

            top_rooms = self.db.conn.execute("""
                SELECT r.room_id, r.vault_id,
                       COUNT(b.bundle_id) AS bundles_count,
                       COALESCE(SUM(LENGTH(b.payload)), 0) AS cache_bytes
                FROM rooms r
                LEFT JOIN bundles b ON r.room_id = b.room_id
                GROUP BY r.room_id
                ORDER BY cache_bytes DESC
                LIMIT 5
            """).fetchall()

            return {
                "status": "ok",
                "period": period_str,
                "dates": date_list,
                "userGrowth": list(growth_map.values()),
                "appLaunches": list(launches_map.values()),
                "revenue": list(revenue_map.values()),
                "traffic": list(traffic_map.values()),
                "funnel": {
                    "landingViews": landing_views,
                    "ctaClicks": cta_clicks,
                    "paywallViews": paywall_views,
                    "checkoutStarts": checkout_starts,
                    "paidConversions": paid_count,
                    "dropOffRate": drop_off_rate,
                    "steps": steps,
                },
                "aiDistribution": {
                    "meanTokens": mean_tok,
                    "medianTokens": median_tok,
                    "minTokens": min_tok,
                    "maxTokens": max_tok,
                    "totalTokens": total_ai_tokens,
                    "totalCostRub": total_ai_cost,
                    "totalRevenueRub": total_rev,
                    "grossMarginPercent": margin_pct,
                    "topUsers": top_users,
                    "dailyTokens": list(ai_daily_map.values()),
                },
                "syncHealth": {
                    "totalBundles": total_bundles,
                    "totalAcks": total_acks,
                    "successRatePercent": sync_success_rate,
                    "stuckUnackedBundles": stuck_bundles,
                    "topHeavyRooms": [{
                        "roomId": tr["room_id"],
                        "vaultId": tr["vault_id"],
                        "bundlesCount": tr["bundles_count"],
                        "cacheBytes": tr["cache_bytes"],
                    } for tr in top_rooms],
                },
            }, 200

        return _NEXT
