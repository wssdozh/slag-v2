// Let `node --test` load the real writer modules, not a copy of their logic.
//
// App source imports extensionless paths (a bundler convention) and, transitively, Tauri APIs a
// headless writer never calls. Two resolver rules — append `.ts` / `index.ts`, answer
// `@tauri-apps/*` with the no-op stub next to this file — are enough to drive McpVault and
// NodeVault themselves. The hook API exists since Node 22.15; CI runs Node 22.
//
// Import this module, then reach the writers with `await import(...)`: static imports of the test
// file are linked before any hook registered here could run.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stubUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tauriStub.mjs')).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@tauri-apps/')) return { url: stubUrl, shortCircuit: true };
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || !context.parentURL) throw error;
      const withTs = new URL(specifier.endsWith('.ts') ? specifier : `${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(withTs))) return { url: withTs.href, shortCircuit: true };
      const indexTs = new URL(`${specifier}/index.ts`, context.parentURL);
      if (existsSync(fileURLToPath(indexTs))) return { url: indexTs.href, shortCircuit: true };
      throw error;
    }
  },
});
