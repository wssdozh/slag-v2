// Semver comparison is what stops a slow run from overwriting a newer channel build: GitHub
// Actions finishes runs in whatever order the runners feel like, so "publish" must refuse to move
// a channel backwards rather than trust the arrival order.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseSemver(text) {
  const match = SEMVER.exec(String(text ?? '').trim());
  if (!match) throw new Error(`not a version: ${text}`);
  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    pre: pre ? pre.split('.') : [],
  };
}

/** Semver §11: numeric identifiers compare numerically, alphanumerics lexically, and a version
 *  with a prerelease is lower than the same version without one. */
function comparePre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (const field of ['major', 'minor', 'patch']) {
    const diff = left[field] - right[field];
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return comparePre(left.pre, right.pre);
}
