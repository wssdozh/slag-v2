import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'

function devFolderOpenerPlugin() {
  return {
    name: 'slag-dev-folder-opener',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/dev/open-folder')) {
          return next();
        }
        try {
          const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1:5173'}`);
          const target = url.searchParams.get('target') || 'logs';

          let targetDir: string;
          const appData =
            process.env.APPDATA ||
            (process.platform === 'darwin'
              ? `${process.env.HOME}/Library/Application Support`
              : `${process.env.HOME}/.config`);
          const subPath =
            target === 'notes'
              ? path.join('vaults', 'main', 'notes')
              : target === 'logs'
              ? 'logs'
              : target.replace(/^[/\\]+/, '');
          const tauriAppData = path.join(appData, 'com.slag.notes', subPath);

          if (fs.existsSync(path.join(appData, 'com.slag.notes'))) {
            targetDir = tauriAppData;
          } else {
            targetDir = path.resolve(process.cwd(), target === 'notes' ? path.join('vaults', 'main', 'notes') : 'logs');
          }

          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          const platform = os.platform();
          if (platform === 'win32') {
            const winTarget = targetDir.replace(/\//g, '\\');
            const isFile = winTarget.endsWith('.md') && fs.existsSync(winTarget);
            const args = isFile ? [`/select,${winTarget}`] : [winTarget];
            spawn('explorer.exe', args, { detached: true, stdio: 'ignore' }).unref();
          } else if (platform === 'darwin') {
            const isFile = targetDir.endsWith('.md') && fs.existsSync(targetDir);
            const args = isFile ? ['-R', targetDir] : [targetDir];
            spawn('open', args, { detached: true, stdio: 'ignore' }).unref();
          } else {
            const isFile = targetDir.endsWith('.md') && fs.existsSync(targetDir);
            const openPath = isFile ? path.dirname(targetDir) : targetDir;
            spawn('xdg-open', [openPath], { detached: true, stdio: 'ignore' }).unref();
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, path: targetDir }));
        } catch (err) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devFolderOpenerPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com/openai/v1',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/groq/, ''),
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@orama/orama')) {
            return 'orama';
          }
          if (
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/@lezer') ||
            id.includes('node_modules/@atomic-editor')
          ) {
            return 'codemirror';
          }
          if (id.includes('node_modules/dockview') || id.includes('node_modules/dockview-core')) {
            return 'dockview';
          }
          if (id.includes('node_modules/chrono-node')) {
            return 'chrono';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
