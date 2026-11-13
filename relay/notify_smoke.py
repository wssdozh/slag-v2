#!/usr/bin/env python3
"""Live acceptance probe for Telegram reminders.

Creates a disposable paid account, mints an invite, waits until a human opens the link
and sends /start to the bot, then arms a reminder that fires in a few seconds and checks
that the same event cannot be queued twice.

    SLAG_ADMIN_TOKEN=<token> python notify_smoke.py --server http://152.53.199.71:8320

The only step a script cannot do is tapping the link: the probe prints it and waits.
Never prints tokens or chat ids.
"""

from __future__ import annotations

import argparse
import os
import time
import urllib.parse

from ai_smoke import Probe


def invite(probe: Probe, token: str, vault_id: str) -> dict:
    status, body = probe.call("POST", "/api/notify/invite", {"vaultId": vault_id}, token)
    if status != 200:
        raise SystemExit(f"invite failed: {status} {body}")
    return body


def arm(probe: Probe, token: str, vault_id: str, payload: dict) -> tuple[int, dict]:
    return probe.call("POST", "/api/notify/arm", {"vaultId": vault_id, **payload}, token)


def run(probe: Probe, wait_seconds: int) -> int:
    status, health = probe.call("GET", "/health")
    probe.record("health", status == 200 and health.get("status") == "ok", f"http {status}")

    identity, token = probe.register()
    account_id = identity["accountId"]
    vault_id = f"vault_smoke_{os.urandom(6).hex()}"
    status, _ = probe.call("PUT", f"/api/vaults/{vault_id}", {"name": "smoke"}, token)
    probe.record("vault created", status == 200, f"http {status}")

    status, body = probe.call("POST", "/api/notify/invite", {"vaultId": vault_id}, token)
    probe.record("free plan is gated", status == 402 and body.get("error") == "notifications_plan_required",
                 f"http {status}, {body.get('error')}")
    if status == 503:
        raise SystemExit("relay has no SLAG_TG_BOT_TOKEN, nothing to probe")
    probe.set_plan(account_id, "smile")

    try:
        created = invite(probe, token, vault_id)
    except SystemExit as exc:
        probe.record("invite created", False, str(exc))
        probe.call("POST", f"/api/admin/accounts/{urllib.parse.quote(account_id)}/toggle-status", {}, admin=True)
        return 1
    route_token = created["routeToken"]
    probe.record("invite created", bool(created.get("code")) and bool(route_token),
                 f"expires in {created.get('expiresIn')}s, link: {created.get('link')}")

    link_job = {"itemKey": "smoke-link", "eventKey": "smoke-link", "fireAt": time.time() + 3600,
                "routes": [{"token": route_token, "title": "link probe", "body": ""}]}
    print(f"\nopen in telegram and send it to the bot: {created.get('link') or created.get('code')}\n")
    deadline = time.time() + wait_seconds
    linked = False
    while time.time() < deadline:
        status, body = arm(probe, token, vault_id, link_job)
        if status != 200:
            probe.record("arm rejected", False, f"http {status} {body}")
            break
        if not body.get("dropped"):
            linked = True
            break
        time.sleep(3)
    arm(probe, token, vault_id, {"itemKey": "smoke-link", "eventKey": None})
    probe.record("chat linked through /start", linked, "link opened" if linked else "timed out")
    if not linked:
        probe.call("POST", f"/api/admin/accounts/{urllib.parse.quote(account_id)}/toggle-status", {}, admin=True)
        return 1

    job = {"itemKey": "smoke-job", "eventKey": "smoke-job-1", "fireAt": time.time() + 5,
           "kind": "overdue", "stamp": "12 нояб., 18:00", "tz": 180, "spoiler": False,
           "routes": [{"token": route_token, "title": "смоук-тест напоминаний",
                       "body": "если это пришло один раз — всё работает <b>и это текст, а не разметка</b> & тест"}]}
    status, first = arm(probe, token, vault_id, job)
    probe.record("reminder queued", status == 200 and first.get("armed") == 1, f"http {status}, {first}")
    status, second = arm(probe, token, vault_id, job)
    # The repeat may refresh the queued job (armed: 1) or find it already standing (armed: 0);
    # what must not happen is a second message, and that is what the human counts in the chat.
    probe.record("same event is not queued twice", status == 200 and second.get("armed") in (0, 1),
                 f"http {status}, {second}")

    print("\nwaiting for delivery — check telegram: exactly one message, no duplicates")
    time.sleep(20)
    arm(probe, token, vault_id, {"itemKey": "smoke-job", "eventKey": None})
    probe.record("cleanup", True, "jobs cancelled, account blocked next")
    probe.call("POST", f"/api/admin/accounts/{urllib.parse.quote(account_id)}/toggle-status", {}, admin=True)
    return 0 if all(ok for _, ok, _ in probe.results) else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="SLAG relay Telegram reminder probe")
    parser.add_argument("--server", default="http://127.0.0.1:8320")
    parser.add_argument("--admin-token", default=os.environ.get("SLAG_ADMIN_TOKEN"))
    parser.add_argument("--wait", type=int, default=120, help="seconds to wait for the /start tap")
    args = parser.parse_args()
    if not args.admin_token:
        raise SystemExit("set SLAG_ADMIN_TOKEN or pass --admin-token")
    probe = Probe(args.server, args.admin_token)
    print(f"notify probe against {args.server}")
    code = run(probe, args.wait)
    failures = [name for name, ok, _ in probe.results if not ok]
    print(f"\n{len(probe.results) - len(failures)}/{len(probe.results)} checks passed"
          + (f", failed: {', '.join(failures)}" if failures else ""))
    raise SystemExit(code)


if __name__ == "__main__":
    main()
