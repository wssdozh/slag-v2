"""Внешние модели: kie.ai для текста, groq для vision и whisper.

Релей сам ничего не генерирует и не хранит ответ: он проксирует запрос устройства
и пишет в базу только счётчик токенов и латентность.
"""

from __future__ import annotations

import base64
import json
import secrets
import os
import urllib.error
import urllib.request
from typing import Tuple

from settings import *


class AiProxy:
    @staticmethod
    def _normalize_ai_model(model: str) -> str:
        return str(model or "").strip().lower().replace(".", "-")

    @staticmethod
    def _ai_model() -> str:
        return os.environ.get("SLAG_AI_MODEL", "").strip() or "deepseek-v4-1-flash"

    @staticmethod
    def _kie_base_url() -> str:
        return (os.environ.get("KIE_BASE_URL", "").strip() or "https://api.kie.ai").rstrip("/")

    @staticmethod
    def _ai_timeout_seconds() -> float:
        try:
            return max(5.0, min(180.0, float(os.environ.get("SLAG_AI_TIMEOUT_SECONDS", "60"))))
        except ValueError:
            return 60.0

    @staticmethod
    def _ai_daily_limit() -> int:
        try:
            return max(0, int(os.environ.get("SLAG_AI_DAILY_LIMIT", "500")))
        except ValueError:
            return 500

    @staticmethod
    def _call_ai_upstream(url: str, api_key: str, payload: dict, timeout: float) -> Tuple[object, bytes]:
        """Blocking upstream call, always run through `asyncio.to_thread`.

        Returns ("timeout" | "network" | int_http_status, raw_body). Never raises.
        """
        return AiProxy._post_raw(url, api_key, json.dumps(payload).encode("utf-8"),
                                         "application/json", timeout)

    @staticmethod
    def _post_raw(url: str, api_key: str, body: bytes, content_type: str,
                  timeout: float) -> Tuple[object, bytes]:
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": content_type,
                     "Authorization": api_key if api_key.startswith("Bearer ") else f"Bearer {api_key}",
                     "User-Agent": "SLAG-Relay-Gateway/0.2.0"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()
        except urllib.error.URLError as exc:
            reason = exc.reason
            return ("timeout" if isinstance(reason, TimeoutError) else "network"), b""
        except TimeoutError:
            return "timeout", b""
        except Exception:
            return "network", b""

    @staticmethod
    def _groq_base_url() -> str:
        return (os.environ.get("GROQ_BASE_URL", "").strip() or "https://api.groq.com/openai/v1").rstrip("/")

    @staticmethod
    def _groq_vision_model() -> str:
        return os.environ.get("SLAG_VISION_MODEL", "").strip() or "qwen/qwen3.8-27b"

    @staticmethod
    def _groq_whisper_model() -> str:
        return os.environ.get("SLAG_WHISPER_MODEL", "").strip() or "whisper-large-v3-turbo"

    @staticmethod
    def _call_groq_vision(api_key: str, data_url: str, prompt: str, timeout: float) -> Tuple[object, bytes, str]:
        model = AiProxy._groq_vision_model()
        instruction = prompt.strip() or (
            'Извлеки весь читаемый текст с изображения (OCR) и дай краткое описание сути. '
            'Ответ строго JSON: {"extractedText": "...", "summary": "..."}')
        payload = {
            "model": model,
            "temperature": 0.1,
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
        }
        outcome, raw = AiProxy._post_raw(
            f"{AiProxy._groq_base_url()}/chat/completions",
            api_key, json.dumps(payload).encode("utf-8"), "application/json", timeout)
        return outcome, raw, model

    @staticmethod
    def _call_groq_audio(api_key: str, data_url: str, prompt: str, file_name: str,
                         timeout: float) -> Tuple[object, bytes, str]:
        model = AiProxy._groq_whisper_model()
        try:
            header, encoded = data_url.split(",", 1)
            mime = header[5:].split(";")[0] or "audio/webm"
            audio = base64.b64decode(encoded)
        except (ValueError, TypeError):
            return "bad_data", b"", model
        if len(audio) > 12 * 1024 * 1024:
            return "too_large", b"", model

        boundary = "----slag" + secrets.token_hex(8)
        safe_name = (file_name or "audio.webm").replace('"', "").replace("\r", "").replace("\n", "")[:120]
        chunks: list[bytes] = []

        def field(name: str, value: str) -> None:
            chunks.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8"))

        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n".encode("utf-8") + audio + b"\r\n")
        field("model", model)
        field("response_format", "json")
        field("temperature", "0")
        if prompt.strip():
            field("prompt", prompt.strip()[:900])
        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

        outcome, raw = AiProxy._post_raw(
            f"{AiProxy._groq_base_url()}/audio/transcriptions",
            api_key, b"".join(chunks), f"multipart/form-data; boundary={boundary}", timeout)
        return outcome, raw, model
