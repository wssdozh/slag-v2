"""DDL и аддитивные миграции: одна схема, один файл.

Схема читается рядом, а не по кускам: `CREATE TABLE IF NOT EXISTS` плюс `ensure_column`
на каждый столбец, который появился позже. Ничего не удаляется — только добавляется.
"""

import sqlite3


def ensure_column(conn: sqlite3.Connection, table: str, column: str, declaration: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def apply_schema(conn: sqlite3.Connection) -> None:
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS rooms (
                room_id TEXT PRIMARY KEY,
                created_at REAL NOT NULL,
                last_active_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bundles (
                bundle_id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                from_device_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_bundles_room ON bundles(room_id, created_at);
            CREATE TABLE IF NOT EXISTS bundle_acks (
                bundle_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                acked_at REAL NOT NULL,
                PRIMARY KEY(bundle_id, device_id)
            );
            CREATE TABLE IF NOT EXISTS pairing_sessions (
                pin TEXT PRIMARY KEY,
                session_id TEXT NOT NULL UNIQUE,
                host_device_id TEXT NOT NULL,
                host_public_key TEXT NOT NULL,
                host_nonce TEXT NOT NULL,
                guest_ephemeral_pk TEXT,
                sas_code TEXT,
                status TEXT NOT NULL DEFAULT 'pending_guest',
                exchange_payload TEXT,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS accounts (
                account_id TEXT PRIMARY KEY,
                public_key TEXT NOT NULL UNIQUE,
                plan TEXT NOT NULL DEFAULT 'free',
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                name TEXT NOT NULL,
                platform TEXT NOT NULL,
                public_key TEXT NOT NULL,
                status TEXT NOT NULL,
                paired_at REAL NOT NULL,
                last_seen_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id, status);
            CREATE TABLE IF NOT EXISTS auth_challenges (
                challenge TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_challenges_account ON auth_challenges(account_id);
            CREATE TABLE IF NOT EXISTS pending_auth_requests (
                id TEXT PRIMARY KEY,
                secret_hash TEXT NOT NULL,
                account_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                public_key TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                completed_at REAL
            );
            CREATE INDEX IF NOT EXISTS idx_pending_auth_expiry ON pending_auth_requests(expires_at);
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_device ON auth_sessions(account_id, device_id);
            CREATE TABLE IF NOT EXISTS vaults (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner_account_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vaults_owner ON vaults(owner_account_id);
            CREATE TABLE IF NOT EXISTS vault_grants (
                vault_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                encrypted_key TEXT,
                updated_at REAL NOT NULL,
                PRIMARY KEY(vault_id, device_id)
            );
            CREATE INDEX IF NOT EXISTS idx_grants_device ON vault_grants(device_id, status);
        """)
        ensure_column(conn, "rooms", "vault_id", "TEXT")
        ensure_column(conn, "rooms", "retired", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "bundles", "sync_id", "INTEGER")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_bundles_room_sync ON bundles(room_id, sync_id)")
        conn.execute("""CREATE TABLE IF NOT EXISTS device_cursors (
            device_id TEXT NOT NULL,
            room_id TEXT NOT NULL,
            last_sync_id INTEGER NOT NULL DEFAULT 0,
            updated_at REAL NOT NULL,
            PRIMARY KEY(device_id, room_id)
        )""")
        # ponytail: durable ID tombstones prevent post-expiry replay; compact only with a protocol replay horizon.
        conn.execute("""CREATE TABLE IF NOT EXISTS bundle_receipts (
            bundle_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, created_at REAL NOT NULL)""")
        conn.execute("INSERT OR IGNORE INTO bundle_receipts SELECT bundle_id, room_id, created_at FROM bundles")
        ensure_column(conn, "pairing_sessions", "host_account_id", "TEXT")
        ensure_column(conn, "pairing_sessions", "host_token_hash", "TEXT")
        ensure_column(conn, "pairing_sessions", "guest_device_id", "TEXT")
        ensure_column(conn, "pairing_sessions", "guest_account_id", "TEXT")
        conn.execute("""CREATE TABLE IF NOT EXISTS billing_transactions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            plan TEXT NOT NULL,
            period_days INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at REAL NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS ai_usage_logs (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL,
            completion_tokens INTEGER NOT NULL,
            latency_ms REAL NOT NULL,
            created_at REAL NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at REAL NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS telemetry_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            platform TEXT NOT NULL DEFAULT 'unknown',
            metadata TEXT,
            created_at REAL NOT NULL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_type_time ON telemetry_events(event_type, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at)")
        ensure_column(conn, "accounts", "status", "TEXT NOT NULL DEFAULT 'active'")
        ensure_column(conn, "accounts", "expires_at", "REAL")
        # One row per (recipient, event): the pair is the dedup key, so two devices that
        # arm the same reminder cannot produce two messages.
        conn.execute("""CREATE TABLE IF NOT EXISTS notify_jobs (
            route_token TEXT NOT NULL,
            event_key TEXT NOT NULL,
            item_key TEXT NOT NULL,
            vault_id TEXT NOT NULL,
            fire_at REAL NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            claimed_at REAL,
            sent_at REAL,
            attempts INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (route_token, event_key)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_due ON notify_jobs(fire_at) WHERE sent_at IS NULL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_item ON notify_jobs(vault_id, item_key)")
        # Presentation travels with the job: the relay renders the message, so it needs the
        # event kind, the deadline in the recipient's own words, and the sender's offset.
        ensure_column(conn, "notify_jobs", "kind", "TEXT NOT NULL DEFAULT 'task'")
        ensure_column(conn, "notify_jobs", "stamp", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "notify_jobs", "spoiler", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "notify_jobs", "tz", "INTEGER NOT NULL DEFAULT 0")
        # The only place a vault id ever meets a chat id. Row dies an hour after it expires.
        conn.execute("""CREATE TABLE IF NOT EXISTS notify_invites (
            code TEXT PRIMARY KEY,
            route_token TEXT NOT NULL UNIQUE,
            vault_id TEXT NOT NULL,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            redeemed_at REAL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_invites_vault ON notify_invites(vault_id)")
        # The assistant channel: an opted-in route can carry a question to a device and an
        # answer back. This is the only table that ties a route to a vault, and only for
        # people who switched the feature on.
        conn.execute("""CREATE TABLE IF NOT EXISTS assistant_links (
            route_token TEXT PRIMARY KEY,
            vault_id TEXT NOT NULL,
            enabled_at REAL NOT NULL,
            mode TEXT NOT NULL DEFAULT 'minimal'
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_assistant_links_vault ON assistant_links(vault_id)")
        # `mode` is what the person chose: `minimal` answers only about tasks, `risky` lets the
        # device's assistant read the vault. The relay passes it through and never decides.
        ensure_column(conn, "assistant_links", "mode", "TEXT NOT NULL DEFAULT 'minimal'")
        # The placeholder is the whole user-visible state of a question: it is sent once and
        # rewritten in place, so `placeholder_message_id` has to survive a restart. `chat_id`
        # is deliberately NOT here: it lives only in `notify_routes.db`, and putting it next
        # to `vault_id` would rebuild the one link this design exists to avoid.
        conn.execute("""CREATE TABLE IF NOT EXISTS assistant_requests (
            id TEXT PRIMARY KEY,
            vault_id TEXT NOT NULL,
            route_token TEXT NOT NULL,
            question TEXT NOT NULL,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            answered_at REAL,
            question_message_id INTEGER,
            placeholder_message_id INTEGER,
            mode TEXT NOT NULL DEFAULT 'minimal',
            attempts INTEGER NOT NULL DEFAULT 1
        )""")
        ensure_column(conn, "assistant_requests", "question_message_id", "INTEGER")
        ensure_column(conn, "assistant_requests", "placeholder_message_id", "INTEGER")
        ensure_column(conn, "assistant_requests", "mode", "TEXT NOT NULL DEFAULT 'minimal'")
        ensure_column(conn, "assistant_requests", "attempts", "INTEGER NOT NULL DEFAULT 1")
        # The action an answer offered and the text it was written with. The answer text has
        # to outlive the delivery: `/applied` appends the outcome to the very message, and a
        # message cannot be rebuilt from a text that was only ever sent to Telegram.
        ensure_column(conn, "assistant_requests", "action_json", "TEXT")
        ensure_column(conn, "assistant_requests", "action_label", "TEXT")
        ensure_column(conn, "assistant_requests", "answer_text", "TEXT")
        ensure_column(conn, "assistant_requests", "applied_at", "REAL")
        # Which device wrote the answer: it is the only one asked to apply the action, so one
        # tap cannot become one note per machine that happens to be online.
        ensure_column(conn, "assistant_requests", "answered_by", "TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_assistant_pending ON assistant_requests(expires_at) WHERE answered_at IS NULL")
        # Delivery telemetry without content: an outcome, a duration and a salted route tag are
        # enough to answer "why was it slow" — the question itself never lands here.
        conn.execute("""CREATE TABLE IF NOT EXISTS delivery_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at REAL NOT NULL,
            kind TEXT NOT NULL,
            route_tag TEXT,
            request_id TEXT,
            outcome TEXT,
            device_count INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER,
            error_code TEXT
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_delivery_events_at ON delivery_events(at)")
