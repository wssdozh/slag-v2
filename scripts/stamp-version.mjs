// The release version is computed per channel (`0.2.5-dev.24`), while the repository keeps the
// base version (`0.2.5`). `tauri build --config version.json` renames the bundle but does not
// change what the binary reports at runtime: the compiler embeds the config it was given, and a
// dev client then compared `0.2.5` against `0.2.5-dev.N` and answered "up to date" forever.
// Stamping the computed version into the files the compiler reads is what makes the runtime
// version honest — and only then can semver order dev.24 before dev.25.
//
//   node scripts/stamp-version.mjs 0.2.5-dev.24
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: stamp-version.mjs <version>');
  process.exit(1);
}
// The same shape release-meta.mjs produces; anything else is a typo that would break the build
// in a much less obvious place.
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(version)) {
  console.error(`stamp-version: "${version}" is not a semver version`);
  process.exit(1);
}

const confPath = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(confPath, 'utf8'));

// `--update-check` and the log line it prints read CARGO_PKG_VERSION, so Cargo has to agree too.
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const packageVersion = /^(\[package\]\r?\n[^[]*?^version = )"[^"]+"/m;
if (!packageVersion.test(cargo)) {
  console.error(`stamp-version: no [package] version line in ${cargoPath}`);
  process.exit(1);
}
const stamped = cargo.replace(packageVersion, (_, prefix) => `${prefix}"${version}"`);
if (stamped !== cargo) writeFileSync(cargoPath, stamped);
if (conf.version !== version) {
  conf.version = version;
  writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);
}

process.stdout.write(`stamped ${version} into ${confPath} and ${cargoPath}\n`);
