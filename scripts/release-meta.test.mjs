// The channel rules decide what a client sees; a wrong rule silently ships a prerelease to
// everyone on stable, so they are covered here rather than trusted.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ReleaseError, parseTagRef, resolveRelease } from './release-meta.mjs';

test('a plain tag is a stable release', () => {
  const meta = resolveRelease({
    ref: 'refs/tags/v1.2.3',
    baseVersion: '1.2.3',
    notes: '  привет  ',
  });
  assert.equal(meta.version, '1.2.3');
  assert.equal(meta.channel, 'release');
  assert.equal(meta.tag, 'v1.2.3');
  assert.equal(meta.prerelease, false);
  assert.equal(meta.manifestTag, null);
  assert.equal(meta.notes, 'привет');
});

test('beta and dev tags keep their serial and never touch latest', () => {
  const beta = resolveRelease({ ref: 'refs/tags/v1.2.4-beta.4', baseVersion: '1.2.4' });
  assert.equal(beta.version, '1.2.4-beta.4');
  assert.equal(beta.channel, 'beta');
  assert.equal(beta.prerelease, true);
  assert.equal(beta.manifestTag, 'beta');

  const dev = resolveRelease({ ref: 'refs/tags/v1.2.4-dev.9', baseVersion: '1.2.4' });
  assert.equal(dev.channel, 'dev');
  assert.equal(dev.manifestTag, 'dev');
});

test('a branch push builds the dev stream of the repo version', () => {
  const meta = resolveRelease({ ref: 'refs/heads/master', baseVersion: '0.2.5', run: 42 });
  assert.equal(meta.version, '0.2.5-dev.42');
  assert.equal(meta.channel, 'dev');
  assert.equal(meta.prerelease, true);
  // The tag is unique per build, so an old dev build stays downloadable.
  assert.equal(meta.tag, 'v0.2.5-dev.42');
});

test('a branch push can be aimed at beta explicitly', () => {
  const meta = resolveRelease({
    ref: 'refs/heads/master',
    baseVersion: '0.2.5',
    run: 7,
    channel: 'beta',
  });
  assert.equal(meta.version, '0.2.5-beta.7');
  assert.equal(meta.manifestTag, 'beta');
});

test('a branch push cannot publish stable', () => {
  assert.throws(
    () => resolveRelease({ ref: 'refs/heads/master', baseVersion: '0.2.5', channel: 'release' }),
    ReleaseError
  );
});

test('a tag decides its own channel: asking for another one is an error', () => {
  assert.throws(
    () =>
      resolveRelease({
        ref: 'refs/tags/v1.2.3-beta.1',
        baseVersion: '1.2.3',
        channel: 'release',
      }),
    /beta tag/
  );
});

test('a tag that disagrees with the repo version is refused', () => {
  // The manifest must not promise a version the binaries do not carry.
  assert.throws(
    () => resolveRelease({ ref: 'refs/tags/v1.2.3', baseVersion: '1.2.4' }),
    /does not match/
  );
});

test('malformed tags and versions are refused, not guessed', () => {
  assert.throws(() => parseTagRef('refs/tags/release-2026'), ReleaseError);
  assert.throws(() => resolveRelease({ ref: 'refs/tags/v1.2', baseVersion: '1.2.3' }), ReleaseError);
  assert.throws(() => resolveRelease({ ref: 'refs/heads/master', baseVersion: 'v1.2.3' }), ReleaseError);
  assert.throws(
    () => resolveRelease({ ref: 'refs/heads/master', baseVersion: '1.2.3', run: 0 }),
    ReleaseError
  );
});

test('an unknown channel name is refused', () => {
  assert.throws(
    () => resolveRelease({ ref: 'refs/heads/master', baseVersion: '1.2.3', channel: 'nightly' }),
    /unknown channel/
  );
});
