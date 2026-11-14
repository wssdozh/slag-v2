"""Architecture gate: the relay is a graph, not one file.

Three things rot quietly when a 4000-line module is split: someone adds a back-import into
`server`, someone grows one domain module back into a god-object, and someone drops a route
handler that forgets to hand the request on. All three are checked here, cheaply and statically.
"""

from __future__ import annotations

import ast
import pathlib
import re
import unittest

RELAY = pathlib.Path(__file__).resolve().parent

# Import direction: a module may only import modules at its own level or below. Equal levels are
# allowed on purpose (routes_ai calls the ai proxy), cycles are not (nothing at level N+1 is
# importable from level N, so a cycle would have to go through `server`, which nobody may import).
LEVELS = {
    "errors": 0, "settings": 0, "fmt": 0, "assistant_card": 0, "wire": 0, "notify_routes": 0, "tg": 0,
    "store": 1, "store.base": 1, "store.schema": 1, "store.bundles": 1, "store.accounts": 1,
    "store.pairing": 1, "store.vaults": 1, "store.notify": 1, "store.assistant": 1,
    "router": 2, "http_plumbing": 2, "realtime": 2,
    "routes_health": 2, "routes_admin": 2, "routes_admin_ops": 2, "routes_auth": 2,
    "routes_notify": 2, "routes_vaults": 2, "routes_ai": 2, "routes_static": 2,
    "ai_proxy": 2, "delivery": 2, "bot": 2, "assistant": 2, "assistant_actions": 2,
    "server": 3,
}

# Files that are code even though they are not in LEVELS: they describe the graph, they are not in it.
NOT_GRAPH = {"ai_smoke.py", "notify_smoke.py"}

MAX_SERVER_LINES = 400
MAX_MODULE_LINES = 400


def relay_modules() -> dict[str, pathlib.Path]:
    modules = {}
    for path in RELAY.glob("*.py"):
        if path.name.startswith("test_") or path.name.startswith("_") or path.name in NOT_GRAPH:
            continue
        modules[path.stem] = path
    for path in (RELAY / "store").glob("*.py"):
        stem = "store" if path.name == "__init__.py" else f"store.{path.stem}"
        modules[stem] = path
    return modules


def imported_modules(path: pathlib.Path) -> set[str]:
    """Module names a file imports, both `import x` and `from x import y`."""
    names = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names


def line_count(path: pathlib.Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


class ArchitectureTest(unittest.TestCase):
    def setUp(self):
        self.modules = relay_modules()

    def test_every_module_is_in_the_level_map(self):
        missing = sorted(set(self.modules) - set(LEVELS))
        self.assertEqual(missing, [], f"add these to LEVELS: {missing}")

    def test_only_server_imports_server(self):
        offenders = sorted(
            name for name, path in self.modules.items()
            if name != "server" and "server" in imported_modules(path)
        )
        self.assertEqual(offenders, [], "import server only from server's own __main__ path")

    def test_imports_go_downhill(self):
        broken = []
        for name, path in self.modules.items():
            for imported in imported_modules(path):
                if imported not in LEVELS:
                    continue
                if LEVELS[imported] > LEVELS[name]:
                    broken.append(f"{name} -> {imported}")
        self.assertEqual(broken, [], "a module may only import modules at its level or below")

    def test_no_module_grows_back_into_a_god_file(self):
        too_big = {name: line_count(path) for name, path in self.modules.items()
                   if line_count(path) > (MAX_SERVER_LINES if name == "server" else MAX_MODULE_LINES)}
        self.assertEqual(too_big, {}, "split the module instead of raising the limit")

    def test_route_handlers_always_hand_the_request_on(self):
        """A handler that falls off its own end returns None, and None means 'already answered'.

        That is how a route silently answered nothing and the client waited for a timeout:
        every `_route_*` body has to end with `return _NEXT`, or return a real answer on every path.
        """
        broken = []
        for path in RELAY.glob("routes_*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for cls in [n for n in tree.body if isinstance(n, ast.ClassDef)]:
                for fn in [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
                    if not fn.name.startswith("_route_"):
                        continue
                    last = fn.body[-1]
                    is_next = (isinstance(last, ast.Return) and isinstance(last.value, ast.Name)
                               and last.value.id == "_NEXT")
                    if not is_next:
                        broken.append(f"{path.name}:{fn.name}")
        self.assertEqual(broken, [], "end every route handler with `return _NEXT`")

    def test_dispatch_lists_every_handler_exactly_once(self):
        router = (RELAY / "router.py").read_text(encoding="utf-8")
        dispatched = re.findall(r"self\.(_route_[a-z_]+)", router)
        self.assertEqual(len(dispatched), len(set(dispatched)), "handler dispatched twice")
        defined = set()
        for path in RELAY.glob("routes_*.py"):
            defined.update(re.findall(r"async def (_route_[a-z_]+)", path.read_text(encoding="utf-8")))
        self.assertEqual(sorted(set(dispatched)), sorted(defined),
                         "router.py and routes_*.py disagree about the handler set")

    def test_endpoints_did_not_vanish(self):
        """The split moved ~56 endpoints out of one function; the inventory keeps them honest.

        Additions are fine — deletions are not. A route that quietly stopped being dispatched is
        exactly the kind of thing a client notices in production and nobody notices in a diff.
        """
        required = {
            "/health", "/n",
            "/api/account", "/api/auth/challenge", "/api/auth/logout", "/api/telemetry/event",
            "/api/admin/stats", "/api/admin/accounts", "/api/admin/audit", "/api/admin/rooms",
            "/api/admin/billing/stats", "/api/admin/billing/transactions", "/api/admin/billing/grant",
            "/api/admin/ai/stats", "/api/admin/ai/logs", "/api/admin/ai/ping",
            "/api/admin/analytics/charts", "/api/admin/maintenance/cleanup",
            "/api/admin/maintenance/vacuum",
            "/api/notify/invite", "/api/notify/status", "/api/notify/arm",
            "/api/assistant/enable", "/api/assistant/pending", "/api/assistant/answer",
            "/api/assistant/applied",
            "/api/vaults",
            "/api/pair/create", "/api/pair/claim", "/api/pair/approve", "/api/pair/reject",
            "/api/pair/exchange", "/api/pair/poll",
            "/api/ai/chat",
        }
        found = set()
        prefixes = set()
        for path in RELAY.glob("routes_*.py"):
            text = path.read_text(encoding="utf-8")
            found.update(re.findall(r'path == "([^"]+)"', text))
            prefixes.update(re.findall(r'path\.startswith\("([^"]+)"\)', text))
        self.assertEqual(sorted(required - found), [], "these endpoints no longer have a handler")
        self.assertGreaterEqual(len(prefixes), 4, f"prefix routes vanished: {sorted(prefixes)}")

    def test_old_import_names_still_work(self):
        from server import (  # noqa: F401 — the facade is the point of the test
            SESSION_TTL_SECONDS, TG_TEXT_LIMIT, ApiError, RelayDatabase, SlagRelayServer,
            assistant_card_block, render_notification, tg_escape,
        )

        server = SlagRelayServer("127.0.0.1", 0, ":memory:")
        for handler in ("_route_health", "_route_admin", "_route_admin_ops", "_route_auth",
                        "_route_notify", "_route_vaults", "_route_ai", "_route_static"):
            self.assertTrue(callable(getattr(server, handler)), handler)
        self.assertTrue(issubclass(ApiError, Exception))


if __name__ == "__main__":
    unittest.main()
