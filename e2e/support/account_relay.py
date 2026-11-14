"""Test-only relay: loopback port zero, caller-owned temporary database."""
import asyncio
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
candidates = [
    os.environ.get("SLAG_RELAY_DIR"),
    root / "relay",
    root.parent / "slag-relay",
]
relay_dir = next((Path(value).resolve() for value in candidates if value and (Path(value) / "server.py").is_file()), None)
if relay_dir is None:
    print(json.dumps({"error": "relay checkout not found; set SLAG_RELAY_DIR"}), flush=True)
    raise SystemExit(1)

sys.path.insert(0, str(relay_dir))
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
