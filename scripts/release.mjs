// Publishes one SLAG build: signs the artifacts, writes `latest.json`, and pushes both to the
// release the channel reads. Replaces the old PowerShell script so CI and a laptop run the same
// code path on any OS.
//
//   node scripts/release.mjs --version 1.2.4-beta.3 --channel beta --notes-file notes.md \
//     --repo wssdozh/slag-v2 slag-v2.exe SLAG-1.2.4-beta.3-setup.exe SLAG-1.2.4-beta.3.apk
//
// Signing uses the minisign key from `--key` or `TAURI_SIGNING_PRIVATE_KEY`; the public half is
// committed as `src-tauri/updater.pubkey`, and a client that fails the check refuses the file.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { CHANNELS, ROLLING_TAGS } from './release-meta.mjs';
import { makeManifest } from './release-assets.mjs';
import { compareSemver } from './release-version.mjs';
import {
  buildReleaseBody,
  channelReleaseBody,
  channelTitle,
  manifestUrl,
  releaseTitle,
} from './release-text.mjs';

const MANIFEST_NAME = 'latest.json';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const CLI_OPTIONS = {
  version: { type: 'string' },
  channel: { type: 'string' },
  'notes-file': { type: 'string' },
  repo: { type: 'string', default: 'wssdozh/slag-v2' },
  key: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  force: { type: 'boolean', default: false },
};

/** `parseArgs` speaks its own dialect on bad input; this script has always printed these. */
function parseArgv(argv) {
  try {
    return parseNodeArgs({ args: argv, options: CLI_OPTIONS, allowPositionals: true });
  } catch (error) {
    const flag = /'([^' ]+)(?: <value>)?'/.exec(error.message)?.[1];
    if (flag && error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') fail(`unknown flag ${flag}`);
    if (flag && error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') fail(`${flag} needs a value`);
    throw error;
  }
}

function parseArgs(argv) {
  const { values, positionals } = parseArgv(argv);
  const options = {
    version: values.version,
    channel: values.channel,
    key: values.key ?? null,
    notesFile: values['notes-file'] ?? null,
    repo: values.repo,
    dryRun: values['dry-run'],
    force: values.force,
    files: positionals,
  };
  if (!options.version) fail('--version is required');
  if (!CHANNELS.includes(options.channel)) {
    fail(`--channel must be one of ${CHANNELS.join(', ')}`);
  }
  if (options.files.length === 0) fail('no artifacts to publish');
  return options;
}

function run(label, command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) fail(`${label} failed (exit ${result.status})`);
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** `tauri signer` writes `<file>.sig` next to the file; the key is `--key` or the env var. */
function sign(path, key) {
  const args = key ? ['tauri', 'signer', 'sign', '-f', key, path] : ['tauri', 'signer', 'sign', path];
  run('sign ' + basename(path), 'npx', args);
  const signaturePath = path + '.sig';
  if (!existsSync(signaturePath)) fail('no .sig next to ' + basename(path));
  return readFileSync(signaturePath, 'utf8').trim();
}


function releaseExists(repo, tag) {
  return capture('gh', ['release', 'view', tag, '--repo', repo]).status === 0;
}

/** `Map(name → digest)` of an existing release, or null when the tag has no release yet. */
function existingReleaseAssets(repo, tag) {
  const result = capture('gh', ['api', `repos/${repo}/releases/tags/${tag}`]);
  if (result.status !== 0) return null;
  const data = JSON.parse(result.stdout || '{}');
  return new Map((data.assets ?? []).map((asset) => [asset.name, asset.digest ?? null]));
}

/** What the channel serves right now, so an older build cannot move it backwards. */
async function channelVersion(repo, channel) {
  if (channel === 'release') return null;
  const url = `${manifestUrl(repo, channel)}?t=${Date.now()}`;
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
  if (!response?.ok) return null;
  const manifest = await response.json().catch(() => null);
  return manifest?.version ?? null;
}

function publish({ repo, tag, title, notesFile, prerelease, files }) {
  const flags = ['--repo', repo];
  if (releaseExists(repo, tag)) {
    run(`edit release ${tag}`, 'gh', [
      'release', 'edit', tag, ...flags, '--title', title, '--notes-file', notesFile,
      prerelease ? '--prerelease' : '--latest',
    ]);
  } else {
    run(`create release ${tag}`, 'gh', [
      'release', 'create', tag, ...flags, '--title', title, '--notes-file', notesFile,
      ...(prerelease ? ['--prerelease'] : ['--latest']),
    ]);
  }
  run(`upload to ${tag}`, 'gh', ['release', 'upload', tag, ...files, '--clobber', ...flags]);
  process.stdout.write(`uploaded ${files.length} files to ${tag}\n`);
}

/**
 * A tag is a promise: the same version may be re-uploaded only when every byte is the same file.
 * A rebuild with different bits is a new version, otherwise two machines would run "0.2.5" that
 * are not the same 0.2.5 and the signature would not tell them apart.
 */
function guardVersionNotRebuilt(repo, tag, assets) {
  const existing = existingReleaseAssets(repo, tag);
  if (!existing) return 'new';
  const same = assets.every((asset) => existing.get(asset.name) === `sha256:${asset.sha256}`);
  if (!same) {
    fail(
      `версия ${tag} уже опубликована другими файлами: подними версию, пересобери и запусти снова.\n` +
        `  было: ${[...existing.keys()].join(', ')}\n  стало: ${assets.map((a) => a.name).join(', ')}`
    );
  }
  return 'same';
}


async function main() {
  const options = parseArgs(process.argv.slice(2));
  const notes = options.notesFile ? readFileSync(options.notesFile, 'utf8').trim() : '';
  const tag = `v${options.version}`;
  const staging = mkdtempSync(join(tmpdir(), 'slag-release-'));

  const assets = [];
  for (const file of options.files) {
    const path = resolve(file);
    if (!existsSync(path)) fail(`missing artifact ${file}`);
    const staged = join(staging, basename(path));
    copyFileSync(path, staged);
    const stats = statSync(staged);
    const signature = options.dryRun
      ? 'dry-run'
      : sign(staged, options.key ?? null);
    assets.push({ name: basename(staged), path: staged, size: stats.size, sha256: sha256(staged), signature });
  }

  const manifest = makeManifest({ version: options.version, notes, assets, repo: options.repo, tag });
  if (Object.keys(manifest.platforms).length === 0) fail('nothing to publish: no installable artifact');
  const manifestPath = join(staging, MANIFEST_NAME);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

  const notesFile = join(staging, 'notes.md');
  writeFileSync(notesFile, notes ? `${notes}\n` : '', 'utf8');

  const installable = assets.map((asset) => asset.path);
  if (options.dryRun) {
    process.stdout.write(`[dry-run] tag ${tag}, channel ${options.channel}, staging ${staging}\n`);
    return;
  }

  // Refuse to move the channel backwards: two dispatched runs finish in whatever order the runners
  // feel like, and the older one arriving last must not become "the newest build".
  const previous = await channelVersion(options.repo, options.channel);
  if (previous && !options.force) {
    const order = compareSemver(options.version, previous);
    if (order < 0) {
      fail(
        `канал ${options.channel} уже раздаёт ${previous}, а эта сборка ${options.version} старше.\n` +
          '  пересборка старее текущей — ничего не публикую (--force, если это осознанно).'
      );
    }
    if (order === 0) {
      process.stdout.write(`== ${previous} уже в канале ${options.channel}, обновляю только манифест\n`);
    }
  }

  const buildNotes = join(staging, 'build-notes.md');
  writeFileSync(
    buildNotes,
    buildReleaseBody({
      channel: options.channel,
      version: options.version,
      previousVersion: previous,
      notes,
      repo: options.repo,
    }),
    'utf8'
  );

  const state = guardVersionNotRebuilt(options.repo, tag, assets);
  if (state === 'same') {
    process.stdout.write(`== релиз ${tag} уже опубликован с теми же файлами, пропускаю\n`);
  } else {
    publish({
      repo: options.repo,
      tag,
      title: releaseTitle(options.version),
      notesFile: buildNotes,
      prerelease: options.channel !== 'release',
      files: [...installable, manifestPath],
    });
  }

  // The rolling tag is what a client on that channel actually reads: only the manifest is
  // rewritten there, the artifacts stay in the versioned release above.
  const rollingTag = ROLLING_TAGS[options.channel];
  if (rollingTag) {
    const rollingNotes = join(staging, 'rolling-notes.md');
    writeFileSync(
      rollingNotes,
      channelReleaseBody({ channel: options.channel, version: options.version, repo: options.repo }),
      'utf8'
    );
    publish({
      repo: options.repo,
      tag: rollingTag,
      title: channelTitle(options.channel),
      notesFile: rollingNotes,
      prerelease: true,
      files: [manifestPath],
    });
  }

  process.stdout.write(`published ${options.version} (${options.channel}) as ${tag}\n`);
}

main().catch((error) => {
  if (error instanceof Error) fail(error.message);
  throw error;
});
