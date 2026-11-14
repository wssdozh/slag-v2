"""Приглашения в Telegram, включение ассистента, ожидающие вопросы.

Часть `_route_http`: одна функция на домен, порядок вызовов задаёт `router.py`, а
`_NEXT` значит «здесь не нашлось, ищи дальше» — иначе prefix-блоки перестанут
проваливаться сквозь себя, как было в одной длинной цепочке `if`.
"""

import asyncio
import hmac
import sqlite3
import base64
import json
import mimetypes
import os
import secrets
import time
import urllib.parse
from pathlib import Path

import settings
from settings import *
from errors import ApiError
from fmt import hash_token, iso_time
from assistant_card import *
from router import _NEXT


class NotifyRoutes:
    async def _route_notify(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
        if method == "POST" and path == "/api/notify/invite":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            if not self.bot or not self.notify_pepper:
                raise ApiError(503, "notify_bot_not_configured")
            if not self._allow_request(f"notify-invite:{auth['account_id']}", settings.RATE_LIMIT_NOTIFY_INVITE):
                return {"error": "too_many_requests"}, 429
            vault_id = body.get("vaultId", "")
            if not isinstance(vault_id, str) or not vault_id:
                raise ApiError(400, "invalid_vault")
            # A receive-only device has no business queueing messages for the vault.
            self._authorize_vault(auth, vault_id, write=True)
            for _ in range(3):
                code = secrets.token_hex(6)
                route_token = secrets.token_hex(16)
                try:
                    expires_at = self.db.create_notify_invite(vault_id, code, route_token)
                    break
                except sqlite3.IntegrityError:
                    continue
            else:
                raise ApiError(409, "invite_conflict")
            link = f"https://t.me/{self.bot.username}?start={code}" if self.bot.username else None
            return {"code": code, "routeToken": route_token, "link": link,
                    "expiresAt": iso_time(expires_at), "expiresIn": NOTIFY_INVITE_TTL_SECONDS}, 200

        # A capability token belongs in a body, not a query string: proxies and access logs keep
        # URLs long after the request is gone. GET stays for older clients.
        if path == "/api/notify/status" and method in ("GET", "POST"):
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            source = body if method == "POST" else query
            vault_id = source.get("vaultId", "")
            route_token = source.get("routeToken", "")
            if not vault_id or not route_token:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id)
            return {"state": self._notify_channel_state(vault_id, route_token)}, 200

        if method == "POST" and path == "/api/notify/arm":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            if not self._allow_request(f"notify-arm:{auth['account_id']}", settings.RATE_LIMIT_NOTIFY_ARM):
                return {"error": "too_many_requests"}, 429
            vault_id = body.get("vaultId", "")
            if not isinstance(vault_id, str) or not vault_id:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id, write=True)
            if self.db.count_notify_jobs_for_account(auth["account_id"]) > NOTIFY_MAX_JOBS_PER_ACCOUNT:
                raise ApiError(429, "notify_queue_full")
            armed, dropped = self._arm_notifications(body, vault_id)
            return {"armed": armed, "dropped": dropped}, 200

        if method == "POST" and path == "/api/assistant/enable":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            route_token = body.get("routeToken", "")
            enabled = body.get("enabled") is not False
            mode = body.get("mode") if isinstance(body.get("mode"), str) else "minimal"
            if mode not in ("minimal", "risky"):
                raise ApiError(400, "invalid_assistant_mode")
            if not isinstance(vault_id, str) or not vault_id or not isinstance(route_token, str) or not route_token:
                raise ApiError(400, "invalid_assistant_link")
            self._authorize_vault(auth, vault_id, write=True)
            route = self.notify.get(route_token)
            if not route or not hmac.compare_digest(route["vault_tag"], self._notify_tag(vault_id)):
                raise ApiError(404, "route_not_found")
            self.db.set_assistant_link(route_token, vault_id, enabled, mode)
            return {"enabled": enabled, "mode": mode}, 200

        # A device that reconnects after the broadcast still owes the chat an answer. The socket
        # message is fire-and-forget, this is the catch-up.
        if method == "GET" and path == "/api/assistant/pending":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = query.get("vaultId", "")
            if not vault_id:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id)
            if not self._device_is_current(auth["device_id"], vault_id):
                # Its copy predates the newest bundle: an answer from it is about a vault that has
                # already changed, so the question waits for a device that has actually read it.
                return {"requests": []}, 200
            now = time.time()
            pending = [{"requestId": row["id"], "question": row["question"], "mode": row["mode"],
                        "expiresAt": row["expires_at"]}
                       for row in self.db.pending_assistant_requests(vault_id, now)]
            return {"requests": pending}, 200

        if method == "POST" and path == "/api/assistant/answer":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            request_id = body.get("requestId", "")
            answer = body.get("answer", "")
            if (not isinstance(vault_id, str) or not vault_id or not isinstance(request_id, str)
                    or not request_id or not isinstance(answer, str) or not answer.strip()):
                raise ApiError(400, "invalid_answer")
            # Optional and opaque: the device decides what may be applied, the relay only carries
            # it to the chat and back to whichever device is online when the button is tapped.
            action = body.get("action")
            if action is not None:
                action = self._validate_assistant_action(action)
            self._authorize_vault(auth, vault_id, write=True)
            result = await self._answer_assistant(vault_id, request_id, answer,
                                                  base_url=self._public_base(headers), action=action,
                                                  answered_by=str(auth.get("device_id") or ""))
            return result, 200

        # The device that ran the action closes the loop: the bubble under the answer says what
        # happened and the button goes away, so a second tap cannot ask for the same thing twice.
        if method == "POST" and path == "/api/assistant/applied":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            request_id = body.get("requestId", "")
            ok = body.get("ok")
            text = body.get("text", "")
            if (not isinstance(vault_id, str) or not vault_id or not isinstance(request_id, str)
                    or not request_id or not isinstance(ok, bool) or not isinstance(text, str)):
                raise ApiError(400, "invalid_applied")
            self._authorize_vault(auth, vault_id, write=True)
            result = await self._apply_assistant_action(vault_id, request_id, ok, text,
                                                        base_url=self._public_base(headers))
            return result, 200

        return _NEXT
