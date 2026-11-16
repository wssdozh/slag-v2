// One command for "ship this branch to a channel": push, dispatch the release workflow, watch it,
// then check the manifest that the client will actually read. Every step is a plain git/gh call,
// so it can be re-run or interrupted without leaving anything half-done.
//
//   node scripts/release-run.mjs --channel dev            # текущая ветка → канал dev
//   node scripts/release-run.mjs --channel beta           # текущая ветка → канал beta
//   node scripts/release-run.mjs --channel release        # текущая ветка → тег v<версия> → релиз
//   node scripts/release-run.mjs --run 43883863555        # просто дождаться чужого прогона
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolveRelease, ReleaseError } from './release-meta.mjs';

const WORKFLOW = 'release.yml';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, args, { capture = false, allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !allowFail) {
    const detail = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    fail(`${command} ${args.join(' ')} failed (exit ${result.status})${detail ? `\n${detail}` : ''}`);
  }
  return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

function parseArgs(argv) {
  const options = { channel: null, notes: '', push: true, runId: null, ref: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} needs a value`);
      return argv[index];
    };
    if (arg === '--channel') options.channel = next();
    else if (arg === '--notes') options.notes = next();
    else if (arg === '--run') options.runId = next();
    else if (arg === '--ref') options.ref = next();
    else if (arg === '--no-push') options.push = false;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'usage: node scripts/release-run.mjs [--channel dev|beta|release] [--notes text] [--run id] [--ref branch] [--no-push]\n'
      );
      process.exit(0);
    } else fail(`unknown flag ${arg}`);
  }
  if (!options.runId && !options.channel) fail('--channel is required (dev, beta or release)');
  return options;
}

/** `wssdozh/slag-v2` from the origin remote: the workflow and the manifest both need it. */
function repoName() {
  const remote = run('git', ['remote', 'get-url', 'origin'], { capture: true }).stdout;
  const match = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(remote);
  if (!match) fail(`cannot read the repository from origin: ${remote}`);
  return `${match[1]}/${match[2]}`;
}

function currentBranch() {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).stdout;
  if (!branch || branch === 'HEAD') fail('detached HEAD: check out a branch first');
  return branch;
}

function repoVersion() {
  const path = 'src-tauri/tauri.conf.json';
  if (!existsSync(path)) fail(`no ${path}: run this from the repository root`);
  return JSON.parse(readFileSync(path, 'utf8')).version;
}

function latestRunId(repo, branch) {
  const json = run('gh', ['run', 'list', '--repo', repo, '--workflow', WORKFLOW, '--branch', branch, '--limit', '1', '--json', 'databaseId'], { capture: true }).stdout;
  const [first] = JSON.parse(json || '[]');
  return first ? String(first.databaseId) : null;
}

function watch(repo, runId) {
  process.stdout.write(`\n== прогон ${runId}: https://github.com/${repo}/actions/runs/${runId}\n`);
  const result = spawnSync('gh', ['run', 'watch', runId, '--repo', repo, '--interval', '20', '--exit-status'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status === 0) {
    process.stdout.write('== зелёный\n');
    return true;
  }
  process.stdout.write('== упал, последние строки:\n\n');
  const log = spawnSync('gh', ['run', 'view', runId, '--repo', repo, '--log-failed'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const lines = `${log.stdout ?? ''}`.split('\n').filter(Boolean);
  process.stdout.write(`${lines.slice(-30).join('\n')}\n`);
  return false;
}

/**
 * The client only believes the manifest, so the check is not "the job is green" but "this url
 * answers with the version we just built".
 */
async function verifyManifest(repo, channel, expected) {
  const base =
    channel === 'release'
      ? `https://github.com/${repo}/releases/latest/download/latest.json`
      : `https://github.com/${repo}/releases/download/${channel}/latest.json`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(base, { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
    if (response?.ok) {
      const manifest = await response.json().catch(() => null);
      // A stable release must match exactly; a prerelease carries a run number we cannot know.
      const matches = channel === 'release'
        ? manifest?.version === expected
        : typeof manifest?.version === 'string' && manifest.version.startsWith(expected);
      if (matches) {
        process.stdout.write(`== манифест ${channel}: ${manifest.version} ✓\n  ${base}\n`);
        return true;
      }
      process.stdout.write(
        `  манифест отдаёт ${manifest?.version ?? '?'}, ждём ${expected}… (${attempt}/6)\n`
      );
    } else {
      process.stdout.write(`  ${base} → ${response ? response.status : 'нет связи'} (${attempt}/6)\n`);
    }
    await new Promise((done) => setTimeout(done, 15000));
  }
  process.stderr.write(`== манифест ${channel} так и не показал ${expected}\n`);
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = repoName();

  if (options.runId) {
    const green = watch(repo, options.runId);
    process.exit(green ? 0 : 1);
  }

  const branch = options.ref ?? currentBranch();
  const baseVersion = repoVersion();
  // The run number (and so the exact dev/beta version) is assigned by GitHub, not by us: the
  // local preview can only promise the channel and the tag shape, and the manifest tells the rest.
  const meta = resolveRelease({
    ref: options.channel === 'release' ? `refs/tags/v${baseVersion}` : `refs/heads/${branch}`,
    baseVersion,
    run: 1,
    channel: options.channel,
    notes: options.notes,
  });
  // `release` names its version exactly; a prerelease carries a run number only GitHub knows.
  const expected = meta.channel === 'release' ? meta.version : `${baseVersion}-${meta.channel}.`;
  process.stdout.write(
    `== ${repo} · ветка ${branch} · канал ${meta.channel} · ожидаемая версия ${expected}\n`
  );

  if (options.push) {
    const dirty = run('git', ['status', '--porcelain'], { capture: true }).stdout;
    if (dirty) fail('в рабочей копии есть незакоммиченное — закоммить или убери, потом повторяй');
    run('git', ['push', 'origin', branch]);
  }

  if (meta.channel === 'release') {
    // A stable release is a tag and nothing else; the workflow refuses any other way in.
    if (run('git', ['rev-parse', '-q', '--verify', `refs/tags/${meta.tag}`], { capture: true, allowFail: true }).status === 0) {
      fail(`тег ${meta.tag} уже есть: подними версию или удали тег руками`);
    }
    run('git', ['tag', meta.tag]);
    run('git', ['push', 'origin', meta.tag]);
  } else {
    const before = latestRunId(repo, branch);
    run('gh', [
      'workflow', 'run', WORKFLOW, '--repo', repo, '--ref', branch,
      '-f', `channel=${meta.channel}`, '-f', `notes=${meta.notes}`,
    ]);
    // The dispatch answers before the run exists; wait for a run id that is not the previous one.
    let runId = before;
    for (let attempt = 0; attempt < 12 && runId === before; attempt += 1) {
      await new Promise((done) => setTimeout(done, 5000));
      runId = latestRunId(repo, branch);
    }
    if (!runId || runId === before) fail('прогон так и не появился: смотри вкладку Actions');
    options.runId = runId;
  }

  if (meta.channel === 'release') {
    // Tag pushes create the run asynchronously; find it by the tag we just pushed.
    options.runId = run('gh', ['run', 'list', '--repo', repo, '--workflow', WORKFLOW, '--limit', '1', '--json', 'databaseId'], { capture: true }).stdout;
    const parsed = JSON.parse(options.runId || '[]');
    options.runId = parsed[0] ? String(parsed[0].databaseId) : null;
    if (!options.runId) fail('прогон по тегу не появился');
  }

  const green = watch(repo, options.runId);
  if (!green) process.exit(1);
  const verified = await verifyManifest(repo, meta.channel, expected);
  process.exit(verified ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof ReleaseError) fail(error.message);
  throw error;
});
