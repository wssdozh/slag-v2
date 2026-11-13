#!/usr/bin/env python3
"""Security fuzz/regression tests for the stdlib SLAG relay.

Payloads are the curated SecLists essentials (Fuzzing/SQLi, special-chars,
command-injection-commix, Passwords/Usernames top lists). They are inlined so the
suite stays self-contained; every target is a local 127.0.0.1 instance with a
temporary sqlite file, never a deployed relay.
"""

import asyncio
import base64
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from test_relay import RelayTestCase
from server import SlagRelayServer


# SecLists/Fuzzing/Databases/SQLi/quick-SQLi.txt + Generic-SQLi.txt
SQLI_PAYLOADS = [
    "' or '1'='1",
    "' or true--",
    '" or true--',
    "') or true--",
    "'; DROP TABLE accounts; --",
    "1' UNION SELECT account_id, public_key FROM accounts --",
    "admin'--",
    "' OR 1=1#",
]

# SecLists/Fuzzing/special-chars.txt
SPECIAL_CHARS = list("~!@#$%^&*()-_+={}][|\\`,./<>?;:\"'")

# SecLists/Fuzzing/command-injection-commix.txt
COMMAND_PAYLOADS = [
    ";echo AGIYMZ$(echo AGIYMZ)",
    "&& echo PVJXOS$(echo PVJXOS)",
    "| echo TJEGSE$(echo TJEGSE)",
    "`hostname`",
    "$(hostname)",
]

# SecLists/Passwords/Common-Credentials/top-passwords-shortlist.txt
WEAK_PASSWORDS = ["password", "123456", "12345678", "qwerty", "admin", "letmein", "welcome"]


class TestSecurityAnonymous(RelayTestCase):
    admin_token = "unit-test-admin-token"

    async def raw_request(self, method: str, path: str, body: bytes = b"", headers: dict | None = None):
        reader, writer = await asyncio.open_connection(self.host, self.port)
        lines = [f"{method} {path} HTTP/1.1", f"Host: {self.host}:{self.port}", "Connection: close"]
        for key, value in (headers or {}).items():
            lines.append(f"{key}: {value}")
        if body:
            lines.append(f"Content-Length: {len(body)}")
        writer.write(("\r\n".join(lines) + "\r\n\r\n").encode("utf-8") + body)
        await writer.drain()
        raw = await reader.read()
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        head, _, payload = raw.partition(b"\r\n\r\n")
        text = head.decode("latin-1")
        status = int(text.split(" ")[1]) if " " in text else 0
        return status, text.lower(), payload

    async def test_sql_and_command_payloads_stay_data(self):
        for payload in SQLI_PAYLOADS + COMMAND_PAYLOADS:
            status, data = await self.http("POST", "/api/telemetry/event", {
                "eventType": payload, "platform": "test", "metadata": {"payload": payload},
            })
            self.assertEqual(status, 200, (payload, data))

        # The table still exists, the count is sane, and the server still answers.
        count = self.server.db.conn.execute("SELECT COUNT(*) AS c FROM telemetry_events").fetchone()["c"]
        self.assertGreaterEqual(count, len(SQLI_PAYLOADS) + len(COMMAND_PAYLOADS))
        self.assertEqual((await self.http("GET", "/health"))[0], 200)

    async def test_auth_challenge_rejects_injection_and_bad_types(self):
        for payload in SQLI_PAYLOADS + SPECIAL_CHARS:
            status, data = await self.http("POST", "/api/auth/challenge", {"accountId": payload})
            self.assertEqual(status, 400, (payload, data))
            self.assertEqual(data.get("error"), "invalid_account_id")

        for value in ([], {}, 1, None, True):
            status, _ = await self.http("POST", "/api/auth/challenge", {"accountId": value})
            self.assertEqual(status, 400)

        # A syntactically valid account that does not exist still gets a challenge:
        # the endpoint must not become an account-enumeration oracle.
        status, data = await self.http("POST", "/api/auth/challenge", {"accountId": "acc_" + "0" * 24})
        self.assertEqual(status, 200)
        self.assertIn("challenge", data)

    async def test_admin_token_is_compared_exactly_and_rejects_common_passwords(self):
        for token in WEAK_PASSWORDS + SQLI_PAYLOADS:
            status, _ = await self.http("GET", "/api/admin/stats", token=token)
            self.assertEqual(status, 401, token)
            status, _, _ = await self.raw_request(
                "GET", "/api/admin/stats", headers={"X-Admin-Token": token})
            self.assertEqual(status, 401, token)

        status, data = await self.http("GET", "/api/admin/stats", token=self.admin_token)
        self.assertEqual(status, 200, data)

    async def test_admin_paths_do_not_traverse(self):
        status, _, body = await self.raw_request(
            "GET", "/api/admin/accounts/..%2f..%2fetc%2fpasswd",
            headers={"X-Admin-Token": self.admin_token})
        self.assertIn(status, (400, 404))
        self.assertNotIn(b"root:", body)

    async def test_pair_claim_rate_limit_is_enforced(self):
        statuses = []
        for _ in range(6):
            status, _ = await self.http("POST", "/api/pair/claim", {"pin": "000-000"})
            statuses.append(status)
        self.assertEqual(statuses[:5], [404] * 5, statuses)
        self.assertEqual(statuses[5], 429, statuses)

    async def test_pair_create_rate_limit_is_enforced(self):
        with patch("server.RATE_LIMIT_PAIR_CREATE", 3):
            statuses = [(await self.http("POST", "/api/pair/create", {}))[0] for _ in range(4)]
        self.assertEqual(statuses[:3], [200] * 3, statuses)
        self.assertEqual(statuses[3], 429, statuses)

    async def test_auth_challenge_rate_limit_is_enforced(self):
        with patch("server.RATE_LIMIT_AUTH_CHALLENGE", 3):
            statuses = [
                (await self.http("POST", "/api/auth/challenge", {"accountId": "acc_" + "0" * 24}))[0]
                for _ in range(4)
            ]
        self.assertEqual(statuses[:3], [200] * 3, statuses)
        self.assertEqual(statuses[3], 429, statuses)

    async def test_telemetry_rate_limit_is_enforced(self):
        with patch("server.RATE_LIMIT_TELEMETRY", 3):
            statuses = [
                (await self.http("POST", "/api/telemetry/event", {"eventType": "test"}))[0]
                for _ in range(4)
            ]
        self.assertEqual(statuses[:3], [200] * 3, statuses)
        self.assertEqual(statuses[3], 429, statuses)

    async def test_untrusted_peer_cannot_spoof_x_forwarded_for(self):
        with patch("server.RATE_LIMIT_AUTH_CHALLENGE", 2):
            statuses = [
                (await self.raw_request(
                    "POST", "/api/auth/challenge",
                    json.dumps({"accountId": "acc_" + "0" * 24}).encode(),
                    headers={"X-Forwarded-For": f"198.51.100.{index}"},
                ))[0]
                for index in range(3)
            ]
        self.assertEqual(statuses, [200, 200, 429], statuses)

    async def test_trusted_proxy_uses_the_rightmost_forwarded_client(self):
        self.server.trusted_proxies = self.server._parse_trusted_proxies("127.0.0.1/32")
        with patch("server.RATE_LIMIT_AUTH_CHALLENGE", 2):
            body = json.dumps({"accountId": "acc_" + "0" * 24}).encode()
            # The trusted proxy appends the real client on the right. The client-supplied
            # left value must not become the rate-limit key.
            for _ in range(2):
                status, _, _ = await self.raw_request(
                    "POST", "/api/auth/challenge", body,
                    headers={"X-Forwarded-For": "198.51.100.9, 203.0.113.7"},
                )
                self.assertEqual(status, 200)
            status, _, _ = await self.raw_request(
                "POST", "/api/auth/challenge", body,
                headers={"X-Forwarded-For": "198.51.100.9, 203.0.113.7"},
            )
            self.assertEqual(status, 429)
            # A different rightmost client gets its own bucket.
            status, _, _ = await self.raw_request(
                "POST", "/api/auth/challenge", body,
                headers={"X-Forwarded-For": "198.51.100.9, 203.0.113.8"},
            )
            self.assertEqual(status, 200)

    async def test_garbage_forwarded_header_falls_back_to_the_peer(self):
        self.server.trusted_proxies = self.server._parse_trusted_proxies("127.0.0.1/32")
        with patch("server.RATE_LIMIT_TELEMETRY", 2):
            statuses = [
                (await self.raw_request(
                    "POST", "/api/telemetry/event", b'{"eventType":"test"}',
                    headers={"X-Forwarded-For": "not-an-ip"},
                ))[0]
                for _ in range(3)
            ]
        self.assertEqual(statuses, [200, 200, 429], statuses)

    async def test_pair_claim_failures_follow_the_forwarded_client(self):
        self.server.trusted_proxies = self.server._parse_trusted_proxies("127.0.0.1/32")
        body = b'{"pin":"000-000"}'
        statuses = [
            (await self.raw_request(
                "POST", "/api/pair/claim", body,
                headers={"X-Forwarded-For": "203.0.113.5"},
            ))[0]
            for _ in range(6)
        ]
        self.assertEqual(statuses[:5], [404] * 5, statuses)
        self.assertEqual(statuses[5], 429, statuses)
        # Another guest behind the same proxy is not locked out by the first one.
        status, _, _ = await self.raw_request(
            "POST", "/api/pair/claim", body,
            headers={"X-Forwarded-For": "203.0.113.6"},
        )
        self.assertEqual(status, 404)

    async def test_invalid_trusted_proxy_config_fails_shut(self):
        with patch.dict(os.environ, {"SLAG_TRUSTED_PROXIES": "not-a-cidr"}):
            with self.assertRaises(ValueError):
                SlagRelayServer("127.0.0.1", 0, ":memory:")

    async def test_static_files_do_not_escape_the_root(self):
        with tempfile.TemporaryDirectory(prefix="slag_static_") as temp:
            root = Path(temp) / "dist"
            sibling = Path(temp) / "dist_evil"
            root.mkdir()
            sibling.mkdir()
            (root / "index.html").write_text("public", encoding="utf-8")
            (sibling / "secret.txt").write_text("TOPSECRET", encoding="utf-8")
            with patch.dict(os.environ, {"SLAG_STATIC_DIR": str(root)}):
                status, _, body = await self.raw_request("GET", "/index.html")
                self.assertEqual(status, 200)
                self.assertEqual(body, b"public")

                status, _, body = await self.raw_request("GET", "/../dist_evil/secret.txt")
                self.assertIn(status, (400, 403, 404))
                self.assertNotIn(b"TOPSECRET", body)

    async def test_malformed_json_and_field_types_get_a_clean_4xx(self):
        cases = [
            ("/api/auth/challenge", b"{", 400),
            ("/api/auth/challenge", b"[]", 400),
            ("/api/auth/challenge", b'"text"', 400),
            ("/api/auth/challenge", b'{"accountId": ["x"]}', 400),
            ("/api/pair/claim", b'{"pin": ["000-000"]}', 400),
            ("/api/pair/approve", b'{"sessionId": []}', 400),
            ("/api/pair/create", b'{"deviceId": {"x": 1}}', 400),
        ]
        for path, body, expected in cases:
            status, _, payload = await self.raw_request("POST", path, body)
            self.assertEqual(status, expected, (path, body, payload))
            self.assertNotIn(b"Traceback", payload)

    async def test_cors_and_response_headers(self):
        status, headers, _ = await self.raw_request("OPTIONS", "/api/ai/chat")
        self.assertEqual(status, 204)
        self.assertIn("access-control-allow-origin: *", headers)
        self.assertIn("x-content-type-options: nosniff", headers)

        status, headers, _ = await self.raw_request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertIn("referrer-policy: no-referrer", headers)


class TestSecurityAccounts(RelayTestCase):
    """Account-mode checks for the paths a password/username list can reach."""

    auth_required = True

    @staticmethod
    def identity():
        private = ec.generate_private_key(ec.SECP256R1())
        public = private.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.CompressedPoint)
        return {"private": private, "publicKey": public.hex(),
                "accountId": "acc_" + hashlib.sha256(public).hexdigest()[:24]}

    def device(self, device_id: str, name: str | None = None):
        if not hasattr(self, "device_keys"):
            self.device_keys = {}
        private = self.device_keys.setdefault(device_id, ec.generate_private_key(ec.SECP256R1()))
        numbers = private.public_key().public_numbers()
        jwk = {"kty": "EC", "crv": "P-256",
               "x": base64.urlsafe_b64encode(numbers.x.to_bytes(32, "big")).rstrip(b"=").decode(),
               "y": base64.urlsafe_b64encode(numbers.y.to_bytes(32, "big")).rstrip(b"=").decode()}
        return {"id": device_id, "name": name or device_id, "platform": "test",
                "publicKey": json.dumps(jwk)}

    @staticmethod
    def signature(identity, challenge: str):
        der = identity["private"].sign(challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        return r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex()

    async def auth_call(self, route: str, identity, device):
        status, challenge = await self.http(
            "POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        self.assertEqual(status, 200, challenge)
        body = {"accountId": identity["accountId"], "publicKey": identity["publicKey"],
                "challenge": challenge["challenge"],
                "signature": self.signature(identity, challenge["challenge"]), "device": device}
        body["deviceSignature"] = self.signature(
            {"private": self.device_keys[device["id"]]}, challenge["challenge"])
        return await self.http("POST", route, body)

    async def test_sql_payloads_in_device_and_vault_names_are_stored_verbatim(self):
        identity = self.identity()
        name = "'; DROP TABLE accounts; --"
        device = self.device("device-sqli", name)
        status, result = await self.auth_call("/api/auth/register", identity, device)
        self.assertEqual(status, 201, result)
        token = result["token"]

        status, account = await self.http("GET", "/api/account", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(account["devices"][0]["name"], name)
        self.assertEqual(
            self.server.db.conn.execute("SELECT COUNT(*) AS c FROM accounts").fetchone()["c"], 1)

        vault_name = "' OR 1=1; --"
        status, vault = await self.http(
            "PUT", "/api/vaults/vault-sqli", {"name": vault_name}, token)
        self.assertEqual(status, 200, vault)
        self.assertEqual(vault["name"], vault_name)

    async def test_sql_token_and_traversal_device_id_do_not_authenticate(self):
        for token in SQLI_PAYLOADS:
            self.assertEqual((await self.http("GET", "/api/account", token=token))[0], 401)
        identity = self.identity()
        device = self.device("device-1")
        status, _ = await self.auth_call("/api/auth/register", identity, device)
        self.assertEqual(status, 201)

        status, _ = await self.http(
            "POST", "/api/devices/..%2f..%2fetc/approve", {}, "not-a-token")
        self.assertEqual(status, 401)

    async def test_top_usernames_do_not_login(self):
        for name in ["admin", "root", "administrator", "user", "test", "guest"]:
            # The account id must still be key-derived, so a plain username is a format error.
            status, _ = await self.http("POST", "/api/auth/challenge", {"accountId": name})
            self.assertEqual(status, 400, name)


if __name__ == "__main__":
    unittest.main()
