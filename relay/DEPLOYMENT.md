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

## trusted reverse proxy — 2026-11-13

rate limits are keyed by the direct peer by default. behind nginx every client shares one peer and
one budget, so tell the relay which proxies may set `X-Forwarded-For`:

```ini
# systemd drop-in
Environment=SLAG_TRUSTED_PROXIES=127.0.0.1/32
```

or `--trusted-proxies 127.0.0.1/32` on the command line. the value is a comma-separated list of
IPs/CIDRs; an invalid value stops the relay at startup. nginx must **append** the real address,
never pass a client-supplied header through untouched:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

with that pair the relay walks the header right-to-left, skips trusted proxies and uses the first
untrusted hop for `auth/challenge`, `pair/create`, `telemetry` and failed `pair/claim` attempts.
requests from peers outside the list ignore `X-Forwarded-For` completely, so a direct client cannot
rotate its own bucket.

## session lifetime — 2026-11-10

`SESSION_TTL_SECONDS` is 3 days, and `RelayDatabase.authenticate_hash` slides `expires_at` a full
term forward whenever less than half of it is left. A device that keeps talking to the relay never
has to log in again; an idle one dies after 3 days. The previous uncommitted `last_seen_at` write
stays as it was; the renewal commits itself so it survives a restart.

deployed `/opt/slag-relay/server.py` (previous copy: `/opt/slag-relay/backups/server-20261110T1150.py`),
`systemctl restart slag-relay`, health 200, `NRestarts=0`. production smoke on a disposable account:
fresh session `expiresAt` = +72 h; a session forced down to 60 s slid back to +72 h on one
authenticated call and the value was visible from another sqlite connection; an expired session
still answered 401. account and device rows were removed in the same stop window. `relay/test_relay.py`
covers the same three cases (`test_session_slides_on_use`).

note: writes to the live database from outside need the service stopped — the relay keeps one shared
sqlite connection with an open write transaction, so an external writer just waits on the lock.

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
| `GROQ_API_KEY` | — | media key. absent → `503` on both media endpoints |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | Groq base |
| `SLAG_VISION_MODEL` | `qwen/qwen3.8-27b` | image OCR/description |
| `SLAG_WHISPER_MODEL` | `whisper-large-v3-turbo` | audio transcription |

gate behaviour: no token → `401`, free plan → `403 subscription_required`, non-allowlisted model →
`400 model_not_allowed`, KIE error body (`HTTP 200` + `{"code":...}`) → mapped `429`/`402`/`502`,
short/odd bodies → `502 upstream_invalid_response`. successful calls write `ai_usage_logs`
(tokens + latency, never content) and show up in `/api/admin/ai/stats` and `/api/admin/ai/logs`.
`POST /api/admin/ai/ping` performs a real one-word upstream call.

media (subscription covers images and audio, no client key needed):

- `POST /api/ai/vision` — `{dataUrl, prompt}` → Groq chat-completions with the image, returns
  `{extractedText, summary}`.
- `POST /api/ai/audio` — `{dataUrl, fileName, prompt}` → base64 decoded and posted as multipart to
  Groq Whisper, returns `{extractedText, summary}`. Bodies over 12 MB after decoding → `413`.
- bad media is Groq's `400/413/422` and is surfaced as `400 upstream_rejected` with the message.

note: unlike the e2e-encrypted sync path, the relay operator can see attachments that pass through
these two endpoints. that is the deliberate trade-off of moving media off the client.

acceptance probe (creates a disposable account, sets `plan=smile`, blocks it at the end):

```sh
SLAG_ADMIN_TOKEN=<admin token> python relay/ai_smoke.py --server http://152.53.199.71:8320
```

check live state without printing environment secrets:

```sh
systemctl show slag-relay -p ActiveState -p SubState -p ExecMainStatus -p NRestarts
curl --fail http://127.0.0.1:8320/health
```

## telegram notifications — 2026-11-13

reminders leave the vault through the relay: the client arms a job, the relay calls the Bot
API at `fire_at`. two rules shape the whole thing.

**one poller per token.** `getUpdates` and a webhook are mutually exclusive and a second
poller gets `409 Conflict`; a stuck webhook keeps returning 409 even after it is deleted.
so: one token lives on one process. a dev relay runs **without** `SLAG_TG_BOT_TOKEN`
(jobs queue up, nothing is sent) and delivery is verified on the server only. check the
token is not shadowed by a webhook before starting:
`curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo"` must show an empty `url`.

**a chat id never reaches `relay.db`.** routes live in a second file next to it:

| file | holds | must never hold |
| --- | --- | --- |
| `relay.db` | vaults, accounts, `notify_jobs`, `notify_invites` | any `chat_id` |
| `notify_routes.db` | `route_token → chat_id` | vault, account, device ids |

`notify_invites` is the only row that touches both sides, it expires in 10 minutes and is
deleted an hour after that. comment out nothing, join nothing: both files are opened by the
same process, so a future change that "just adds a column" is what breaks the property.

env (systemd drop-in, `chmod 600`):

| variable | default | meaning |
| --- | --- | --- |
| `SLAG_TG_BOT_TOKEN` | — | absent → no polling, no delivery, `/api/notify/invite` answers `503 notify_bot_not_configured` |
| `SLAG_NOTIFY_PEPPER` | — | secret that scopes a route token to one vault. absent → `/api/notify/invite` answers `503`. `openssl rand -hex 32` |

a route token is a capability, so it is scoped: redemption stores `HMAC(pepper, vault_id)` next to
the chat id, and `arm` only accepts a token whose fingerprint matches the calling vault. without
the pepper any paying account holding a token could post into that person's Telegram, and the
`vault_tag` column would be empty forever. rotating the pepper unlinks every route (they fall back
to `not_linked` and people re-bind with a fresh code) — that is the intended kill switch.

gate behaviour: `POST /api/notify/invite` and `POST /api/notify/arm` need a paid plan
(`smile`/`angry`) or they answer `402 notifications_plan_required`, and a read-write grant, so a
receive-only device cannot queue messages for the vault; a token that was never linked through
`/start` **or belongs to another vault** comes back in `dropped` with `not_linked` — the same
answer on purpose, so the endpoint cannot be used to probe which channels exist. a blocked one
comes back with `blocked`. **one live code per vault**: `POST /api/notify/invite` deletes the
vault's unredeemed invites before inserting, so asking again revokes the previous code instead
of stacking a second valid door. `GET /api/notify/status?vaultId=…&routeToken=…` answers
`pending | active | blocked` for the app's invite dialog — unknown, never-linked and someone
else's all read `pending`, the same uniform answer as `arm`, so this endpoint is no oracle
either. more than 500 queued jobs per vault or 1000 per account → `429 notify_queue_full`, more
than 60 arm calls per minute per account or 10 invites → `429 too_many_requests`. `fireAt` must
land in `[now - 5 min, now + 400 days]`, otherwise `400`: a job that fires in 2100 is a queue
squat.

delivery behaviour: a job older than an hour is closed unsent (a laptop waking up after a
week must not dump a backlog), `429` is obeyed via `retry_after`, `403` blocks the route for
good, one route gets at most 30 messages per hour regardless of who armed them, and a failed
send gets exactly one retry.

### what a reminder looks like

the relay renders the message, so a note title can never smuggle markup into someone's chat:

```html
<b>сдать отчёт</b>
<blockquote expandable>дописать раздел про релей</blockquote>
срок <code>13 нояб., 14:30</code>
```

```html
⚠️ <b>сдать отчёт</b>
<blockquote>дописать раздел про релей</blockquote>
срок был <code>12 нояб., 18:00</code>
```

`arm` carries the parts, not the markup: `kind` (`task`/`overdue`, picks the header and the
label), `stamp` (the deadline in the sender's words, ≤40 chars, empty when the item has no due
date), `spoiler` (wraps the body in `<span class="tg-spoiler">`), `tz` (minutes east of UTC).
the text itself is escaped on the way out: `&` first, then `<` and `>`. the body is the only
unbounded part and escaping can grow it fivefold, so it is cut by a binary search on the raw
text until the escaped message fits 3800 characters (Bot API allows 4096 after parsing).
`parse_mode` is `HTML`, never `MarkdownV2`: three characters to escape instead of eighteen, and
one missed escape would be a `400` on a message a human was waiting for. if Telegram refuses
the markup anyway, the same text goes out unformatted and the refusal is logged — a reminder is
more valuable than its formatting.

timezones: every wall-clock decision stays on the device (when to fire, quiet hours, the 10:00
overdue ping) and the relay stores only epoch seconds. the dedup key is a local wall clock, not
the UTC instant, so two devices in different zones count one reminder as one job; the moment
belongs to whichever device armed it first, and an arm from another zone refreshes nothing
(`ON CONFLICT ... WHERE notify_jobs.tz = excluded.tz`). the deadline in the message is therefore
the deadline of the device that armed it — the relay never learns the recipient's zone, and
neither does anyone else.

### asking the assistant from telegram

the relay has no model. a plain message to the bot is forwarded to whatever device has the
vault open, and the answer comes back the same way:

```
POST /api/assistant/enable  {vaultId, routeToken, enabled}   # opt-in per channel
bot: "что по задачам?"        → assistant_requests row → broadcast {type:"assistant_question"}
device: POST /api/assistant/answer {vaultId, requestId, answer} → relay → sendMessage
```

both endpoints need a paid plan and a read-write grant; `enable` also requires the route token
to belong to that vault (same `vault_tag` check as `arm`). a question lives 120 seconds: if no
device answers by then, the bot says so instead of inventing an answer. `assistant_links` is
the only table that ties a route back to a vault, and only for people who switched the feature
on — everything else stays one-way.

this is the seam, not the feature: today the device answers from its own state (counts and the
next reminder), and the full assistant plugs into `buildAssistantAnswer` in `src/lib/notify.ts`.
nothing else has to move when it does — the relay only carries the text both ways.

acceptance probe, in this order:

```sh
curl -s "https://api.telegram.org/bot$SLAG_TG_BOT_TOKEN/getMe"        # must answer ok:true
systemctl restart slag-relay && journalctl -u slag-relay -n 40 --no-pager
# then, from a telegram account: send /start <code from Settings → notifications>
sqlite3 /opt/slag-relay/data/notify_routes.db "select chat_id, blocked_at from notify_routes"
sqlite3 /opt/slag-relay/data/relay.db "select count(*) from notify_jobs where sent_at is null"
```

the last line is the privacy check nobody should skip: the relay database knows how many
reminders are queued, not who they are for.
