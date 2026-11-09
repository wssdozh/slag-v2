# relay deployment — 2026-11-02

## deployed baseline

- ssh target: `netcup-server` (`152.53.199.71`).
- service: `slag-relay.service`; unit: `/etc/systemd/system/slag-relay.service`.
- code: `/opt/slag-relay/server.py`; dependencies: `/opt/slag-relay/requirements.txt`.
- runtime: `/opt/slag-relay/.venv/bin/python` (python 3.13.5, cryptography 50.0.2).
- database: `/opt/slag-relay/data/relay.db`.
- listener: `0.0.0.0:8320`; health: `http://152.53.199.71:8320/health`.
- initial deployment health: http 200, `status=ok`, `version=0.2.0`, `authRequired=false`; systemd `active/running`, `ExecMainStatus=0`, `NRestarts=0`.
- final public state, independently verified after the parent's separately authorized policy change: http 200, `status=ok`, `version=0.2.0`, `authRequired=true`; systemd `active/running`, `ExecMainStatus=0`, `NRestarts=0`. anonymous `/api/pair/create` and a new unique room's `/bundles` request both returned 401.
- the user explicitly chose temporary public http account testing because there are no clients yet. the parent enabled auth through `/etc/systemd/system/slag-relay.service.d/zz-account-auth.conf` containing `[Service]` and `Environment=SLAG_REQUIRE_ACCOUNT_AUTH=true`. the base unit and local template keep the safer `false` default; the override determines live state.
- the parent removed the earlier malformed `/etc/systemd/system/slag-relay.service.d/account-auth.conf` after verifying its exact path and contents. systemd was reloaded and the valid `zz-account-auth.conf` still reports `SLAG_REQUIRE_ACCOUNT_AUTH=true`.
- no separate acceptance service or ssh tunnel was started: parent cancelled that part before creation.

## backups and verification

backup directory: `/opt/slag-relay/backups/account-deploy-20261102T193709Z`, permission `0700`.

contents: `server.py`, `slag-relay.service`, `relay.db` (sqlite backup before deployment), `relay-at-cutover.db` (sqlite backup with the service stopped immediately before migration), `counts-before.json`, `counts-at-cutover.json`.

legacy row counts immediately before and after additive migration were identical:

| table | before | after migration | after smoke |
| --- | ---: | ---: | ---: |
| rooms | 419 | 419 | 420 |
| bundles | 510 | 510 | 511 |
| bundle_acks | 0 | 0 | 1 |
| pairing_sessions | 0 | 0 | 0 |

all 21 relay tests passed on the server's venv using isolated temporary databases. the production legacy smoke posted, fetched and acknowledged one synthetic empty-change bundle in the new unique room `deployment-smoke-df46331218a8432aa01b036bd6696867`; subsequent fetch was empty. no existing room was exercised or deleted. the synthetic row remains subject to normal expiry. no database contents, user seeds or credentials were printed.

system preparation installed `python3.13-venv`, `python3-pip-whl` and `python3-setuptools-whl`; the application dependencies are isolated in the venv. staging directory: `/tmp/slag-relay-deploy-20261102T193709Z` (code, unit and tests only).

## rollback without losing post-deployment writes

run on `netcup-server` as root. restore only code and unit first: the migration was additive, so the old relay can use the expanded database. do not overwrite the live database with an old snapshot. the rollback below also removes the parent's separately authorized auth override; verify both exact override paths before removing them, and do not remove any other drop-ins.

```sh
set -eu
backup=/opt/slag-relay/backups/account-deploy-20261102T193709Z
systemctl stop slag-relay
python3 - <<'PY'
import sqlite3
source = sqlite3.connect('/opt/slag-relay/data/relay.db')
target = sqlite3.connect('/opt/slag-relay/backups/account-deploy-20261102T193709Z/relay-before-rollback.db')
source.backup(target)
target.close()
source.close()
PY
cp -- "$backup/server.py" /opt/slag-relay/server.py
cp -- "$backup/slag-relay.service" /etc/systemd/system/slag-relay.service
# verify these exact paths belong to this deployment before removing them:
ls -l -- /etc/systemd/system/slag-relay.service.d/
rm -f -- /etc/systemd/system/slag-relay.service.d/zz-account-auth.conf /etc/systemd/system/slag-relay.service.d/account-auth.conf
systemctl daemon-reload
systemctl start slag-relay
systemctl is-active slag-relay
curl --fail http://127.0.0.1:8320/health
```

the previous relay may not expose `authRequired` in health. retaining the expanded database preserves both original bundles and writes after deployment. full snapshot restoration is disaster recovery only: first preserve the current database through sqlite backup, and obtain explicit approval because replacing it would discard intervening writes. do not remove sqlite wal/shm files or copy a running sqlite database with plain `cp`.

## temporary http and tls cutover

public http provides **no transport confidentiality**: account bearer tokens, challenges, device identifiers and requests can be observed or modified in transit. end-to-end bundle encryption does not protect bearer sessions. any separately authorized temporary http testing must use disposable test identities/data only; do not send real seeds, production credentials or user vaults. client opt-in is not tls and is not a security boundary.

before release:

1. configure a domain with valid, automatically renewed tls and a reverse proxy supporting websocket upgrades; expose `https://` and `wss://` only.
2. bind the relay backend to loopback and/or restrict port 8320 at the firewall so direct public http cannot bypass tls. update the service's `--host` accordingly.
3. verify certificate validation and websocket upgrade from an external client, then update client relay urls to the tls endpoint.
4. take fresh code/unit/sqlite backups, set `Environment=SLAG_REQUIRE_ACCOUNT_AUTH=true`, reload systemd and restart the relay.
5. verify `/health` reports `authRequired=true`; anonymous pair creation and room access must return 401, while account login, approved-device access and authenticated websocket sync pass.
6. invalidate disposable http-era sessions and rotate test credentials; never reuse tokens exposed during http testing.

## ai gateway — 2026-11-09

the subscription AI path is served by the relay at `POST /api/ai/chat`, which proxies
`{KIE_BASE_URL}/openai/v1/responses` with the master key. KIE does **not** serve chat models on
`/v1/chat/completions` (every model there answers `422 model not supported`), so the Responses
protocol is the only working route.

required env (systemd drop-in, `chmod 600`):

| variable | default | meaning |
| --- | --- | --- |
| `KIE_API_KEY` | — | master key. absent → `503 upstream_not_configured`, never a fake answer |
| `KIE_BASE_URL` | `https://api.kie.ai` | upstream base |
| `SLAG_AI_MODEL` | `deepseek-v4-1-flash` | the only model the gateway allows; everything else → `400` |
| `SLAG_AI_DAILY_LIMIT` | `500` | per-account requests per 24 h → `429` |
| `SLAG_AI_TIMEOUT_SECONDS` | `60` | upstream timeout; the call runs in `asyncio.to_thread` |

gate behaviour: no token → `401`, free plan → `403 subscription_required`, non-allowlisted model →
`400 model_not_allowed`, KIE error body (`HTTP 200` + `{"code":...}`) → mapped `429`/`402`/`502`,
short/odd bodies → `502 upstream_invalid_response`. successful calls write `ai_usage_logs`
(tokens + latency, never content) and show up in `/api/admin/ai/stats` and `/api/admin/ai/logs`.
`POST /api/admin/ai/ping` performs a real one-word upstream call.

acceptance probe (creates a disposable account, sets `plan=smile`, blocks it at the end):

```sh
SLAG_ADMIN_TOKEN=<admin token> python relay/ai_smoke.py --server http://152.53.199.71:8320
```

check live state without printing environment secrets:

```sh
systemctl show slag-relay -p ActiveState -p SubState -p ExecMainStatus -p NRestarts
curl --fail http://127.0.0.1:8320/health
```
