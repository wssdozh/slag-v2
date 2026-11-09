#!/usr/bin/env python3
"""Live acceptance probe for the SLAG relay AI gateway.

Creates a disposable account, checks plan gating, the Responses-protocol proxy,
model allowlisting, concurrency and usage logging, then blocks the account.

    SLAG_ADMIN_TOKEN=<token> python ai_smoke.py --server http://152.53.199.71:8320

Never prints tokens, keys or note text.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

TRIAGE_PROMPT = (
    "Ты — интеллектуальный диспетчер сортировки заметок (AI Triage) и таксономист базы знаний SLAG.\n"
    "Верни ТОЛЬКО JSON-массив объектов вида "
    '{"itemId":"...","suggestedTitle":"...","targetFolder":"...","tags":["..."],"reason":"..."}.\n\n'
    "СПИСОК ДОСТУПНЫХ ПАПОК:\n"
    '[{"path":"Разработка/React","name":"React","description":"Хуки, компоненты, состояние"},\n'
    ' {"path":"Отдых","name":"Отдых","description":"Фильмы, сериалы, музыка"},\n'
    ' {"path":"Проекты/SLAG v2","name":"SLAG v2","description":"Разработка приложения заметок"}]\n\n'
    "СЛОВАРЬ СУЩЕСТВУЮЩИХ ТЕГОВ:\n[react, hooks, frontend, фильм, дизайн]\n\n"
    "НЕРАЗОБРАННЫЕ ЗАМЕТКИ (ПАКЕТ):\n"
    '[{"id":"note_1","title":"useEffect и fetch","content":"useEffect гоняет fetch на каждый рендер, '
    'нужно добавлять зависимости и отмену запроса","tags":[],"type":"note"}]'
)

CHAT_PAYLOAD = {
    "model": "deepseek-v4-1-flash",
    "stream": False,
    "reasoning": {"effort": "none"},
    "instructions": TRIAGE_PROMPT,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "Разбери пакет заметок и верни JSON-массив."}],
        }
    ],
}


class Probe:
    def __init__(self, server: str, admin_token: str):
        self.server = server.rstrip("/")
        self.admin_token = admin_token
        self.results: list[tuple[str, bool, str]] = []

    # ---------- plumbing ----------

    def call(self, method: str, path: str, body=None, token: str | None = None,
             admin: bool = False, timeout: float = 75.0) -> tuple[int, dict]:
        request = urllib.request.Request(self.server + path, method=method)
        headers = {}
        if body is not None:
            headers["Content-Type"] = "application/json"
            request.data = json.dumps(body).encode("utf-8")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if admin:
            headers["X-Admin-Token"] = self.admin_token
        for key, value in headers.items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, json.loads(response.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            try:
                return error.code, json.loads(raw or "{}")
            except json.JSONDecodeError:
                return error.code, {"raw": raw[:200]}

    def record(self, name: str, ok: bool, detail: str) -> None:
        self.results.append((name, ok, detail))
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {detail}")

    # ---------- identity ----------

    @staticmethod
    def identity() -> dict:
        private = ec.generate_private_key(ec.SECP256R1())
        public = private.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.CompressedPoint)
        return {"private": private, "publicKey": public.hex(),
                "accountId": "acc_" + hashlib.sha256(public).hexdigest()[:24]}

    @staticmethod
    def device(device_id: str) -> dict:
        private = ec.generate_private_key(ec.SECP256R1())
        numbers = private.public_key().public_numbers()
        jwk = {"kty": "EC", "crv": "P-256",
               "x": base64.urlsafe_b64encode(numbers.x.to_bytes(32, "big")).rstrip(b"=").decode(),
               "y": base64.urlsafe_b64encode(numbers.y.to_bytes(32, "big")).rstrip(b"=").decode()}
        return {"id": device_id, "name": device_id, "platform": "smoke", "publicKey": json.dumps(jwk),
                "_private": private}

    @staticmethod
    def sign(private, challenge: str) -> str:
        der = private.sign(challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        return r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex()

    def register(self) -> tuple[dict, str]:
        identity = self.identity()
        device = self.device(f"smoke-{os.urandom(4).hex()}")
        device_public = {k: device[k] for k in ("id", "name", "platform", "publicKey")}
        status, challenge = self.call("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        if status != 200:
            raise SystemExit(f"challenge failed: {status} {challenge}")
        body = {"accountId": identity["accountId"], "publicKey": identity["publicKey"],
                "challenge": challenge["challenge"],
                "signature": self.sign(identity["private"], challenge["challenge"]),
                "device": device_public,
                "deviceSignature": self.sign(device["_private"], challenge["challenge"])}
        status, result = self.call("POST", "/api/auth/register", body)
        if status != 201:
            raise SystemExit(f"register failed: {status} {result}")
        return identity, result["token"]

    def set_plan(self, account_id: str, plan: str) -> None:
        path = f"/api/admin/accounts/{urllib.parse.quote(account_id)}"
        status, body = self.call("PATCH", path, {"plan": plan}, admin=True)
        if status != 200:
            raise SystemExit(f"change plan failed: {status} {body}")

    # ---------- checks ----------

    def run(self) -> int:
        status, health = self.call("GET", "/health")
        self.record("health", status == 200 and health.get("status") == "ok",
                    f"http {status}, authRequired={health.get('authRequired')}")

        identity, token = self.register()
        account_id = identity["accountId"]
        self.record("register", True, f"account {account_id[:12]}…")

        status, _ = self.call("POST", "/api/ai/chat", CHAT_PAYLOAD, token)
        self.record("free plan is gated", status == 403, f"http {status}")

        status, _ = self.call("POST", "/api/ai/chat", CHAT_PAYLOAD)
        self.record("anonymous is rejected", status == 401, f"http {status}")

        self.set_plan(account_id, "smile")

        started = time.time()
        status, answer = self.call("POST", "/api/ai/chat", CHAT_PAYLOAD, token)
        elapsed_ms = round((time.time() - started) * 1000)
        text = ""
        if status == 200 and isinstance(answer.get("output"), list):
            text = "".join(
                content.get("text", "")
                for item in answer["output"] if item.get("type") == "message"
                for content in item.get("content", [])
                if content.get("type") == "output_text")
        parsed = None
        try:
            start, end = text.find("["), text.rfind("]")
            if start != -1 and end > start:
                parsed = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            parsed = None
        self.record("paid plan gets a real answer", status == 200 and bool(text),
                    f"http {status}, {elapsed_ms} ms, {len(text)} chars")
        self.record("answer is parseable triage JSON", isinstance(parsed, list) and bool(parsed),
                    f"items={len(parsed) if isinstance(parsed, list) else 0}")

        status, answer = self.call("POST", "/api/ai/chat",
                                   {**CHAT_PAYLOAD, "model": "gpt-6-luna"}, token)
        self.record("expensive model is blocked", status == 400, f"http {status}, {answer.get('error')}")

        status, answer = self.call("POST", "/api/ai/chat", {"input": []}, token)
        self.record("missing model is rejected", status == 400, f"http {status}, {answer.get('error')}")

        status, answer = self.call("POST", "/api/ai/chat", {**CHAT_PAYLOAD, "model": "deepseek-v4.1-flash"}, token)
        self.record("dotted model alias is accepted", status == 200, f"http {status}")

        png = ("data:image/png;base64,"
               "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEsSURBVHhe7ZDBCQMxDARTTkpMiekqwY+DMB9LtnQW0S7MZ8HWMo/n6/3pzINFNySARTckgEU3JIBFNySARTckgEU3JIBFJp7wbRbpAiLCPyNJE5AR3oggRUBmeGuXUAF3hrdXCRNwItywQoiAk+EWLxLAwkuFcJOHLQGVwm1WJICFlYrhRgsSwMJKxXCjhSUBlcOtMySAhYXK4dYZEsDCQuVw6wy3gOrh3hluAYPK4dYZEsDCQuVw6wwJYGGhcrh1xpKAQdVw54y/EsCNFiSAhYdK4TYrEsDCS4Vwk4dtAYOT4RYvEsBilRPhhhXCBAzuDG+vEirgIjO8tUuKgEFGeCOCNAEXEeGfkaQL+MUbvs/gVgEVkQAW3ZAAFt2QABbdkAAW3ZAAFt1oL+ALYH4ca/2ry7YAAAAASUVORK5CYII=")
        status, vision = self.call("POST", "/api/ai/vision",
                                   {"dataUrl": png, "prompt": "Опиши картинку. JSON: {extractedText, summary}"}, token)
        self.record("vision goes through the relay", status == 200 and "extractedText" in vision,
                    f"http {status}, model={vision.get('model')}")

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            wav.writeframes(b"\x00\x00" * 8000)
        wav_url = "data:audio/wav;base64," + base64.b64encode(wav_buffer.getvalue()).decode()
        status, audio = self.call("POST", "/api/ai/audio",
                                  {"dataUrl": wav_url, "fileName": "silence.wav", "prompt": "тишина"}, token)
        self.record("audio transcription goes through the relay",
                    status == 200 and "extractedText" in audio,
                    f"http {status}, model={audio.get('model')}, chars={len(audio.get('extractedText') or '')}")

        timings: list[int] = []

        def one() -> None:
            started = time.time()
            self.call("POST", "/api/ai/chat", CHAT_PAYLOAD, token)
            timings.append(round((time.time() - started) * 1000))

        threads = [threading.Thread(target=one) for _ in range(5)]
        wall_start = time.time()
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        wall_ms = round((time.time() - wall_start) * 1000)
        self.record("5 concurrent calls do not block the loop",
                    len(timings) == 5 and wall_ms < sum(timings),
                    f"wall {wall_ms} ms, slowest {max(timings)} ms, sum {sum(timings)} ms")

        status, stats = self.call("GET", "/api/admin/ai/stats", admin=True)
        self.record("gateway reports operational", status == 200 and stats.get("gatewayStatus") == "operational",
                    f"http {status}, status={stats.get('gatewayStatus')}")

        status, ping = self.call("POST", "/api/admin/ai/ping", {}, admin=True)
        self.record("admin ping hits upstream", status == 200 and ping.get("status") == "ok",
                    f"http {status}, {ping.get('latencyMs')} ms")

        status, logs = self.call("GET", "/api/admin/ai/logs", admin=True)
        mine = [row for row in logs.get("logs", []) if row.get("accountId") == account_id]
        total_tokens = sum(row["promptTokens"] + row["completionTokens"] for row in mine)
        self.record("usage is logged with real tokens", len(mine) >= 6 and total_tokens > 0,
                    f"rows={len(mine)}, tokens={total_tokens}")

        status, _ = self.call("POST", f"/api/admin/accounts/{urllib.parse.quote(account_id)}/toggle-status",
                              {}, admin=True)
        self.record("test account blocked", status == 200, f"http {status}")

        failed = [name for name, ok, _ in self.results if not ok]
        print()
        if failed:
            print(f"FAILED ({len(failed)}/{len(self.results)}): " + ", ".join(failed))
            return 1
        print(f"all {len(self.results)} checks passed")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default=os.environ.get("SLAG_SERVER_URL", "http://152.53.199.71:8320"))
    args = parser.parse_args()
    admin_token = os.environ.get("SLAG_ADMIN_TOKEN", "").strip()
    if not admin_token:
        print("SLAG_ADMIN_TOKEN is not set", file=sys.stderr)
        return 2
    return Probe(args.server, admin_token).run()


if __name__ == "__main__":
    raise SystemExit(main())
