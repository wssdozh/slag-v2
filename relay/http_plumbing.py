"""HTTP-сантехника: чтение запроса, ответы, CORS, IP за прокси, лимит частоты."""

import asyncio
import ipaddress
import json
import time
import urllib.parse
from typing import Dict, Optional, Set, Tuple

from settings import *
from errors import ApiError
from wire import WebSocketConnection


class HttpPlumbing:
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
        except (ValueError, TypeError, AttributeError) as exc:
            logger.debug("Bad request: %s", type(exc).__name__)
            await self._send_response(writer, self._json_response({"error": "bad_request"}, 400))

    def _cors_headers(self) -> str:
        return ("Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Admin-Token\r\n")

    def _http_response(self, status_code: int, status_text: str, content_type: str, body: bytes) -> bytes:
        headers = [f"HTTP/1.1 {status_code} {status_text}", f"Content-Type: {content_type}",
                   f"Content-Length: {len(body)}", "Connection: close",
                   "X-Content-Type-Options: nosniff", "Referrer-Policy: no-referrer",
                   self._cors_headers().strip(), "", ""]
        return "\r\n".join(headers).encode("utf-8") + body

    def _json_response(self, data: dict, status: int = 200) -> bytes:
        labels = {200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 400: "Bad Request",
                  401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found",
                  409: "Conflict", 413: "Payload Too Large", 429: "Too Many Requests",
                  502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"}
        return self._http_response(status, labels.get(status, "Error"), "application/json", json.dumps(data).encode("utf-8"))

    async def _send_response(self, writer: asyncio.StreamWriter, resp_bytes: bytes) -> None:
        try:
            writer.write(resp_bytes)
            await writer.drain()
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    def _client_ip(self, writer: asyncio.StreamWriter, headers: Dict[str, str]) -> str:
        peername = writer.get_extra_info("peername")
        peer = peername[0] if peername else "unknown"
        if not self._is_trusted_proxy(peer):
            return peer
        forwarded = headers.get("x-forwarded-for", "")
        for hop in reversed([part.strip() for part in forwarded.split(",") if part.strip()]):
            try:
                address = ipaddress.ip_address(hop)
            except ValueError:
                continue
            if not self._is_trusted_proxy(str(address)):
                return str(address)
        return peer

    def _allow_request(self, key: str, limit: int, window: float = RATE_LIMIT_WINDOW_SECONDS) -> bool:
        """Sliding-window token budget per key. False means 429, no state is written."""
        now = time.time()
        bucket = [stamp for stamp in self.rate_limits.get(key, []) if now - stamp < window]
        if len(bucket) >= limit:
            self.rate_limits[key] = bucket
            return False
        bucket.append(now)
        self.rate_limits[key] = bucket
        return True

    def _prune_rate_limits(self) -> None:
        now = time.time()
        for key in list(self.rate_limits):
            bucket = [stamp for stamp in self.rate_limits[key] if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
            if bucket:
                self.rate_limits[key] = bucket
            else:
                self.rate_limits.pop(key, None)
        for ip in list(self.failed_claim_attempts):
            attempts = [stamp for stamp in self.failed_claim_attempts[ip] if now - stamp < 300]
            if attempts:
                self.failed_claim_attempts[ip] = attempts
            else:
                self.failed_claim_attempts.pop(ip, None)

    @staticmethod
    def _bearer(headers: dict, allow_raw: bool = False) -> str:
        value = headers.get("authorization", "").strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value if allow_raw else ""
