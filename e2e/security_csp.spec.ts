import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources.join(' '));
  }
  return map;
}

test.describe('tauri CSP', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
    app: { security: { csp?: string | null; devCsp?: string | null } };
  };

  test('production policy locks scripts and still allows assets and IPC', () => {
    const csp = config.app.security.csp;
    expect(typeof csp).toBe('string');
    const parsed = directives(csp!);

    expect(parsed.get('default-src')).toBe("'self'");
    expect(parsed.get('script-src')).toBe("'self'");
    expect(parsed.get('script-src')).not.toContain('unsafe-inline');
    expect(parsed.get('script-src')).not.toContain('unsafe-eval');
    expect(parsed.get('object-src')).toBe("'none'");
    expect(parsed.get('frame-src')).toBe("'none'");
    expect(parsed.get('base-uri')).toBe("'self'");
    expect(parsed.get('form-action')).toBe("'none'");

    expect(parsed.get('style-src')).toContain("'unsafe-inline'");
    expect(parsed.get('connect-src')).toContain('ipc:');
    expect(parsed.get('connect-src')).toContain('http://ipc.localhost');
    expect(parsed.get('img-src')).toContain('asset:');
    expect(parsed.get('img-src')).toContain('http://asset.localhost');
    expect(parsed.get('img-src')).toContain('android-fs-content:');
    expect(parsed.get('media-src')).toContain('android-fs-content:');
  });

  test('dev policy permits Vite HMR without weakening production', () => {
    const devCsp = config.app.security.devCsp;
    expect(typeof devCsp).toBe('string');
    const parsed = directives(devCsp!);

    expect(parsed.get('script-src')).toContain('http://localhost:5173');
    expect(parsed.get('script-src')).toContain("'unsafe-eval'");
    expect(parsed.get('connect-src')).toContain('ws://localhost:5173');
    expect(parsed.get('connect-src')).toContain('http://127.0.0.1:5173');
  });
});
