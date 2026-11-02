#!/usr/bin/env python3
"""
Unit and integration tests for SLAG Relay Server.
Tests HTTP endpoints, WebSocket handshake and data relay without external packages.
"""

import asyncio
import base64
import json
import os
import shutil
import struct
import tempfile
import unittest
import urllib.request
from server import SlagRelayServer


def make_client_ws_frame(payload: bytes) -> bytes:
    """Constructs a properly masked client-to-server RFC 6455 text frame."""
    length = len(payload)
    mask = os.urandom(4)
    masked = bytearray(payload)
    for i in range(length):
        masked[i] ^= mask[i % 4]

    if length <= 125:
        header = bytearray([0x81, 0x80 | length]) + mask
    elif length <= 65535:
        header = bytearray([0x81, 0x80 | 126]) + struct.pack("!H", length) + mask
    else:
        header = bytearray([0x81, 0x80 | 127]) + struct.pack("!Q", length) + mask

    return header + masked


async def read_server_ws_frame(reader: asyncio.StreamReader) -> bytes:
    """Reads a server-to-client RFC 6455 unmasked frame payload."""
    hdr = await reader.readexactly(2)
    length = hdr[1] & 0x7F
    if length == 126:
        ext = await reader.readexactly(2)
        length = struct.unpack("!H", ext)[0]
    elif length == 127:
        ext = await reader.readexactly(8)
        length = struct.unpack("!Q", ext)[0]
    return await reader.readexactly(length)


class TestRelayServer(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="slag_test_")
        self.db_path = os.path.join(self.tmpdir, "test_relay.db")
        self.port = 18431
        self.host = "127.0.0.1"
        self.server = SlagRelayServer(self.host, self.port, self.db_path)
        self.server_task = asyncio.create_task(self.server.run())
        await asyncio.sleep(0.15)  # wait for socket bind

    async def asyncTearDown(self):
        self.server_task.cancel()
        try:
            await self.server_task
        except (asyncio.CancelledError, Exception):
            pass
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _sync_http(self, method: str, url: str, data: dict = None) -> dict:
        req = urllib.request.Request(url, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
            req.data = json.dumps(data).encode("utf-8")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))

    async def test_health_http(self):
        url = f"http://{self.host}:{self.port}/health"
        data = await asyncio.to_thread(self._sync_http, "GET", url)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "slag-relay")

    async def test_pairing_flow(self):
        # 1. Host creates pairing session
        create_url = f"http://{self.host}:{self.port}/api/pair/create"
        res = await asyncio.to_thread(
            self._sync_http, "POST", create_url,
            {"deviceId": "slag-host-1", "publicKey": "pk-host-1"}
        )
        pin = res["pin"]
        session_id = res["sessionId"]
        self.assertTrue(len(pin) == 7 and "-" in pin)

        # 2. Guest claims session with PIN (no device telemetry, pure ephemeral pk)
        claim_url = f"http://{self.host}:{self.port}/api/pair/claim"
        claim_res = await asyncio.to_thread(
            self._sync_http, "POST", claim_url,
            {"pin": pin, "publicKey": "pk-guest-ephemeral"}
        )
        self.assertEqual(claim_res["status"], "pending_approval")
        self.assertTrue(len(claim_res["sasCode"]) == 4)

        # 3. Host polls session -> sees pending_approval and matching SAS code
        poll_host_url = f"http://{self.host}:{self.port}/api/pair/poll?session={session_id}"
        host_poll = await asyncio.to_thread(self._sync_http, "GET", poll_host_url)
        self.assertEqual(host_poll["status"], "pending_approval")
        self.assertEqual(host_poll["sasCode"], claim_res["sasCode"])

        # 4. Host approves with encrypted vault key
        approve_url = f"http://{self.host}:{self.port}/api/pair/approve"
        appr_res = await asyncio.to_thread(
            self._sync_http, "POST", approve_url,
            {"sessionId": session_id, "encryptedPayload": "ENCRYPTED_VAULT_KEY_BYTES"}
        )
        self.assertEqual(appr_res["status"], "approved")

        # 5. Guest polls -> sees approved and receives payload
        guest_poll = await asyncio.to_thread(self._sync_http, "GET", poll_host_url)
        self.assertEqual(guest_poll["status"], "approved")
        self.assertEqual(guest_poll["exchangePayload"], "ENCRYPTED_VAULT_KEY_BYTES")

    async def test_websocket_relay_and_broadcast(self):
        # Client 1 connects over WS
        ws_key = base64.b64encode(os.urandom(16)).decode()
        r1, w1 = await asyncio.open_connection(self.host, self.port)
        w1.write((
            f"GET /ws/test-room-123?device=dev-1 HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n\r\n"
        ).encode())
        await w1.drain()

        # Read handshake
        line = await r1.readline()
        self.assertIn(b"101 Switching Protocols", line)
        while True:
            hl = await r1.readline()
            if hl == b"\r\n" or not hl:
                break

        # Read welcome frame
        welcome_bytes = await read_server_ws_frame(r1)
        welcome = json.loads(welcome_bytes.decode())
        self.assertEqual(welcome["type"], "welcome")

        # Client 2 connects to same room
        ws_key2 = base64.b64encode(os.urandom(16)).decode()
        r2, w2 = await asyncio.open_connection(self.host, self.port)
        w2.write((
            f"GET /ws/test-room-123?device=dev-2 HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key2}\r\n\r\n"
        ).encode())
        await w2.drain()
        await r2.readline()
        while True:
            hl = await r2.readline()
            if hl == b"\r\n" or not hl:
                break
        await read_server_ws_frame(r2)  # welcome on dev-2

        # Client 1 sends bundle
        bundle_msg = json.dumps({
            "type": "bundle",
            "bundle": {
                "bundleId": "bnd-1",
                "fromDeviceId": "dev-1",
                "sequence": 1,
                "changes": [{"id": "item-1", "action": "upsert"}]
            }
        }).encode("utf-8")

        frame = make_client_ws_frame(bundle_msg)
        w1.write(frame)
        await w1.drain()

        # Client 1 gets server_ack
        ack_bytes = await read_server_ws_frame(r1)
        ack = json.loads(ack_bytes.decode())
        self.assertEqual(ack["type"], "server_ack")
        self.assertEqual(ack["bundleId"], "bnd-1")

        # Client 2 receives broadcasted bundle!
        received_bytes = await read_server_ws_frame(r2)
        received_msg = json.loads(received_bytes.decode())
        self.assertEqual(received_msg["type"], "bundle")
        self.assertEqual(received_msg["bundle"]["bundleId"], "bnd-1")

        # Close clients
        w1.close()
        w2.close()
        await w1.wait_closed()
        await w2.wait_closed()

    async def test_cache_limit_and_ack_deletion(self):
        # 1. Test cache quota limit in RelayDatabase
        room = "test-cache-room"
        small_limit = 200  # 200 bytes limit
        saved = self.server.db.save_bundle(room, "b1", "dev-1", 1, "ts", json.dumps({"note": "hello"}), max_cache_bytes=small_limit)
        self.assertTrue(saved)

        # Huge payload should be rejected due to cache limit
        huge_payload = json.dumps({"large": "x" * 300})
        saved_huge = self.server.db.save_bundle(room, "b2", "dev-1", 2, "ts", huge_payload, max_cache_bytes=small_limit)
        self.assertFalse(saved_huge)

        # 2. Test instant ACK deletion
        pending_before = self.server.db.get_pending_bundles(room, "dev-2")
        self.assertEqual(len(pending_before), 1)

        # dev-2 acks b1 -> should be immediately deleted from cache
        self.server.db.record_acks("dev-2", ["b1"])
        pending_after = self.server.db.get_pending_bundles(room, "dev-2")
        self.assertEqual(len(pending_after), 0)
        self.assertEqual(self.server.db.get_room_cache_bytes(room), 0)


if __name__ == "__main__":
    unittest.main()
