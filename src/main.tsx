// Boots the React root into #root, in StrictMode, after the settings store, the secret store and
// the global stylesheet.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { logger } from './lib/logger/logger'
import { initPrefs } from './lib/storage/prefs'
import { initSecretStore } from './lib/platform/secretStore'

const bootLog = logger.scope('APP')

function showBootFailure(): void {
  const root = document.getElementById('root')
  if (!root) return
  root.replaceChildren()

  const panel = document.createElement('div')
  panel.setAttribute('role', 'alert')
  panel.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:16px;padding:32px;background:#09090b;color:#f4f4f5;font:14px/1.5 Inter,system-ui,sans-serif;text-align:center'

  const title = document.createElement('div')
  title.textContent = 'Не удалось открыть защищённое хранилище'
  title.style.cssText = 'font-size:16px;font-weight:600'

  const hint = document.createElement('div')
  hint.textContent =
    'Ключи синхронизации остались на месте и не потеряны. Разблокируйте системную связку ключей и повторите.'
  hint.style.cssText = 'max-width:420px;color:#a1a1aa'

  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Повторить'
  retry.style.cssText =
    'padding:8px 16px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#1f1f1f;color:#f4f4f5;cursor:pointer'
  retry.addEventListener('click', () => {
    retry.disabled = true
    void boot()
  })

  panel.append(title, hint, retry)
  root.append(panel)
}

async function boot(): Promise<void> {
  try {
    // Settings before the shell: every reader below expects them in memory, synchronously.
    await initPrefs()
    await initSecretStore()
    const { default: App } = await import('./App')
    const root = document.getElementById('root')!
    root.replaceChildren()
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    bootLog.error('Boot failed', error)
    showBootFailure()
  }
}

void boot()
