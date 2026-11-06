#!/usr/bin/env python3
"""Integration and migration tests for the stdlib + cryptography SLAG relay."""

import asyncio
import base64
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import struct
import tempfile
import unittest
import urllib.error
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from server import RelayDatabase, SlagRelayServer
from unittest.mock import patch


def make_client_ws_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    length = len(payload)
    mask = os.urandom(4)
    masked = bytearray(value ^ mask[i % 4] for i, value in enumerate(payload))
    first = 0x80 | opcode
    if length <= 125:
        header = bytearray([first, 0x80 | length]) + mask
    elif length <= 65535:
        header = bytearray([first, 0x80 | 126]) + struct.pack("!H", length) + mask
    else:
        header = bytearray([first, 0x80 | 127]) + struct.pack("!Q", length) + mask
    return header + masked


async def read_server_ws_frame(reader: asyncio.StreamReader) -> dict:
    header = await reader.readexactly(2)
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]
    return json.loads((await reader.readexactly(length)).decode("utf-8"))


class RelayTestCase(unittest.IsolatedAsyncioTestCase):
    auth_required = False

    async def asyncSetUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="slag_test_")
        self.db_path = os.path.join(self.tmpdir, "test_relay.db")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.host = "127.0.0.1"
        self.base = f"http://{self.host}:{self.port}"
        self.server = SlagRelayServer(self.host, self.port, self.db_path, require_account_auth=self.auth_required)
        self.server_task = asyncio.create_task(self.server.run())
        await asyncio.sleep(0.05)

    async def asyncTearDown(self):
        self.server_task.cancel()
        try:
            await self.server_task
        except (asyncio.CancelledError, Exception):
            pass
        self.server.db.conn.close()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _sync_http(self, method: str, path: str, data: dict = None, token: str = None):
        request = urllib.request.Request(self.base + path, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
            request.data = json.dumps(data).encode("utf-8")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    async def http(self, method: str, path: str, data: dict = None, token: str = None):
        return await asyncio.to_thread(self._sync_http, method, path, data, token)

    async def open_ws(self, room: str, device: str, token: str = None, vault: str = None):
        query = {"device": device}
        if token is not None:
            query["token"] = token
        if vault is not None:
            query["vault"] = vault
        reader, writer = await asyncio.open_connection(self.host, self.port)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        writer.write((f"GET /ws/{room}?{urllib.parse.urlencode(query)} HTTP/1.1\r\n"
                      f"Host: {self.host}:{self.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Key: {key}\r\n\r\n").encode("ascii"))
        await writer.drain()
        status_line = await reader.readline()
        while True:
            line = await reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break
        if b"101 Switching Protocols" not in status_line:
            writer.close()
            await writer.wait_closed()
            return reader, None, status_line.decode("ascii", errors="replace")
        return reader, writer, status_line.decode("ascii", errors="replace")


class TestLegacyRelay(RelayTestCase):
    async def test_auth_environment_validation(self):
        for value in ("1", " true ", "yes", "on", "0", "false", "no", "off"):
            with patch.dict(os.environ, {"SLAG_REQUIRE_ACCOUNT_AUTH": value}):
                server = SlagRelayServer("127.0.0.1", 0, ":memory:")
                self.assertEqual(server.require_account_auth, value.strip() in ("1", "true", "yes", "on"))
                server.db.conn.close()
        with patch.dict(os.environ, {"SLAG_REQUIRE_ACCOUNT_AUTH": "tru"}):
            with self.assertRaisesRegex(ValueError, "SLAG_REQUIRE_ACCOUNT_AUTH"):
                SlagRelayServer("127.0.0.1", 0, ":memory:")

    async def test_health_anonymous_pairing_and_ai(self):
        status, health = await self.http("GET", "/health")
        self.assertEqual(status, 200)
        self.assertFalse(health["authRequired"])

        status, created = await self.http("POST", "/api/pair/create", {"deviceId": "host", "publicKey": "host-pk"})
        self.assertEqual(status, 200)
        status, claimed = await self.http("POST", "/api/pair/claim", {"pin": created["pin"], "publicKey": "guest-pk"})
        self.assertEqual(status, 200)
        self.assertEqual(claimed["status"], "pending_approval")
        status, _ = await self.http("POST", "/api/pair/approve", {"sessionId": created["sessionId"], "encryptedPayload": "legacy-ciphertext"})
        self.assertEqual(status, 200)
        status, polled = await self.http("GET", f"/api/pair/poll?session={created['sessionId']}")
        self.assertEqual(status, 200)
        self.assertEqual(polled["exchangePayload"], "legacy-ciphertext")

        self.assertEqual((await self.http("POST", "/api/ai/chat", {}))[0], 401)
        self.assertEqual((await self.http("POST", "/api/ai/chat", {}, "free_user"))[0], 403)
        status, answer = await self.http("POST", "/api/ai/chat", {"messages": []}, "legacy-room-token")
        self.assertEqual(status, 200)
        self.assertIn("choices", answer)

    async def test_anonymous_http_room(self):
        bundle = {"bundleId": "legacy-http-1", "fromDeviceId": "dev-1", "sequence": 1, "changes": []}
        status, _ = await self.http("POST", "/api/rooms/legacy-room/bundle", {"bundle": bundle})
        self.assertEqual(status, 200)
        status, result = await self.http("GET", "/api/rooms/legacy-room/bundles?device=dev-2")
        self.assertEqual(status, 200)
        self.assertEqual(result["bundles"][0]["bundleId"], "legacy-http-1")
        status, result = await self.http("POST", "/api/rooms/legacy-room/ack", {"deviceId": "dev-2", "bundleIds": ["legacy-http-1"]})
        self.assertEqual(status, 200)
        self.assertEqual(result["acked"], 1)

    async def test_anonymous_websocket_broadcast(self):
        r1, w1, _ = await self.open_ws("legacy-ws", "dev-1")
        self.assertEqual((await read_server_ws_frame(r1))["type"], "welcome")
        r2, w2, _ = await self.open_ws("legacy-ws", "dev-2")
        self.assertEqual((await read_server_ws_frame(r2))["type"], "welcome")
        message = {"type": "bundle", "bundle": {"bundleId": "legacy-ws-1", "fromDeviceId": "dev-1", "sequence": 1}}
        w1.write(make_client_ws_frame(json.dumps(message).encode("utf-8")))
        await w1.drain()
        self.assertEqual((await read_server_ws_frame(r1))["type"], "server_ack")
        self.assertEqual((await read_server_ws_frame(r2))["bundle"]["bundleId"], "legacy-ws-1")
        w1.close()
        w2.close()
        await w1.wait_closed()
        await w2.wait_closed()

    async def test_binary_bundle_frame_push(self):
        r1, w1, _ = await self.open_ws("binary-room", "dev-1")
        welcome = await read_server_ws_frame(r1)
        self.assertEqual(welcome["type"], "welcome")
        self.assertTrue(welcome["binary"])
        r2, w2, _ = await self.open_ws("binary-room", "dev-2")
        await read_server_ws_frame(r2)

        bundle_id = b"bnd_binary_1"
        iv = os.urandom(12)
        ciphertext = os.urandom(64)
        frame = bytes([0x01, 0x01, len(bundle_id)]) + bundle_id + struct.pack("!I", 7) + iv + ciphertext
        w1.write(make_client_ws_frame(frame, opcode=0x2))
        await w1.drain()

        ack = await read_server_ws_frame(r1)
        self.assertEqual(ack["type"], "server_ack")
        self.assertEqual(ack["bundleId"], "bnd_binary_1")
        self.assertEqual(ack["sequence"], 7)

        delivered = await read_server_ws_frame(r2)
        payload = delivered["bundle"]
        self.assertEqual(payload["bundleId"], "bnd_binary_1")
        self.assertEqual(payload["fromDeviceId"], "dev-1")
        self.assertEqual(base64.b64decode(payload["iv"]), iv)
        self.assertEqual(base64.b64decode(payload["ciphertext"]), ciphertext)

        w1.close()
        w2.close()
        await w1.wait_closed()
        await w2.wait_closed()

    async def test_binary_frame_rejects_garbage(self):
        r1, w1, _ = await self.open_ws("binary-bad", "dev-1")
        await read_server_ws_frame(r1)
        w1.write(make_client_ws_frame(b"\x09\x09short", opcode=0x2))
        await w1.drain()
        error = await read_server_ws_frame(r1)
        self.assertEqual(error["type"], "error")
        self.assertEqual(error["code"], "invalid_frame")
        w1.close()
        await w1.wait_closed()

    async def test_bundles_response_exposes_head_and_oldest(self):
        room = "watermark-room"
        self.assertTrue(self.server.db.save_bundle(room, "w1", "dev-1", 1, "ts", json.dumps({"n": 1})))
        self.assertTrue(self.server.db.save_bundle(room, "w2", "dev-1", 2, "ts", json.dumps({"n": 2})))
        status, result = await self.http("GET", f"/api/rooms/{room}/bundles?device=dev-2&since=1")
        self.assertEqual(status, 200)
        self.assertEqual([b["bundleId"] for b in result["bundles"]], ["w2"])
        self.assertEqual(result["head"], 2)
        self.assertEqual(result["oldest"], 1)

    async def test_cache_limit_and_per_device_ack_retention(self):
        room = "cache-room"
        self.assertTrue(self.server.db.save_bundle(room, "b1", "dev-1", 1, "ts", json.dumps({"note": "hello"}), max_cache_bytes=200))
        self.assertFalse(self.server.db.save_bundle(room, "b2", "dev-1", 2, "ts", json.dumps({"large": "x" * 300}), max_cache_bytes=200))
        self.assertEqual(len(self.server.db.get_pending_bundles(room, "dev-2")), 1)
        self.server.db.record_acks("dev-2", ["b1"], room)
        self.assertEqual(self.server.db.get_pending_bundles(room, "dev-2"), [])
        self.assertEqual(len(self.server.db.get_pending_bundles(room, "dev-3")), 1)
        self.assertGreater(self.server.db.get_room_cache_bytes(room), 0)

    async def test_additive_migration_preserves_legacy_rows(self):
        path = os.path.join(self.tmpdir, "old.db")
        conn = sqlite3.connect(path)
        conn.executescript("""
            CREATE TABLE rooms (room_id TEXT PRIMARY KEY, created_at REAL NOT NULL, last_active_at REAL NOT NULL);
            CREATE TABLE bundles (bundle_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, from_device_id TEXT NOT NULL,
                sequence INTEGER NOT NULL, timestamp TEXT NOT NULL, payload TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL);
            CREATE TABLE pairing_sessions (pin TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, host_device_id TEXT NOT NULL,
                host_public_key TEXT NOT NULL, host_nonce TEXT NOT NULL, guest_ephemeral_pk TEXT, sas_code TEXT,
                status TEXT NOT NULL DEFAULT 'pending_guest', exchange_payload TEXT, created_at REAL NOT NULL, expires_at REAL NOT NULL);
            INSERT INTO rooms VALUES ('old-room', 1, 2);
            INSERT INTO bundles VALUES ('old-bundle', 'old-room', 'old-device', 1, 'ts', '{}', 1, 9999999999);
            INSERT INTO pairing_sessions (pin, session_id, host_device_id, host_public_key, host_nonce, status, created_at, expires_at)
                VALUES ('123-456', 'old-session', 'old-host', 'pk', 'nonce', 'pending_guest', 1, 9999999999);
        """)
        conn.close()
        migrated = RelayDatabase(path)
        self.assertEqual(migrated.conn.execute("SELECT COUNT(*) FROM rooms").fetchone()[0], 1)
        self.assertEqual(migrated.conn.execute("SELECT COUNT(*) FROM bundles").fetchone()[0], 1)
        self.assertEqual(migrated.poll_pairing_session("old-session")["sessionId"], "old-session")
        room_columns = {row["name"] for row in migrated.conn.execute("PRAGMA table_info(rooms)")}
        pair_columns = {row["name"] for row in migrated.conn.execute("PRAGMA table_info(pairing_sessions)")}
        self.assertIn("vault_id", room_columns)
        self.assertIn("host_token_hash", pair_columns)
        migrated.conn.close()


class TestAccountRelay(RelayTestCase):
    auth_required = True

    @staticmethod
    def identity():
        private = ec.generate_private_key(ec.SECP256R1())
        public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.CompressedPoint)
        return {"private": private, "publicKey": public.hex(), "accountId": "acc_" + hashlib.sha256(public).hexdigest()[:24]}

    def device(self, device_id: str, name: str = None):
        if not hasattr(self, "device_keys"):
            self.device_keys = {}
        private = self.device_keys.setdefault(device_id, ec.generate_private_key(ec.SECP256R1()))
        numbers = private.public_key().public_numbers()
        jwk = {"kty": "EC", "crv": "P-256",
               "x": base64.urlsafe_b64encode(numbers.x.to_bytes(32, "big")).rstrip(b"=").decode(),
               "y": base64.urlsafe_b64encode(numbers.y.to_bytes(32, "big")).rstrip(b"=").decode()}
        return {"id": device_id, "name": name or device_id, "platform": "test", "publicKey": json.dumps(jwk)}

    @staticmethod
    def signature(identity, challenge: str):
        der = identity["private"].sign(challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        return r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex()

    async def auth_call(self, route: str, identity, device):
        status, challenge = await self.http("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        self.assertEqual(status, 200)
        self.assertEqual(challenge["expiresIn"], 300)
        body = {"accountId": identity["accountId"], "publicKey": identity["publicKey"],
                "challenge": challenge["challenge"], "signature": self.signature(identity, challenge["challenge"]), "device": device}
        body["deviceSignature"] = self.signature({"private": self.device_keys[device["id"]]}, challenge["challenge"])
        return await self.http("POST", route, body)

    async def register(self, identity=None, device=None):
        identity = identity or self.identity()
        status, result = await self.auth_call("/api/auth/register", identity, device or self.device("device-1"))
        self.assertEqual(status, 201, result)
        return identity, result["token"], result

    async def add_active_device(self, identity, owner_token: str, device_id: str):
        device = self.device(device_id)
        status, pending = await self.auth_call("/api/auth/login", identity, device)
        self.assertEqual(status, 202, pending)
        self.assertEqual(pending["status"], "pending_device")
        status, result = await self.http("POST", f"/api/devices/{device_id}/approve", {}, owner_token)
        self.assertEqual(status, 200, result)
        status, logged_in = await self.auth_call("/api/auth/login", identity, device)
        self.assertEqual(status, 200, logged_in)
        return device, logged_in["token"]

    async def two_devices(self):
        identity, owner_token, _ = await self.register()
        guest_device, guest_token = await self.add_active_device(identity, owner_token, "device-2")
        return identity, owner_token, guest_device, guest_token

    async def accepted_vault(self, owner_token: str, guest_token: str, guest_device_id: str = "device-2", vault_id: str = "vault-1"):
        status, vault = await self.http("PUT", f"/api/vaults/{vault_id}", {"name": "Shared vault"}, owner_token)
        self.assertEqual(status, 200, vault)
        status, result = await self.http("PUT", f"/api/vaults/{vault_id}/grants/{guest_device_id}",
                                         {"mode": "read-write", "encryptedKey": "encrypted-vault-key"}, owner_token)
        self.assertEqual(status, 200, result)
        status, accepted = await self.http("POST", f"/api/vaults/{vault_id}/accept", {}, guest_token)
        self.assertEqual(status, 200, accepted)
        return vault

    async def test_register_login_logout_and_health(self):
        self.assertEqual((await self.http("GET", "/api/account"))[0], 401)
        status, health = await self.http("GET", "/health")
        self.assertTrue(health["authRequired"])
        identity, token, registered = await self.register()
        self.assertEqual(registered["account"]["plan"], "free")
        self.assertEqual(registered["account"]["maxDevices"], 2)
        self.assertEqual(registered["account"]["maxCacheMb"], 1024)
        self.assertFalse(registered["account"]["hasAiLease"])
        self.assertIsNone(self.server.db.conn.execute("SELECT 1 FROM auth_sessions WHERE token_hash = ?", (token,)).fetchone())
        self.assertIsNotNone(self.server.db.conn.execute("SELECT 1 FROM auth_sessions WHERE token_hash = ?",
                                                         (hashlib.sha256(token.encode()).hexdigest(),)).fetchone())
        status, logged_in = await self.auth_call("/api/auth/login", identity, self.device("device-1"))
        self.assertEqual(status, 200)
        status, account = await self.http("GET", "/api/account", token=logged_in["token"])
        self.assertEqual(status, 200)
        self.assertEqual(account["devices"][0]["status"], "active")
        self.assertEqual((await self.http("POST", "/api/auth/logout", {}, logged_in["token"]))[0], 200)
        self.assertEqual((await self.http("GET", "/api/account", token=logged_in["token"]))[0], 401)

    async def test_bad_signature_and_single_use_challenge(self):
        identity = self.identity()
        other = self.identity()
        status, challenge = await self.http("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        body = {"accountId": identity["accountId"], "publicKey": identity["publicKey"], "challenge": challenge["challenge"],
                "signature": self.signature(other, challenge["challenge"]), "device": self.device("device-1")}
        self.assertEqual((await self.http("POST", "/api/auth/register", body))[0], 401)
        body["signature"] = self.signature(identity, challenge["challenge"])
        self.assertEqual((await self.http("POST", "/api/auth/register", body))[0], 401)
        status, _ = await self.auth_call("/api/auth/register", identity, self.device("device-1"))
        self.assertEqual(status, 201)

    async def test_pending_device_approval_quota_rename_and_revoke(self):
        identity, owner_token, _ = await self.register()
        device2, token2 = await self.add_active_device(identity, owner_token, "device-2")
        status, account = await self.http("GET", "/api/account", token=owner_token)
        self.assertEqual(status, 200)
        self.assertEqual(len(account["devices"]), 2)
        status, _ = await self.http("PATCH", "/api/devices/device-2", {"name": "Renamed"}, owner_token)
        self.assertEqual(status, 200)
        _, account = await self.http("GET", "/api/account", token=owner_token)
        self.assertEqual(account["devices"][1]["name"], "Renamed")

        status, pending = await self.auth_call("/api/auth/login", identity, self.device("device-3"))
        self.assertEqual(status, 202)
        self.assertEqual((await self.http("POST", "/api/devices/device-3/approve", {}, owner_token))[0], 403)
        self.assertEqual((await self.http("DELETE", "/api/devices/device-2", {}, owner_token))[0], 200)
        self.assertEqual((await self.http("GET", "/api/account", token=token2))[0], 401)
        status, revoked_login = await self.auth_call("/api/auth/login", identity, device2)
        self.assertEqual(status, 403)
        self.assertEqual(revoked_login["error"], "device_revoked")

    async def device_completion(self, identity, pending, device_id="device-2", **overrides):
        _, challenge = await self.http("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        body = {"continuationSecret": pending["continuationSecret"], "challenge": challenge["challenge"],
                "deviceSignature": self.signature({"private": self.device_keys[device_id]}, challenge["challenge"])}
        body.update(overrides)
        return await self.http("POST", f"/api/auth/device-requests/{pending['requestId']}/complete", body)

    async def test_pending_device_automatic_login_and_single_use(self):
        identity, owner, _ = await self.register()
        _, pending = await self.auth_call("/api/auth/login", identity, self.device("device-2"))
        self.assertEqual(pending["expiresIn"], 600)
        stored = self.server.db.conn.execute("SELECT * FROM pending_auth_requests WHERE id = ?", (pending["requestId"],)).fetchone()
        self.assertEqual(stored["secret_hash"], hashlib.sha256(pending["continuationSecret"].encode()).hexdigest())
        self.assertNotIn(pending["continuationSecret"], tuple(stored))
        self.assertEqual(await self.device_completion(identity, pending), (200, {"status": "pending"}))
        await self.http("POST", "/api/devices/device-2/approve", {}, owner)
        results = await asyncio.gather(self.device_completion(identity, pending), self.device_completion(identity, pending))
        # Challenges are account-wide; one may supersede the other, but only one session is minted.
        successful = [result for status, result in results if status == 200]
        self.assertEqual(len(successful), 1, results)
        logged_in = successful[0]
        self.assertEqual(logged_in["account"]["id"], identity["accountId"])
        self.assertEqual(logged_in["device"]["id"], "device-2")
        self.assertEqual((await self.http("GET", "/api/account", token=logged_in["token"]))[0], 200)
        self.assertEqual((await self.device_completion(identity, pending))[0], 409)
        self.assertEqual(self.server.db.conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE device_id = 'device-2'").fetchone()[0], 1)

    async def test_pending_device_wrong_secret_key_account_and_challenge_replay(self):
        identity, owner, _ = await self.register()
        _, pending = await self.auth_call("/api/auth/login", identity, self.device("device-2"))
        path = f"/api/auth/device-requests/{pending['requestId']}/complete"
        self.assertEqual((await self.http("POST", path, {}, owner))[0], 401)
        self.assertEqual((await self.device_completion(identity, pending, continuationSecret="wrong"))[0], 401)
        self.device("attacker")
        self.assertEqual((await self.device_completion(identity, pending, "attacker"))[0], 401)
        other = self.identity()
        self.assertEqual((await self.device_completion(other, pending))[0], 401)
        _, challenge = await self.http("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        body = {"continuationSecret": pending["continuationSecret"], "challenge": challenge["challenge"],
                "deviceSignature": self.signature({"private": self.device_keys["device-2"]}, challenge["challenge"])}
        self.assertEqual(await self.http("POST", path, body), (200, {"status": "pending"}))
        await self.http("POST", "/api/devices/device-2/approve", {}, owner)
        self.assertEqual((await self.http("POST", path, body))[0], 401)
        self.assertEqual((await self.device_completion(identity, pending))[0], 200)

    async def test_pending_device_expiry_revocation_binding_and_quota(self):
        identity, owner, _ = await self.register()
        _, pending = await self.auth_call("/api/auth/login", identity, self.device("device-2"))
        with self.server.db.conn:
            self.server.db.conn.execute("UPDATE pending_auth_requests SET expires_at = 0")
        self.assertEqual(await self.device_completion(identity, pending), (200, {"status": "expired"}))
        _, pending = await self.auth_call("/api/auth/login", identity, self.device("device-2"))
        replacement = self.device("replacement")["publicKey"]
        with self.server.db.conn:
            self.server.db.conn.execute("UPDATE devices SET public_key = ? WHERE id = 'device-2'", (replacement,))
        self.assertEqual(await self.device_completion(identity, pending), (200, {"status": "rejected"}))
        with self.server.db.conn:
            self.server.db.conn.execute("UPDATE devices SET public_key = ? WHERE id = 'device-2'", (self.device("device-2")["publicKey"],))
        await self.http("DELETE", "/api/devices/device-2", {}, owner)
        self.assertEqual(await self.device_completion(identity, pending), (200, {"status": "rejected"}))
        await self.add_active_device(identity, owner, "device-3")
        _, limited = await self.auth_call("/api/auth/login", identity, self.device("device-4"))
        self.assertEqual((await self.http("POST", "/api/devices/device-4/approve", {}, owner))[0], 403)
        self.assertEqual(await self.device_completion(identity, limited, "device-4"), (200, {"status": "pending"}))
        self.assertEqual((await self.http("PATCH", "/api/devices/device-1", {"name": "x" * 65}, owner))[0], 400)

    async def test_vault_invitations_accept_decline_and_revoke(self):
        _, owner_token, guest_device, guest_token = await self.two_devices()
        await self.accepted_vault(owner_token, guest_token)
        _, guest_data = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(guest_data["vaults"][0]["id"], "vault-1")
        self.assertEqual(guest_data["vaults"][0]["grants"][1]["status"], "accepted")
        self.assertEqual(guest_data["invitations"], [])

        # Repeating an accepted invitation must not disconnect the guest.
        repeated = {"mode": "read-write", "encryptedKey": "encrypted-vault-key"}
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1/grants/device-2", repeated, owner_token))[0], 200)
        _, repeated_state = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(len(repeated_state["vaults"]), 1)
        self.assertEqual(repeated_state["invitations"], [])
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1/grants/device-1", repeated, owner_token))[0], 409)
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1", {"name": "still writable"}, owner_token))[0], 200)
        # A changed key, even with identical permissions, requires explicit acceptance.
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1/grants/device-2",
                                         {**repeated, "encryptedKey": "rotated-key"}, owner_token))[0], 200)
        _, changed_state = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(changed_state["vaults"], [])
        self.assertEqual(changed_state["invitations"][0]["encryptedKey"], "rotated-key")
        await self.http("POST", "/api/vaults/vault-1/accept", {}, guest_token)

        grant = {"mode": "receive-only", "encryptedKey": "second-key"}
        await self.http("PUT", "/api/vaults/vault-1/grants/device-2", grant, owner_token)
        _, invitations = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(invitations["invitations"][0]["encryptedKey"], "second-key")
        self.assertEqual((await self.http("POST", "/api/vaults/vault-1/decline", {}, guest_token))[0], 200)
        _, guest_data = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(guest_data["vaults"], [])

        await self.http("PUT", "/api/vaults/vault-1/grants/device-2", grant, owner_token)
        await self.http("POST", "/api/vaults/vault-1/accept", {}, guest_token)
        self.assertEqual((await self.http("DELETE", "/api/vaults/vault-1/grants/device-2", {}, owner_token))[0], 200)
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/bundle?vault=vault-1",
                                               {"bundle": {"fromDeviceId": guest_device["id"]}}, guest_token))[0], 403)

    async def test_participant_pairing_creates_vault_grant_and_payload(self):
        identity, host_token, _, guest_token = await self.two_devices()
        _, other_token, _ = await self.register(self.identity(), self.device("other-device"))
        status, created = await self.http("POST", "/api/pair/create", {"deviceId": "device-1", "publicKey": "host-ephemeral"}, host_token)
        self.assertEqual(status, 200)
        self.assertEqual((await self.http("POST", "/api/pair/claim", {"pin": created["pin"], "deviceId": "device-2"}, None))[0], 401)
        mismatch = await self.http("POST", "/api/pair/claim", {"pin": created["pin"], "deviceId": "other-device", "publicKey": "other-pk"}, other_token)
        self.assertEqual(mismatch[0], 403)
        status, claimed = await self.http("POST", "/api/pair/claim",
                                          {"pin": created["pin"], "deviceId": "device-2", "publicKey": "guest-ephemeral"}, guest_token)
        self.assertEqual(status, 200)
        self.assertEqual(claimed["status"], "pending_approval")
        self.assertEqual((await self.http("GET", f"/api/pair/poll?session={created['sessionId']}", token=other_token))[0], 403)
        self.assertEqual((await self.http("POST", "/api/pair/approve", {"sessionId": created["sessionId"]}, guest_token))[0], 403)
        approval = {"sessionId": created["sessionId"], "vaultId": "paired-vault", "vaultName": "Paired vault",
                    "mode": "receive-only", "encryptedKey": "paired-encrypted-key"}
        self.assertEqual((await self.http("POST", "/api/pair/approve", approval, host_token))[0], 200)
        status, polled = await self.http("GET", f"/api/pair/poll?session={created['sessionId']}", token=guest_token)
        self.assertEqual(status, 200)
        payload = json.loads(base64.b64decode(polled["exchangePayload"]).decode("utf-8"))
        self.assertEqual(payload, {"vaultId": "paired-vault", "vaultName": "Paired vault", "mode": "receive-only",
                                   "encryptedKey": "paired-encrypted-key", "hostDeviceId": "device-1",
                                   "hostDeviceName": "device-1", "hostPlatform": "test"})
        _, vaults = await self.http("GET", "/api/vaults", token=guest_token)
        self.assertEqual(vaults["vaults"][0]["id"], "paired-vault")

    async def test_authenticated_http_room_and_binding(self):
        _, owner_token, guest_device, guest_token = await self.two_devices()
        await self.accepted_vault(owner_token, guest_token)
        bundle = {"bundle": {"bundleId": "auth-http-1", "fromDeviceId": "device-1", "sequence": 1, "changes": []}}
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/bundle?vault=vault-1", bundle))[0], 401)
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/bundle", bundle, owner_token))[0], 400)
        spoof = {"bundle": {"bundleId": "spoof", "fromDeviceId": "device-2"}}
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/bundle?vault=vault-1", spoof, owner_token))[0], 403)
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/bundle?vault=vault-1", bundle, owner_token))[0], 200)
        self.assertEqual((await self.http("GET", "/api/rooms/room-1/bundles?vault=vault-1&device=device-1", token=guest_token))[0], 403)
        status, pending = await self.http("GET", "/api/rooms/room-1/bundles?vault=vault-1", token=guest_token)
        self.assertEqual(status, 200)
        self.assertEqual(pending["bundles"][0]["bundleId"], "auth-http-1")
        await self.http("PUT", "/api/vaults/vault-2", {"name": "Other"}, owner_token)
        self.assertEqual((await self.http("GET", "/api/rooms/room-1/bundles?vault=vault-2", token=owner_token))[0], 403)
        self.assertEqual((await self.http("POST", "/api/rooms/room-1/ack?vault=vault-1",
                                               {"deviceId": "device-1", "bundleIds": ["auth-http-1"]}, guest_token))[0], 403)
        status, acked = await self.http("POST", "/api/rooms/room-1/ack?vault=vault-1",
                                        {"deviceId": guest_device["id"], "bundleIds": ["auth-http-1"]}, guest_token)
        self.assertEqual(status, 200)
        self.assertEqual(acked["acked"], 1)

    async def test_authenticated_websocket_and_sender_binding(self):
        _, owner_token, _, guest_token = await self.two_devices()
        await self.accepted_vault(owner_token, guest_token)
        _, writer, status_line = await self.open_ws("ws-auth", "device-1", vault="vault-1")
        self.assertIn("401", status_line)
        self.assertIsNone(writer)
        r1, w1, status_line = await self.open_ws("ws-auth", "device-1", owner_token, "vault-1")
        self.assertIn("101", status_line)
        self.assertEqual((await read_server_ws_frame(r1))["type"], "welcome")
        r2, w2, _ = await self.open_ws("ws-auth", "device-2", guest_token, "vault-1")
        self.assertEqual((await read_server_ws_frame(r2))["type"], "welcome")
        spoof = {"type": "bundle", "bundle": {"bundleId": "spoof-ws", "fromDeviceId": "device-2"}}
        w1.write(make_client_ws_frame(json.dumps(spoof).encode()))
        await w1.drain()
        self.assertEqual((await read_server_ws_frame(r1))["code"], "device_mismatch")
        valid = {"type": "bundle", "bundle": {"bundleId": "valid-ws", "fromDeviceId": "device-1", "sequence": 1}}
        w1.write(make_client_ws_frame(json.dumps(valid).encode()))
        await w1.drain()
        self.assertEqual((await read_server_ws_frame(r1))["type"], "server_ack")
        self.assertEqual((await read_server_ws_frame(r2))["bundle"]["bundleId"], "valid-ws")
        w1.close()
        w2.close()
        await w1.wait_closed()
        await w2.wait_closed()

    async def test_device_proof_key_substitution_and_route_aliases(self):
        identity, token, registered = await self.register()
        device = self.device("device-1")
        _, challenge = await self.http("POST", "/api/auth/challenge", {"accountId": identity["accountId"]})
        body = {"accountId": identity["accountId"], "publicKey": identity["publicKey"],
                "challenge": challenge["challenge"], "signature": self.signature(identity, challenge["challenge"]), "device": device}
        self.assertEqual((await self.http("POST", "/api/auth/login", body))[0], 401)
        replacement = self.device("attacker")
        replacement["id"] = "device-1"
        self.assertEqual((await self.auth_call("/api/auth/login", identity, replacement))[0], 403)
        await self.auth_call("/api/auth/login", identity, self.device("device-2"))
        self.assertEqual((await self.http("POST", "/api/account/devices/device-2/approve", {}, token))[0], 200)
        self.assertEqual((await self.http("PATCH", "/api/account/devices/device-2", {"name": "new"}, token))[0], 200)
        self.assertEqual((await self.http("DELETE", "/api/account/devices/device-2", {}, token))[0], 200)
        self.assertEqual((await self.http("POST", "/api/account/devices/device-2/approve", {}, token))[0], 409)

    async def test_rotation_receive_only_and_self_grant_bypass(self):
        _, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        self.assertEqual((await self.http("GET", "/api/rooms/old-room/bundles?vault=vault-1", token=owner))[0], 200)
        self.assertEqual((await self.http("POST", "/api/vaults/vault-1/rotate", {}, owner))[0], 200)
        self.assertEqual((await self.http("GET", "/api/rooms/old-room/bundles?vault=vault-1", token=owner))[0], 403)
        self.assertEqual((await self.http("GET", "/api/rooms/new-room/bundles?vault=vault-1", token=guest))[0], 403)
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1", {"name": "bypass"}, guest))[0], 403)
        await self.http("PUT", "/api/vaults/vault-1/grants/device-2", {"mode": "receive-only", "encryptedKey": "key"}, owner)
        await self.http("POST", "/api/vaults/vault-1/accept", {}, guest)
        self.assertEqual((await self.http("POST", "/api/rooms/new-room/bundle?vault=vault-1", {"fromDeviceId": "device-2"}, guest))[0], 403)
        self.assertEqual((await self.http("POST", "/api/vaults/vault-1/rotate", {}, guest))[0], 403)
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1/grants/device-1", {"mode": "read-write", "encryptedKey": "key"}, guest))[0], 403)

    async def test_cross_account_ack_overwrite_replay_and_revoke(self):
        _, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        _, outsider, _ = await self.register(self.identity(), self.device("other"))
        await self.http("PUT", "/api/vaults/other-vault", {"name": "other"}, outsider)
        path = "/api/rooms/secure/bundle?vault=vault-1"
        bundle = {"bundleId": "unique", "fromDeviceId": "device-1", "sequence": 1}
        self.assertEqual((await self.http("POST", path, bundle, owner))[0], 200)
        self.assertEqual((await self.http("POST", "/api/rooms/other/bundle?vault=other-vault", {**bundle, "fromDeviceId": "other"}, outsider))[0], 409)
        _, result = await self.http("POST", "/api/rooms/other/ack?vault=other-vault", {"bundleIds": ["unique"]}, outsider)
        self.assertEqual(result["acked"], 0)
        self.assertEqual((await self.http("DELETE", "/api/devices/device-2", {}, outsider))[0], 404)
        self.assertEqual((await self.http("GET", "/api/rooms/secure/bundles?vault=vault-1", token=guest))[0], 200)
        await self.http("POST", "/api/rooms/secure/ack?vault=vault-1", {"bundleIds": ["unique"]}, guest)
        self.assertEqual((await self.http("POST", path, bundle, owner))[0], 409)
        self.assertEqual((await self.http("PUT", "/api/vaults/vault-1", {"name": "takeover"}, outsider))[0], 403)

    async def test_websocket_rechecks_revocation_logout_and_rotation(self):
        _, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        reader, writer, _ = await self.open_ws("live", "device-2", guest, "vault-1")
        await read_server_ws_frame(reader)
        await self.http("DELETE", "/api/vaults/vault-1/grants/device-2", {}, owner)
        writer.write(make_client_ws_frame(json.dumps({"type": "bundle", "bundle": {"bundleId": "denied", "fromDeviceId": "device-2"}}).encode()))
        await writer.drain()
        self.assertEqual((await read_server_ws_frame(reader))["code"], "vault_access_denied")
        await self.http("POST", "/api/auth/logout", {}, guest)
        writer.write(make_client_ws_frame(b'{"type":"ping"}'))
        await writer.drain()
        self.assertEqual((await read_server_ws_frame(reader))["code"], "unauthorized")
        writer.close()
        await writer.wait_closed()
        reader, writer, _ = await self.open_ws("live", "device-1", owner, "vault-1")
        await read_server_ws_frame(reader)
        await self.http("POST", "/api/vaults/vault-1/rotate", {}, owner)
        writer.write(make_client_ws_frame(b'{"type":"ping"}'))
        await writer.drain()
        self.assertEqual((await read_server_ws_frame(reader))["code"], "room_bound_to_another_vault")
        writer.close()
        await writer.wait_closed()

    async def test_optional_mode_still_protects_account_rooms_and_pairing(self):
        _, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        await self.http("GET", "/api/rooms/protected/bundles?vault=vault-1", token=owner)
        self.server.require_account_auth = False
        self.assertEqual((await self.http("GET", "/api/rooms/protected/bundles"))[0], 401)
        self.assertEqual((await self.http("GET", "/api/rooms/anonymous/bundles"))[0], 200)
        _, writer, line = await self.open_ws("protected", "device-1")
        self.assertIsNone(writer)
        self.assertIn("401", line)
        _, pair = await self.http("POST", "/api/pair/create", {"publicKey": "ephemeral"}, owner)
        self.assertEqual((await self.http("GET", f"/api/pair/poll?session={pair['sessionId']}"))[0], 401)
        self.assertEqual((await self.http("POST", "/api/pair/exchange", {"sessionId": pair["sessionId"]}, owner))[0], 403)

    async def test_logs_do_not_echo_secrets_from_invalid_requests(self):
        _, owner, _ = await self.register()
        await self.http("PUT", "/api/vaults/vault-1", {"name": "safe"}, owner)
        secret = "seed-token-must-not-appear"
        with self.assertLogs("slag-relay", level="DEBUG") as captured:
            status, _ = await self.http("POST", "/api/rooms/logs/bundle?vault=vault-1",
                                        {"fromDeviceId": "device-1", "sequence": secret}, owner)
        self.assertEqual(status, 400)
        self.assertNotIn(secret, " ".join(captured.output))
        self.assertNotIn(owner, " ".join(captured.output))

    async def test_quota_counts_utf8_and_shared_account_rooms(self):
        identity, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        await self.http("PUT", "/api/vaults/vault-2", {"name": "two"}, owner)
        db = self.server.db
        self.assertTrue(db.save_bundle("quota-one", "quota1", "device-1", 1, "ts", '"é"', account_id=identity["accountId"], vault_id="vault-1", max_cache_bytes=8))
        self.assertEqual(db.get_account_cache_bytes(identity["accountId"]), 4)
        self.assertTrue(db.save_bundle("quota-two", "quota2", "device-1", 1, "ts", '"é"', account_id=identity["accountId"], vault_id="vault-2", max_cache_bytes=8))
        self.assertFalse(db.save_bundle("quota-three", "quota3", "device-1", 1, "ts", '{}', account_id=identity["accountId"], vault_id="vault-2", max_cache_bytes=8))

    async def test_ai_requires_account_plan_not_room_token(self):
        identity, token, _ = await self.register()
        self.assertEqual((await self.http("POST", "/api/ai/chat", {}, "room_smile_valid_token"))[0], 401)
        self.assertEqual((await self.http("POST", "/api/ai/chat", {}, token))[0], 403)
        self.server.db.conn.execute("UPDATE accounts SET plan = 'smile' WHERE account_id = ?", (identity["accountId"],))
        self.server.db.conn.commit()
        status, answer = await self.http("POST", "/api/ai/chat", {"messages": []}, token)
        self.assertEqual(status, 200)
        self.assertIn("choices", answer)
        _, account = await self.http("GET", "/api/account", token=token)
        self.assertTrue(account["account"]["hasAiLease"])
        self.assertEqual(account["account"]["maxCacheMb"], 10240)

    async def test_monotonic_sync_id_and_since_filtering(self):
        identity, owner, _, guest = await self.two_devices()
        await self.accepted_vault(owner, guest)
        status1, res1 = await self.http("POST", "/api/rooms/sync-test/bundle?vault=vault-1",
                                        {"bundleId": "bnd-1", "fromDeviceId": "device-1", "sequence": 1, "changes": []}, owner)
        self.assertEqual(status1, 200)
        self.assertEqual(res1["syncId"], 1)

        status2, res2 = await self.http("POST", "/api/rooms/sync-test/bundle?vault=vault-1",
                                        {"bundleId": "bnd-2", "fromDeviceId": "device-1", "sequence": 2, "changes": []}, owner)
        self.assertEqual(status2, 200)
        self.assertEqual(res2["syncId"], 2)

        status3, res3 = await self.http("POST", "/api/rooms/sync-test/bundle?vault=vault-1",
                                        {"bundleId": "bnd-3", "fromDeviceId": "device-1", "sequence": 3, "changes": []}, owner)
        self.assertEqual(status3, 200)
        self.assertEqual(res3["syncId"], 3)

        g_status, g_all = await self.http("GET", "/api/rooms/sync-test/bundles?vault=vault-1", token=guest)
        self.assertEqual(g_status, 200)
        self.assertEqual(len(g_all["bundles"]), 3)

        s_status, s_res = await self.http("GET", "/api/rooms/sync-test/bundles?vault=vault-1&since=2", token=guest)
        self.assertEqual(s_status, 200)
        self.assertEqual(len(s_res["bundles"]), 1)
        self.assertEqual(s_res["bundles"][0]["bundleId"], "bnd-3")
        self.assertEqual(s_res["bundles"][0]["syncId"], 3)


if __name__ == "__main__":
    unittest.main()
