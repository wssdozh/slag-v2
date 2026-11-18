/**
 * The one-off move off the webview profile.
 *
 * An older build kept the interface settings and the vault's own drafts, assistant chat, memory,
 * workspace and sync config in `localStorage` — which on native is a LevelDB directory inside the
 * webview profile. The build that reads `settings.json` and `vaults/<id>/state.json` opens on empty
 * files: the settings would fall back to their defaults, the unsaved text would be gone and so
 * would the whole assistant memory. So `boot()` calls this once, before the first reader takes its
 * snapshot, and every key of the old profile is copied to the address it belongs to.
 *
 * The profile is never cleared: those are the person's data, the app no longer reads them, and
 * leaving them costs nothing while an address can still turn out to be wrong.
 *
 * Nothing here runs on the web — there the profile *is* the store.
 */
import { DEFAULT_VAULT_META, DEFAULT_WORKSPACE_STATE, STORAGE_KEYS } from '../../config/storage.ts';
import { SYNC_STORAGE_KEYS } from '../../config/sync.ts';
import type { VaultMeta } from '../../types';
import {
  STATE_SECTIONS,
  chatFromSection,
  chatMessagesFrom,
  chatToSection,
  composerDraftsFrom,
  draftsFromSection,
  draftsToSection,
  fullscreenDraftsFrom,
  memoryFrom,
  memoryFromSection,
  memoryToSection,
  mergeChatMessages,
  mergeComposerDrafts,
  mergeFullscreenDrafts,
  mergeMemory,
  mergeWorkspaceState,
  workspaceFromState,
  type ComposerDraftMap,
  type FullscreenDraftMap,
} from './stateSections.ts';

// ---------------------------------------------------------------------------------------------
// Where a legacy key goes
// ---------------------------------------------------------------------------------------------

export type LegacyVaultSection = 'workspace' | 'drafts' | 'chat' | 'memory' | 'sync';

export interface LegacyVaultKey {
  key: string;
  vaultId: string;
  section: LegacyVaultSection;
}

export interface LegacyKeySplit {
  /** Machine settings and everything unaccounted for: `settings.json` is a safe home for both. */
  prefs: string[];
  /** Keys that belong to one vault, with the section they feed. */
  vault: LegacyVaultKey[];
  /** Rebuilt from the disk on start, or already owned by the secret store. */
  drop: string[];
}

const DEFAULT_VAULT_ID = 'default_vault';
/** Every sync ledger, and the sync config itself, share this prefix. */
const SYNC_KEY_PREFIX = 'slag_sync_';
/**
 * The secret store's ciphertext. Spelled out because `encryptedLocalStore.ts` imports the logger,
 * and `scripts/legacy-profile.test.mjs` reads this module as it is.
 */
const ENCRYPTED_SECRET_PREFIX = 'slag_secure_v1:';

/** A vault id as the app mints it, at the start of what follows the key's own prefix. */
const VAULT_ID_AT_START = /^(default_vault|vault_[0-9a-zA-Z-]+)(?=_|$)/;
/** The same id somewhere in the middle: sync keys carry a ledger name before it. */
const VAULT_ID_IN_REST = /(?:^|_)(default_vault|vault_[0-9a-zA-Z-]+)(?=_|$)/;

const DROP_PREFIXES: readonly string[] = [
  STORAGE_KEYS.ITEMS_PREFIX,
  STORAGE_KEYS.FOLDERS_PREFIX,
  STORAGE_KEYS.ATTACHMENTS_PREFIX,
  STORAGE_KEYS.TRASH_PREFIX,
  SYNC_STORAGE_KEYS.DEVICE_KEY_PREFIX,
  ENCRYPTED_SECRET_PREFIX,
];
const DROP_KEYS: ReadonlySet<string> = new Set([SYNC_STORAGE_KEYS.ACCOUNT_SESSION]);

/**
 * The address book of the old profile: which key is the machine's, which is a vault's and which is
 * not worth carrying. Pure on purpose — no Tauri, no `localStorage`, no logger — so a `node --test`
 * file can hold it to these rules.
 */
export function splitLegacyKeys(keys: string[]): LegacyKeySplit {
  const split: LegacyKeySplit = { prefs: [], vault: [], drop: [] };
  for (const key of keys) {
    if (key === '') {
      // A nameless key has no address: nothing in the app wrote one, and `settings.json` must not
      // gain one either.
      split.drop.push(key);
      continue;
    }
    const vaultKey = vaultKeyFor(key);
    if (vaultKey) split.vault.push(vaultKey);
    else if (isDropped(key)) split.drop.push(key);
    else split.prefs.push(key);
  }
  return split;
}

function vaultKeyFor(key: string): LegacyVaultKey | null {
  if (key.startsWith(STORAGE_KEYS.WORKSPACE_STATE_PREFIX)) {
    return { key, section: 'workspace', vaultId: key.slice(STORAGE_KEYS.WORKSPACE_STATE_PREFIX.length) };
  }
  if (key.startsWith(STORAGE_KEYS.DRAFTS_PREFIX)) {
    return { key, section: 'drafts', vaultId: key.slice(STORAGE_KEYS.DRAFTS_PREFIX.length) };
  }
  if (key.startsWith(STORAGE_KEYS.ASSISTANT_PREFIX)) {
    return { key, section: 'chat', vaultId: key.slice(STORAGE_KEYS.ASSISTANT_PREFIX.length) };
  }
  if (key.startsWith(STORAGE_KEYS.MEMORY_PREFIX)) {
    return { key, section: 'memory', vaultId: key.slice(STORAGE_KEYS.MEMORY_PREFIX.length) };
  }
  if (key.startsWith(STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX)) {
    // One key per open note: `<vault>_<itemId>`, and the item id may itself carry underscores.
    const rest = key.slice(STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX.length);
    return { key, section: 'drafts', vaultId: VAULT_ID_AT_START.exec(rest)?.[1] ?? rest };
  }
  if (key.startsWith(SYNC_KEY_PREFIX)) {
    // `slag_sync_config_v2_<vault>`, `slag_sync_outbox_<vault>`, `slag_sync_cursor_<vault>_<room>`
    // and the bare names of the default vault. Only the vault matters here.
    const rest = key.slice(SYNC_KEY_PREFIX.length);
    return { key, section: 'sync', vaultId: VAULT_ID_IN_REST.exec(rest)?.[1] ?? DEFAULT_VAULT_ID };
  }
  return null;
}

function isDropped(key: string): boolean {
  if (DROP_KEYS.has(key)) return true;
  return DROP_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ---------------------------------------------------------------------------------------------
// The one-way import
// ---------------------------------------------------------------------------------------------

const LEGACY_MARKER_KEY = 'legacy_profile_imported';

/** The slice of `VaultFiles` this module needs, the same contract `settingsStore` writes through. */
interface StateSectionFiles {
  readStateSection(name: string): Promise<Record<string, unknown>>;
  writeStateSection(name: string, patch: Record<string, unknown>): Promise<void>;
}

/** The slice of `prefs` this module needs. */
interface PrefsAccess {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

type SectionBuilder = (
  files: StateSectionFiles,
  vaultId: string,
  entries: LegacyVaultKey[]
) => Promise<Record<string, unknown> | null>;

const SECTION_BUILDERS: Record<'workspace' | 'drafts' | 'chat' | 'memory', SectionBuilder> = {
  drafts: draftsPatch,
  chat: chatPatch,
  memory: memoryPatch,
  workspace: workspacePatch,
};

export async function importLegacyProfile(): Promise<void> {
  const { isTauri } = await import('@tauri-apps/api/core');
  if (!isTauri()) return;
  try {
    await moveProfile();
  } catch (err) {
    // A profile that cannot be read is not a reason to keep the window from opening: the marker is
    // unwritten, the next start tries again, and the profile itself is still where it was.
    fsWarn('The legacy profile was not imported, the next start tries again:', err);
  }
}

async function moveProfile(): Promise<void> {
  const { getPref, getPrefJson, setPref } = await import('./prefs.ts');
  // The marker is written last, after every section has been read back the way it was written: a
  // move that dies halfway leaves it unwritten, and the next start repeats the whole thing.
  if (getPref(LEGACY_MARKER_KEY) !== null) return;

  const keys = readProfileKeys();
  if (keys === null) return;
  const split = splitLegacyKeys(keys);
  const prefs: PrefsAccess = { get: getPref, set: setPref };

  // Settings first: the current vault is one of them, and everything below is keyed by it.
  copyPrefs(split.prefs, prefs);
  const saved = getPrefJson<{ id?: unknown }>(STORAGE_KEYS.CURRENT_VAULT, {});
  const vaultId = typeof saved.id === 'string' && saved.id !== '' ? saved.id : DEFAULT_VAULT_META.id;
  const own = split.vault.filter((entry) => entry.vaultId === vaultId);

  // Sync is the one section with a migrator of its own, and it reads exactly these keys out of
  // `prefs` before writing `state.json.sync`. Handing them over instead of writing the section here
  // keeps one writer for it.
  copyPrefs(own.filter((entry) => entry.section === 'sync').map((entry) => entry.key), prefs);

  const vault: VaultMeta = { ...DEFAULT_VAULT_META, id: vaultId };
  const files = await stateFilesFor(vault);
  const imported = await writeVaultSections(files, vaultId, own);
  if (!imported) {
    fsWarn('The legacy profile is only half moved into the files; the next start repeats it');
    return;
  }

  setPref(LEGACY_MARKER_KEY, new Date().toISOString());
  fsInfo(
    `Legacy profile imported for vault "${vaultId}": ${own.length} vault keys, ` +
      `${split.vault.length - own.length} keys of other vaults left in the profile, ` +
      `${split.drop.length} rebuildable ones skipped`
  );
}

/** Copies the keys the file does not already have; one write per key, no removals. */
function copyPrefs(keys: string[], prefs: PrefsAccess): void {
  for (const key of keys) {
    // The file is the newer copy: a key it already holds was written by this build, not by an
    // older one, and the profile must not go over it.
    if (prefs.get(key) !== null) continue;
    const raw = profileValue(key);
    if (raw === null) continue;
    prefs.set(key, withoutSeedPhrase(key, raw));
  }
}

/**
 * `VaultFiles` for the vault the profile names, alive only until the storage service exists.
 *
 * The service hydrates its settings snapshot inside its own constructor, so a section written after
 * `import('./lib/storage')` is read as empty first and then overwritten by that snapshot the same
 * session — the import has to land before the service is created. It still goes through the one
 * door, `VaultFiles`: same read-merge-write, same per-file queue. None of the callbacks below are
 * reached; the object is discarded before anything else runs.
 */
async function stateFilesFor(vault: VaultMeta): Promise<StateSectionFiles> {
  const [{ VaultFiles }, { AttachmentStore }] = await Promise.all([
    import('./vaultFiles.ts'),
    import('./attachments.ts'),
  ]);
  return new VaultFiles({
    getVault: () => vault,
    getItems: () => [],
    getWorkspaceState: () => DEFAULT_WORKSPACE_STATE,
    cacheItems: () => {},
    getItemsKey: () => '',
    getTrashKey: () => '',
    persistFolders: () => {},
    attachments: new AttachmentStore(() => ''),
  });
}

async function writeVaultSections(
  files: StateSectionFiles,
  vaultId: string,
  entries: LegacyVaultKey[]
): Promise<boolean> {
  const bySection = new Map<LegacyVaultSection, LegacyVaultKey[]>();
  for (const entry of entries) {
    const listed = bySection.get(entry.section);
    if (listed) listed.push(entry);
    else bySection.set(entry.section, [entry]);
  }

  for (const [section, sectionEntries] of bySection) {
    // `sync` already went to `prefs`, and its section has its own writer.
    if (section === 'sync') continue;
    const patch = await SECTION_BUILDERS[section](files, vaultId, sectionEntries);
    if (patch && !(await writeVerified(files, section, patch))) return false;
  }
  return true;
}

/**
 * `writeStateSection` logs a failed write and resolves, so reading the section back is the only
 * proof the file took the patch. A mismatch leaves the marker unwritten and the next start retries.
 */
async function writeVerified(
  files: StateSectionFiles,
  section: LegacyVaultSection,
  patch: Record<string, unknown>
): Promise<boolean> {
  await files.writeStateSection(section, patch);
  const written = await files.readStateSection(section);
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(written[key]) === JSON.stringify(value)) continue;
    fsWarn(`The "${section}" section did not take the legacy "${key}"; the next start retries`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// One builder per section: the file first, the old blob merged in, nothing else touched
// ---------------------------------------------------------------------------------------------

async function draftsPatch(
  files: StateSectionFiles,
  vaultId: string,
  entries: LegacyVaultKey[]
): Promise<Record<string, unknown> | null> {
  const fullscreenPrefix = `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${vaultId}_`;
  const fullscreen: FullscreenDraftMap = {};
  let composer: ComposerDraftMap = {};
  for (const entry of entries) {
    const raw = profileValue(entry.key);
    if (raw === null) continue;
    if (entry.key.startsWith(fullscreenPrefix)) {
      const itemId = entry.key.slice(fullscreenPrefix.length);
      Object.assign(fullscreen, fullscreenDraftsFrom({ [itemId]: parseProfileJson(raw) }));
      continue;
    }
    composer = mergeComposerDrafts(composer, composerDraftsFrom(parseProfileJson(raw)));
  }
  if (Object.keys(composer).length === 0 && Object.keys(fullscreen).length === 0) return null;
  const stored = draftsFromSection(await files.readStateSection(STATE_SECTIONS.drafts));
  return draftsToSection({
    composer: mergeComposerDrafts(stored.composer, composer),
    fullscreen: mergeFullscreenDrafts(stored.fullscreen, fullscreen),
  });
}

async function chatPatch(
  files: StateSectionFiles,
  _vaultId: string,
  entries: LegacyVaultKey[]
): Promise<Record<string, unknown> | null> {
  let legacy: ReturnType<typeof chatMessagesFrom> = [];
  for (const entry of entries) {
    const raw = profileValue(entry.key);
    if (raw === null) continue;
    legacy = mergeChatMessages(legacy, chatMessagesFrom(parseProfileJson(raw)));
  }
  if (legacy.length === 0) return null;
  const stored = chatFromSection(await files.readStateSection(STATE_SECTIONS.chat));
  return chatToSection({ messages: mergeChatMessages(stored.messages, legacy), telegram: stored.telegram });
}

async function memoryPatch(
  files: StateSectionFiles,
  _vaultId: string,
  entries: LegacyVaultKey[]
): Promise<Record<string, unknown> | null> {
  let legacy: ReturnType<typeof memoryFrom> = [];
  for (const entry of entries) {
    const raw = profileValue(entry.key);
    if (raw === null) continue;
    legacy = mergeMemory(legacy, memoryFrom(parseProfileJson(raw)));
  }
  if (legacy.length === 0) return null;
  const stored = memoryFromSection(await files.readStateSection(STATE_SECTIONS.memory));
  return memoryToSection(mergeMemory(stored, legacy));
}

async function workspacePatch(
  files: StateSectionFiles,
  _vaultId: string,
  entries: LegacyVaultKey[]
): Promise<Record<string, unknown> | null> {
  let legacy: ReturnType<typeof workspaceFromState> = {};
  for (const entry of entries) {
    const raw = profileValue(entry.key);
    if (raw === null) continue;
    legacy = mergeWorkspaceState(legacy, parseProfileJson(raw));
  }
  if (Object.keys(legacy).length === 0) return null;
  const stored = workspaceFromState(await files.readStateSection(STATE_SECTIONS.workspace));
  return { ...mergeWorkspaceState(stored, legacy) };
}

// ---------------------------------------------------------------------------------------------
// The profile itself
// ---------------------------------------------------------------------------------------------

/**
 * The webview profile, read once: a one-off migration of the profile, not a working path. Nothing
 * in the app reads or writes these keys any more, and nothing here deletes them — the person's data
 * stays where an older build left it.
 */
function readProfileKeys(): string[] | null {
  try {
    return Object.keys(localStorage);
  } catch (err) {
    fsWarn('The legacy profile could not be listed; nothing was imported', err);
    return null;
  }
}

/** The same allowance for one value: one-off migration of the profile, not a working path. */
function profileValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    fsWarn(`A legacy profile value could not be read: ${key}`, err);
    return null;
  }
}

function parseProfileJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    fsWarn('A legacy profile value is not JSON, it is skipped', err);
    return null;
  }
}

/**
 * The sync config kept the seed phrase in plain text until the secret store moved it out, and the
 * store runs before this module. `settings.json` is plaintext too, so a seed must not arrive there
 * even from a half-migrated profile.
 */
function withoutSeedPhrase(key: string, raw: string): string {
  const isConfig =
    key === SYNC_STORAGE_KEYS.SYNC_CONFIG || key.startsWith(`${SYNC_STORAGE_KEYS.SYNC_CONFIG}_`);
  if (!isConfig) return raw;
  const parsed = parseProfileJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return raw;
  if (!('seedPhrase' in parsed)) return raw;
  const record: Record<string, unknown> = { ...parsed };
  delete record.seedPhrase;
  return JSON.stringify(record);
}

/** `prefs.ts` defers the logger for the same reason: `node --test` reads this file as it is. */
function fsWarn(message: string, error?: unknown): void {
  void import('../logger/logger.ts').then(({ logger }) => logger.scope('FS').warn(message, error));
}

function fsInfo(message: string): void {
  void import('../logger/logger.ts').then(({ logger }) => logger.scope('FS').info(message));
}
