// The channel guard is the difference between "an old run finished late" and "the channel went
// backwards"; and the version guard is the difference between a rebuild and two different files
// claiming the same version.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSemver } from './release-version.mjs';

test('patch, minor and major move forward', () => {
  assert.equal(compareSemver('0.2.5', '0.2.4'), 1);
  assert.equal(compareSemver('0.3.0', '0.2.9'), 1);
  assert.equal(compareSemver('1.0.0', '0.9.9'), 1);
  assert.equal(compareSemver('0.2.5', '0.2.5'), 0);
});

test('a prerelease is older than its release', () => {
  assert.equal(compareSemver('1.2.4-dev.7', '1.2.4'), -1);
  assert.equal(compareSemver('1.2.4', '1.2.4-dev.7'), 1);
});

test('prerelease identifiers follow semver 11', () => {
  assert.equal(compareSemver('1.2.4-dev.6', '1.2.4-dev.7'), -1);
  assert.equal(compareSemver('1.2.4-dev.7', '1.2.4-dev.7'), 0);
  // numeric identifiers sort below alphanumeric ones
  assert.equal(compareSemver('1.2.4-dev.7', '1.2.4-dev.beta'), -1);
  // a shorter prerelease list is lower when the shared prefix is equal
  assert.equal(compareSemver('1.2.4-dev', '1.2.4-dev.1'), -1);
  // channel order (dev < beta < release) is our policy, not semver: lexically beta < dev.\n  assert.equal(compareSemver('1.2.4-beta.1', '1.2.4-dev.9'), -1);
});

test('a leading v is tolerated, junk is refused', () => {
  assert.equal(compareSemver('v1.2.3', '1.2.3'), 0);
  assert.throws(() => compareSemver('1.2', '1.2.3'), /not a version/);
  assert.throws(() => compareSemver('latest', '1.2.3'), /not a version/);
});
