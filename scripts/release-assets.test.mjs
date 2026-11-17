// The manifest is what a client reads to decide whether it can update; a file in the wrong slot
// is worse than a missing one, because the UI then offers an install that cannot work.
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeManifest, slotOf } from './release-assets.mjs';

test('every launcher artifact has exactly one slot', () => {
  assert.deepEqual(slotOf('slag-v2.exe'), ['windows-x86_64', 'portable']);
  assert.deepEqual(slotOf('SLAG_0.2.5_x64-setup.exe'), ['windows-x86_64', 'installer']);
  assert.deepEqual(slotOf('SLAG-0.2.5-dev.6.apk'), ['android-aarch64', 'apk']);
  assert.deepEqual(slotOf('SLAG_0.2.5_amd64.AppImage'), ['linux-x86_64', 'appimage']);
});

test('each linux distro gets the package it can actually install', () => {
  // The app never runs apt or pacman, but it has to name the right file: a deb on arch and a
  // pkg.tar.zst on ubuntu are both a dead end for the owner.
  assert.deepEqual(slotOf('SLAG_0.2.5_amd64.deb'), ['linux-x86_64', 'deb']);
  assert.deepEqual(slotOf('slag-0.2.5.dev.23-1-x86_64.pkg.tar.zst'), ['linux-x86_64', 'archpkg']);
});

test('everything a platform cannot consume stays a release-page attachment', () => {
  assert.equal(slotOf('SLAG_0.2.5_x64_en-US.msi'), null);
  assert.equal(slotOf('slag-0.2.5-1.x86_64.rpm'), null);
  assert.equal(slotOf('notes.md'), null);
});

test('the manifest keeps the shape the native reader expects', () => {
  const manifest = makeManifest({
    version: '0.2.5',
    notes: 'что поменялось',
    repo: 'wssdozh/slag-v2',
    tag: 'v0.2.5',
    pubDate: new Date('2026-11-16T12:00:00Z'),
    assets: [
      { name: 'slag-v2.exe', size: 1, sha256: 'a', signature: 's1' },
      { name: 'SLAG_0.2.5_x64-setup.exe', size: 2, sha256: 'b', signature: 's2' },
      { name: 'SLAG-0.2.5.apk', size: 3, sha256: 'c', signature: 's3' },
      { name: 'SLAG_0.2.5_amd64.AppImage', size: 4, sha256: 'd', signature: 's4' },
      { name: 'SLAG_0.2.5_amd64.deb', size: 5, sha256: 'e', signature: 's5' },
      { name: 'slag-0.2.5-1-x86_64.pkg.tar.zst', size: 6, sha256: 'f', signature: 's6' },
    ],
  });
  assert.equal(manifest.version, '0.2.5');
  assert.equal(manifest.pub_date, '2026-11-16T12:00:00Z');
  assert.deepEqual(Object.keys(manifest.platforms).sort(), [
    'android-aarch64',
    'linux-x86_64',
    'windows-x86_64',
  ]);
  const linux = manifest.platforms['linux-x86_64'];
  assert.equal(linux.appimage.url,
    'https://github.com/wssdozh/slag-v2/releases/download/v0.2.5/SLAG_0.2.5_amd64.AppImage');
  assert.equal(linux.appimage.sha256, 'd');
  assert.equal(linux.deb.sha256, 'e');
  assert.equal(linux.archpkg.sha256, 'f');
  // Same platform, three files: the client picks by distro, not by "newest".
  assert.deepEqual(Object.keys(linux).sort(), ['appimage', 'archpkg', 'deb']);
});
