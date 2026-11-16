// The rules of "ref → version, channel, tag, prerelease" live here and nowhere else: the GitHub
// release workflow, the local dry run and the docs all read this file, so they cannot drift.
//
//   push to master        dev      <repo version>-dev.<run>   rolling tag `dev`
//   tag v1.2.3            release  1.2.3                      the tag itself (github `latest`)
//   tag v1.2.3-beta.4     beta     1.2.3-beta.4               rolling tag `beta`
//   tag v1.2.3-dev.4      dev      1.2.3-dev.4                rolling tag `dev`
//
// The version in `src-tauri/tauri.conf.json` is always the *next* unreleased one: a release tags
// it as is, a prerelease build suffixes it. That keeps semver and the android versionCode moving
// in the same direction (`1.2.4-dev.7` is newer than the released `1.2.3`, and its versionCode
// is larger, so the system installer accepts it).

export class ReleaseError extends Error {}

const CORE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAGGED = /^v?(\d+\.\d+\.\d+)(?:-(dev|beta)\.(\d+))?$/;

/** `release` is the only stream that becomes GitHub's `latest`. */
export const CHANNELS = ['release', 'beta', 'dev'];

/** Rolling tags: the release job rewrites their `latest.json`, the client reads them by name. */
export const ROLLING_TAGS = { release: null, beta: 'beta', dev: 'dev' };

export function parseChannel(value, fallback = 'dev') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!CHANNELS.includes(value)) {
    throw new ReleaseError(`unknown channel '${value}', expected one of ${CHANNELS.join(', ')}`);
  }
  return value;
}

/** `refs/tags/v1.2.3-beta.4` → { version: '1.2.3-beta.4', channel: 'beta' }, anything else → null. */
export function parseTagRef(ref) {
  const match = /^refs\/tags\/(.+)$/.exec(ref ?? '');
  if (!match) return null;
  const tagged = TAGGED.exec(match[1]);
  if (!tagged) {
    throw new ReleaseError(
      `tag '${match[1]}' is not v<major>.<minor>.<patch>[-dev.N|-beta.N]`
    );
  }
  const [, core, stream, serial] = tagged;
  if (!stream) return { version: core, channel: 'release' };
  return { version: `${core}-${stream}.${serial}`, channel: stream };
}

/**
 * Resolves one build. `run` numbers prerelease builds inside a channel; a tag carries its own
 * number, so it never depends on the runner.
 */
export function resolveRelease({ ref, baseVersion, run = 1, channel, notes = '' }) {
  if (!CORE.test(baseVersion ?? '')) {
    throw new ReleaseError(`repo version '${baseVersion}' is not <major>.<minor>.<patch>`);
  }
  const tagged = parseTagRef(ref);

  if (tagged) {
    const asked = channel ? parseChannel(channel, tagged.channel) : tagged.channel;
    if (asked !== tagged.channel) {
      throw new ReleaseError(
        `tag '${tagged.version}' is a ${tagged.channel} tag, but channel '${asked}' was requested`
      );
    }
    if (!tagged.version.startsWith(baseVersion)) {
      throw new ReleaseError(
        `tag version ${tagged.version} does not match src-tauri/tauri.conf.json ${baseVersion}`
      );
    }
    return finish({ version: tagged.version, channel: tagged.channel, notes, tag: `v${tagged.version}` });
  }

  // A branch push is a prerelease build of the version currently in the repo.
  const stream = parseChannel(channel, 'dev');
  const serial = String(run);
  if (!/^\d+$/.test(serial) || Number(serial) < 1) {
    throw new ReleaseError(`run number '${serial}' must be a positive integer`);
  }
  if (stream === 'release') {
    throw new ReleaseError(
      'a release needs a `v<version>` tag: pushing a branch cannot publish stable'
    );
  }
  return finish({
    version: `${baseVersion}-${stream}.${serial}`,
    channel: stream,
    notes,
    tag: `v${baseVersion}-${stream}.${serial}`,
  });
}

function finish({ version, channel, notes, tag }) {
  const rollingTag = ROLLING_TAGS[channel];
  return {
    version,
    channel,
    tag,
    /** GitHub's "pre-release" flag: exactly the streams whose manifest is not `latest`. */
    prerelease: channel !== 'release',
    /** Where the client reads this build's manifest: the rolling tag, or `latest` for a release. */
    manifestTag: rollingTag,
    notes: notes.trim(),
  };
}

/** `node scripts/release-meta.mjs --ref refs/heads/master --base 0.2.5 --run 42` */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const valueOf = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
  };
  try {
    const meta = resolveRelease({
      ref: valueOf('ref', ''),
      baseVersion: valueOf('base', ''),
      run: Number(valueOf('run', '1')),
      channel: valueOf('channel', undefined),
      notes: valueOf('notes', ''),
    });
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
  } catch (error) {
    if (!(error instanceof ReleaseError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
