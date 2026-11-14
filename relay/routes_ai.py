"""Прокси к моделям: чат, vision, whisper. Ничего не хранит, только считает.

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
import urllib.parse
from pathlib import Path

import settings
from settings import *
from ai_proxy import AiProxy
from errors import ApiError
from fmt import hash_token, iso_time
from assistant_card import *
from router import _NEXT


class AiRoutes:
    async def _route_ai(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
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
                account_id = auth["account_id"]
            else:
                if auth_token.startswith("free_") or auth_token == "free":
                    return {"error": "subscription_required"}, 403
                account_id = "self-hosted"

            master_api_key = os.environ.get("KIE_API_KEY", "").strip()
            if not master_api_key:
                return {"error": "upstream_not_configured"}, 503

            allowed_model = self._ai_model()
            requested_model = str(body.get("model") or "").strip()
            if not requested_model or self._normalize_ai_model(requested_model) != self._normalize_ai_model(allowed_model):
                return {"error": "model_not_allowed", "allowed": allowed_model}, 400

            daily_limit = self._ai_daily_limit()
            if daily_limit > 0 and self.db.count_ai_requests_since(account_id, time.time() - 86400) >= daily_limit:
                return {"error": "ai_daily_limit", "limit": daily_limit}, 429

            # KIE chat models speak the OpenAI Responses protocol, not /v1/chat/completions.
            upstream_payload = {**body, "model": allowed_model, "stream": False}
            started = time.time()
            outcome, raw = await asyncio.to_thread(
                AiProxy._call_ai_upstream,
                f"{self._kie_base_url()}/openai/v1/responses",
                master_api_key, upstream_payload, self._ai_timeout_seconds())
            latency_ms = (time.time() - started) * 1000

            if outcome == "timeout":
                return {"error": "upstream_timeout"}, 504
            if outcome == "network" or not isinstance(outcome, int):
                return {"error": "upstream_gateway_failed"}, 502
            if not 200 <= outcome < 300:
                logger.warning("AI upstream HTTP %s", outcome)
                return {"error": "upstream_gateway_failed", "upstreamStatus": outcome}, 502

            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response"}, 502
            if not isinstance(data, dict):
                return {"error": "upstream_invalid_response"}, 502

            error_obj = data.get("error")
            if error_obj:
                message = error_obj.get("message") if isinstance(error_obj, dict) else error_obj
                logger.warning("AI upstream error: %s", str(message)[:200])
                return {"error": "upstream_error", "detail": str(message)[:200]}, 502

            upstream_code = data.get("code")
            if upstream_code is not None and upstream_code != 200:
                message = str(data.get("msg") or "upstream_error")[:200]
                logger.warning("AI upstream code %s: %s", upstream_code, message)
                status = 429 if upstream_code == 429 else 402 if upstream_code == 402 else 502
                return {"error": message, "code": upstream_code}, status

            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            # Anything without a Responses-shaped payload is not a real answer —
            # returning it as 200 is exactly how the old stub poisoned the client.
            if not isinstance(data.get("output"), list):
                return {"error": "upstream_invalid_response"}, 502
            self.db.record_ai_usage(
                account_id,
                str(data.get("model") or allowed_model),
                int(usage.get("input_tokens") or 0),
                int(usage.get("output_tokens") or 0),
                latency_ms,
            )
            return data, 200

        if method == "POST" and path in ("/api/ai/vision", "/api/ai/audio"):
            auth_token = self._bearer(headers, allow_raw=not self.require_account_auth)
            if not auth_token:
                return {"error": "unauthorized"}, 401
            if self.require_account_auth:
                auth = self.db.authenticate(auth_token)
                if not auth:
                    return {"error": "unauthorized"}, 401
                if auth["plan"] == "free":
                    return {"error": "subscription_required"}, 403
                account_id = auth["account_id"]
            else:
                if auth_token.startswith("free_") or auth_token == "free":
                    return {"error": "subscription_required"}, 403
                account_id = "self-hosted"

            groq_key = os.environ.get("GROQ_API_KEY", "").strip()
            if not groq_key:
                return {"error": "upstream_not_configured"}, 503

            daily_limit = self._ai_daily_limit()
            if daily_limit > 0 and self.db.count_ai_requests_since(account_id, time.time() - 86400) >= daily_limit:
                return {"error": "ai_daily_limit", "limit": daily_limit}, 429

            data_url = str(body.get("dataUrl") or "")
            if not data_url.startswith("data:") or "," not in data_url:
                return {"error": "invalid_data_url"}, 400
            prompt = str(body.get("prompt") or "")[:1200]
            is_vision = path.endswith("/vision")

            started = time.time()
            if is_vision:
                outcome, raw, model_used = await asyncio.to_thread(
                    AiProxy._call_groq_vision, groq_key, data_url, prompt, self._ai_timeout_seconds())
            else:
                outcome, raw, model_used = await asyncio.to_thread(
                    AiProxy._call_groq_audio, groq_key, data_url, prompt,
                    str(body.get("fileName") or "audio.webm"), self._ai_timeout_seconds())
            latency_ms = (time.time() - started) * 1000

            if outcome == "timeout":
                return {"error": "upstream_timeout"}, 504
            if outcome == "too_large":
                return {"error": "payload_too_large"}, 413
            if outcome == "bad_data":
                return {"error": "invalid_data_url"}, 400
            if outcome == "network" or not isinstance(outcome, int):
                return {"error": "upstream_gateway_failed"}, 502
            if not 200 <= outcome < 300:
                detail = ""
                try:
                    err_payload = json.loads(raw.decode("utf-8"))
                    err_obj = err_payload.get("error") if isinstance(err_payload, dict) else None
                    detail = str(err_obj.get("message") if isinstance(err_obj, dict) else err_obj or "")[:200]
                except (UnicodeDecodeError, json.JSONDecodeError):
                    detail = ""
                # Groq rejects bad media with 400/413/422 — surface that as a client error.
                mapped = 429 if outcome == 429 else 400 if outcome in (400, 413, 422) else 502
                logger.warning("Media upstream HTTP %s: %s", outcome, detail)
                return {"error": "upstream_rejected" if mapped == 400 else "upstream_gateway_failed",
                        "upstreamStatus": outcome, "detail": detail}, mapped

            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response"}, 502
            if not isinstance(data, dict):
                return {"error": "upstream_invalid_response"}, 502
            if data.get("error"):
                message = data["error"].get("message") if isinstance(data["error"], dict) else data["error"]
                logger.warning("Media upstream error: %s", str(message)[:200])
                return {"error": "upstream_error", "detail": str(message)[:200]}, 502

            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            if is_vision:
                content = str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
                parsed = None
                try:
                    start, end = content.find("{"), content.rfind("}")
                    if start != -1 and end > start:
                        parsed = json.loads(content[start:end + 1])
                except json.JSONDecodeError:
                    parsed = None
                extracted = str((parsed or {}).get("extractedText") or "").strip()
                summary = str((parsed or {}).get("summary") or content).strip()[:240]
            else:
                extracted = str(data.get("text") or "").strip()
                summary = extracted.split("\n")[0][:240]

            self.db.record_ai_usage(
                account_id, model_used,
                int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0),
                latency_ms)
            return {"extractedText": extracted, "summary": summary, "model": model_used,
                    "latencyMs": round(latency_ms)}, 200

        return _NEXT
