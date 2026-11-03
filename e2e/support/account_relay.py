"""Test-only relay: loopback port zero, caller-owned temporary database."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "relay"))
from server import SlagRelayServer


async def main():
    relay = SlagRelayServer("127.0.0.1", 0, sys.argv[1])
    try:
        server = await asyncio.start_server(relay.handle_connection, "127.0.0.1", 0)
        async with server:
            print(json.dumps({"url": f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"}), flush=True)
            await server.serve_forever()
    finally:
        relay.db.conn.close()


asyncio.run(main())
