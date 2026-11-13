import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const tauriStub = fileURLToPath(new URL('./src/node/stubs/tauri.ts', import.meta.url));
const tauriFsStub = fileURLToPath(new URL('./src/node/stubs/tauriFs.ts', import.meta.url));
const browserPortStub = fileURLToPath(new URL('./src/node/stubs/browserPort.ts', import.meta.url));

/**
 * The headless build. Two modules are replaced before anything is bundled:
 * the tauri API (a server has no window, and `isTauri() === false` makes the engine claim sync)
 * and the browser vault port (the node registers its own before the engine is imported).
 */
export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: 'slag-node-stubs',
      enforce: 'pre',
      resolveId(source: string) {
        if (/^@tauri-apps\/api\//.test(source)) return tauriStub;
        if (source === '@tauri-apps/plugin-fs') return tauriFsStub;
        if (source === './browserPort' || source.endsWith('/lib/storage/browserPort')) return browserPortStub;
        return null;
      },
    },
  ],
  ssr: {
    // One file, no node_modules: the Pi gets a tarball, not a package tree.
    noExternal: true,
  },
  build: {
    ssr: 'src/node/index.ts',
    outDir: 'dist/node',
    target: 'node22',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'esm',
        // One file on the Pi: the node has no node_modules and no chunk loader.
        inlineDynamicImports: true,
      },
    },
  },
});
