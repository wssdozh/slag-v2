// The release page shows two entries per prerelease build. If their names looked alike, the page
// would read as a duplicate; the template keeps them distinguishable and identical in shape.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReleaseBody,
  channelReleaseBody,
  channelTitle,
  manifestUrl,
  releaseTitle,
} from './release-text.mjs';

const REPO = 'wssdozh/slag-v2';

test('a build is named by its version, a channel only by the word канал', () => {
  assert.equal(releaseTitle('0.2.5-dev.7'), 'SLAG 0.2.5-dev.7');
  assert.equal(releaseTitle('1.2.3'), 'SLAG 1.2.3');
  assert.equal(channelTitle('dev'), 'канал dev');
  assert.equal(channelTitle('beta'), 'канал beta');
  // the two titles must not be confusable at a glance
  assert.notEqual(releaseTitle('0.2.5-dev.7'), channelTitle('dev'));
});

test('the manifest url is the one the client actually reads', () => {
  assert.equal(
    manifestUrl(REPO, 'release'),
    'https://github.com/wssdozh/slag-v2/releases/latest/download/latest.json'
  );
  assert.equal(
    manifestUrl(REPO, 'dev'),
    'https://github.com/wssdozh/slag-v2/releases/download/dev/latest.json'
  );
  assert.equal(
    manifestUrl(REPO, 'beta'),
    'https://github.com/wssdozh/slag-v2/releases/download/beta/latest.json'
  );
});

test('the build body carries version, channel, notes and the manifest', () => {
  const body = buildReleaseBody({
    channel: 'dev',
    version: '0.2.5-dev.7',
    previousVersion: '0.2.5-dev.6',
    notes: '- композер на code mirror',
    repo: REPO,
  });
  assert.match(body, /версия\*\* `0\.2\.5-dev\.7`/);
  assert.match(body, /канал\*\* `dev`/);
  assert.match(body, /до\*\* `0\.2\.5-dev\.6`/);
  assert.match(body, /- композер на code mirror/);
  assert.match(body, /download\/dev\/latest\.json/);
});

test('a release knows it is the latest, a prerelease knows it is history', () => {
  const stable = buildReleaseBody({ channel: 'release', version: '1.2.3', notes: 'x', repo: REPO });
  assert.match(stable, /latest/);
  const dev = buildReleaseBody({ channel: 'dev', version: '1.2.4-dev.1', notes: '', repo: REPO });
  assert.match(dev, /история сборки/);
  assert.match(dev, /без заметок/);
});

test('the channel body points at the build instead of repeating its notes', () => {
  const body = channelReleaseBody({ channel: 'dev', version: '0.2.5-dev.7', repo: REPO });
  assert.match(body, /канал\*\* `dev`/);
  assert.match(body, /раздаёт `0\.2\.5-dev\.7`/);
  assert.match(body, /releases\/tag\/v0\.2\.5-dev\.7/);
  assert.doesNotMatch(body, /композер/);
});
