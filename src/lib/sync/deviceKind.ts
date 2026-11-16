// What form factor a device record describes, for the one glyph its row wears.
//
// `platform` is free-form: this client sends `desktop` / `mobile` / `web`, while a relay keeps
// whatever a client wrote and another build may name a laptop, a tablet or a browser. The
// mapping therefore accepts the aliases it knows and falls back to `unknown` instead of
// guessing from the device name, which the owner can edit at will.
export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'web' | 'unknown';

const KIND_BY_PLATFORM: Readonly<Record<string, DeviceKind>> = {
  phone: 'phone',
  mobile: 'phone',
  android: 'phone',
  ios: 'phone',
  tablet: 'tablet',
  ipad: 'tablet',
  ipados: 'tablet',
  laptop: 'laptop',
  notebook: 'laptop',
  macbook: 'laptop',
  desktop: 'desktop',
  pc: 'desktop',
  windows: 'desktop',
  macos: 'desktop',
  linux: 'desktop',
  web: 'web',
  browser: 'web',
};

/** The one place a device record becomes a form factor; no value means `unknown`. */
export function deviceKind(platform: string | null | undefined): DeviceKind {
  if (!platform) return 'unknown';
  return KIND_BY_PLATFORM[platform.trim().toLowerCase()] ?? 'unknown';
}
