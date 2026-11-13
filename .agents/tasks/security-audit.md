# security-audit — проверка по пяти наборам SecLists

- **цель**: подтвердить или снять находки по fuzzing/patterns/passwords/usernames/payloads; закрыть critical/high в клиенте, relay, MCP и Tauri; оставить отчёт с residual risk.
- **трогаем**:
  - `src/components/UI/MarkdownRenderer.tsx` — allowlist URL-схем.
  - `src/lib/vault/safePath.ts` (новый), `src/mcp/vault.ts`, `src/lib/storage/index.ts`, `src/lib/storage/vaultTransfer.ts`, `src/lib/storage/vaultFiles.ts` — единая проверка относительных путей.
  - `src-tauri/src/lib.rs` — `resolve_open_target` + тесты.
  - `vite.config.ts` — dev open-folder без traversal, bind только localhost по умолчанию.
  - `relay/server.py` — static prefix check, bounded rate-limit для анонимных пишущих endpoint'ов, чистка `failed_claim_attempts`.
  - `relay/test_security.py` (новый), `e2e/security_hardening.spec.ts` (новый), `e2e/mcp_server.spec.ts`.
  - `docs/security-audit.md` (новый).
- **не трогаем**:
  - продакшн-relay, официальный домен, чужие аккаунты, реальные ключи/seed;
  - архитектуру хранения seed (keychain/stronghold) — только фиксируем в отчёте как отдельную задачу;
  - существующие modified-скриншоты в `docs/screenshots/` (не наши);
  - зависимости и форматирование несвязанных файлов.
- **готово когда**:
  - `python -m unittest test_relay test_security` (из `relay/`) зелёный;
  - `npx playwright test e2e/security_hardening.spec.ts e2e/mcp_server.spec.ts --workers=1` зелёный;
  - `cargo test --manifest-path src-tauri/Cargo.toml` зелёный;
  - `npm run check` и `npm run build` проходят;
  - `docs/security-audit.md` содержит severity, evidence, статус и residual risk.
- **уже выяснили**:
  - `urlTransform={(url) => url}` в `MarkdownRenderer` пропускает `javascript:` — stored XSS.
  - `open_in_folder` и MCP `save_note`/`create_folder` склеивают путь без проверки `..`.
  - backup import не валидирует `folder` до записи на диск.
  - seed и private key устройства лежат в `localStorage` открытым текстом; фикс — отдельная задача.
  - relay использует параметризованный SQL, `compare_digest` для admin-токена и лимит 5 попыток на pairing claim; это проверяем тестами, а не переписываем.

---

после работы:

- `urlTransform` был в двух ветках `MarkdownRenderer` (inline и обычная); заменил обе,
  иначе карточка ленты продолжала пропускать `javascript:`.
- `safeVaultRelativePath` пришлось расширить на хвостовые точку/пробел до trim:
  `'a '` иначе нормализовался в безопасный `a`, а windows-имена с хвостовым
  пробелом — это как раз то, что нужно отсекать.
- `getSafeNoteFilename` чинит reserved-имена и с расширением (`CON.txt`), а не только `CON`.
- frontmatter заметки — тоже вход: `folder`/`id` из yaml теперь валидируются в
  `parseMarkdownToItem`, иначе подсунутый `.md` уводил следующую запись за vault.
- `npm run build:android` не поднялся: нет java/android sdk в окружении. это не код.
- full playwright: 335 passed, 2 failed, 8 skipped; `motion` проходит на повторе,
  `ai_settings_source_mode` падает на `page.goto` по таймауту 60с (cold vite),
  не на нашей логике. в отчёте помечено как environment/pre-existing.

