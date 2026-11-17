// Which artifact fills which manifest slot. A wrong slot ships a file nobody downloads, so the
// mapping lives in its own module and is covered by node --test.

/**
 * `slag-v2.exe`  → the portable exe a Windows build can swap itself.
 * `*setup.exe`   → the nsis installer, used when the exe folder is not writable.
 * `*.apk`        → the android package.
 * `*.AppImage`   → the one linux form the app may replace on its own.
 * `*.deb`        → ubuntu and debian: the app cannot install it, but it must point at the right file.
 * `*.pkg.tar.zst`→ arch the same way; pacman is the only installer that understands it.
 * Everything else (rpm, msi, flatpak) stays a release-page attachment: no platform installs it.
 */
export function slotOf(name) {
  if (name === 'slag-v2.exe') return ['windows-x86_64', 'portable'];
  if (/setup\.exe$/i.test(name)) return ['windows-x86_64', 'installer'];
  if (/\.apk$/i.test(name)) return ['android-aarch64', 'apk'];
  if (/\.AppImage$/i.test(name)) return ['linux-x86_64', 'appimage'];
  if (/\.deb$/i.test(name)) return ['linux-x86_64', 'deb'];
  if (/\.pkg\.tar\.zst$/i.test(name)) return ['linux-x86_64', 'archpkg'];
  return null;
}

export function makeManifest({ version, notes, assets, repo, tag, pubDate = new Date() }) {
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
  return {
    version,
    pub_date: pubDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    notes,
    platforms,
  };
}
