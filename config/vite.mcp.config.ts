import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/mcp/index.ts',
    outDir: 'dist/mcp',
    target: 'node20',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'esm',
      },
    },
    emptyOutDir: true,
  },
});

