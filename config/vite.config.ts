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

          // Dev-only endpoint used to be a free path traversal: `target=../../..` created
          // directories anywhere the dev user could write. Only vault-relative paths now.
          const safeTarget = (raw: string): string => {
            const value = raw.trim();
            if (value === 'notes') return path.join('vaults', 'main', 'notes');
            if (value === 'logs') return 'logs';
            if (value === 'backups') return 'backups';
            if (!value) throw new Error('empty target');
            const normalized = value.replace(/\\/g, '/');
            if (normalized.startsWith('/') || normalized.startsWith('~') || /^[a-zA-Z]:/.test(normalized)) {
              throw new Error('absolute target');
            }
            const parts = normalized.split('/');
            if (parts.some((part) => !part || part === '.' || part === '..' || part.includes(':') || part.includes('\0'))) {
              throw new Error('unsafe target');
            }
            return parts.join('/');
          };

          let targetDir: string;
          const appData =
            process.env.APPDATA ||
            (process.platform === 'darwin'
              ? `${process.env.HOME}/Library/Application Support`
              : `${process.env.HOME}/.config`);
          const subPath = safeTarget(target);
          const tauriAppData = path.join(appData, 'com.slag.notes', subPath);

          if (fs.existsSync(path.join(appData, 'com.slag.notes'))) {
            targetDir = tauriAppData;
          } else {
            targetDir = path.resolve(process.cwd(), target === 'notes' ? path.join('vaults', 'main', 'notes') : 'logs');
          }

          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          // Windows explorer wants `/select,<file>` and a bare path for a folder; every other
          // platform opens the folder and only takes `-R` for a file.
          const platform = os.platform();
          const winTarget = targetDir.replace(/\//g, '\\');
          const isFile = fs.existsSync(targetDir) && fs.statSync(targetDir).isFile();
          const [bin, args] = platform === 'win32'
            ? ['explorer.exe', isFile ? [`/select,${winTarget}`] : [winTarget]]
            : platform === 'darwin'
              ? ['open', isFile ? ['-R', targetDir] : [targetDir]]
              : ['xdg-open', [isFile ? path.dirname(targetDir) : targetDir]];
          spawn(bin, args, { detached: true, stdio: 'ignore' }).unref();

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
  // Several checkouts share one node_modules (worktrees junction it), and two dev servers
  // rewriting the same pre-bundled deps directory is a rename race on Windows: one of them
  // gets EPERM and serves 504 "outdated optimize dep" until it is restarted. Give a run its
  // own cache when asked.
  cacheDir: process.env.SLAG_VITE_CACHE_DIR || 'node_modules/.vite',
  server: {
    // The dev server has a filesystem-writing endpoint above; keep it off the LAN unless
    // phone testing explicitly asks for it with SLAG_DEV_HOST=0.0.0.0.
    host: process.env.SLAG_DEV_HOST || '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Other checkouts live under `.agents/worktrees` and junction the same `node_modules`.
    // The watcher followed those junctions and spent minutes failing to stat them (`UNKNOWN`
    // on Windows); a cold start paid that before the first module was even served.
    watch: {
      ignored: ['**/.agents/**'],
    },
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
  },
})
