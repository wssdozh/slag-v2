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
import { CHANNELS, ROLLING_TAGS } from './release-meta.mjs';

const MANIFEST_NAME = 'latest.json';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { repo: 'wssdozh/slag-v2', files: [], dryRun: false, key: null, notesFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} needs a value`);
      return argv[index];
    };
    if (arg === '--version') options.version = next();
    else if (arg === '--channel') options.channel = next();
    else if (arg === '--notes-file') options.notesFile = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--key') options.key = next();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--')) fail(`unknown flag ${arg}`);
    else options.files.push(arg);
  }
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

/**
 * Which manifest slot an artifact fills. Everything else (deb, AppImage, pkg.tar.zst, msi) is a
 * release-page attachment: no platform applies it through the updater.
 */
function slotOf(name) {
  if (name === 'slag-v2.exe') return ['windows-x86_64', 'portable'];
  if (/setup\.exe$/i.test(name)) return ['windows-x86_64', 'installer'];
  if (/\.apk$/i.test(name)) return ['android-aarch64', 'apk'];
  return null;
}

function sign(path, key) {
  const args = key ? ['tauri', 'signer', 'sign', '-f', key, path] : ['tauri', 'signer', 'sign', path];
  run(`sign ${basename(path)}`, 'npx', args);
  const signaturePath = `${path}.sig`;
  if (!existsSync(signaturePath)) fail(`no .sig next to ${basename(path)}`);
  return readFileSync(signaturePath, 'utf8').trim();
}

function makeManifest({ version, notes, assets, repo, tag }) {
  const platforms = {};
  for (const asset of assets) {
    const slot = slotOf(asset.name);
    if (!slot) continue;
    const [platform, kind] = slot;
    platforms[platform] ??= {};
    platforms[platform][kind] = {
      url: `https://github.com/${repo}/releases/download/${tag}/${asset.name}`,
      size: asset.size,
      sha256: asset.sha256,
      signature: asset.signature,
    };
  }
  if (Object.keys(platforms).length === 0) fail('nothing to publish: no installable artifact');
  return {
    version,
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    notes,
    platforms,
  };
}

function releaseExists(repo, tag) {
  return capture('gh', ['release', 'view', tag, '--repo', repo]).status === 0;
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

function main() {
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
  const manifestPath = join(staging, MANIFEST_NAME);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

  const notesFile = join(staging, 'notes.md');
  writeFileSync(notesFile, notes ? `${notes}\n` : '', 'utf8');

  const installable = assets.map((asset) => asset.path);
  const title = options.channel === 'release' ? options.version : `${options.channel}: ${options.version}`;
  if (options.dryRun) {
    process.stdout.write(`[dry-run] tag ${tag}, channel ${options.channel}, staging ${staging}\n`);
    return;
  }

  publish({
    repo: options.repo,
    tag,
    title,
    notesFile,
    prerelease: options.channel !== 'release',
    files: [...installable, manifestPath],
  });

  // The rolling tag is what a client on that channel actually reads: only the manifest is
  // rewritten there, the artifacts stay in the versioned release above.
  const rollingTag = ROLLING_TAGS[options.channel];
  if (rollingTag) {
    const rollingNotes = join(staging, 'rolling-notes.md');
    writeFileSync(
      rollingNotes,
      `последняя сборка канала \`${options.channel}\`: **${options.version}**\n\n` +
        `файлы — в релизе [${tag}](https://github.com/${options.repo}/releases/tag/${tag}).\n\n${notes}\n`,
      'utf8'
    );
    publish({
      repo: options.repo,
      tag: rollingTag,
      title: `${options.channel} · ${options.version}`,
      notesFile: rollingNotes,
      prerelease: true,
      files: [manifestPath],
    });
  }

  process.stdout.write(`published ${options.version} (${options.channel}) as ${tag}\n`);
}

main();
