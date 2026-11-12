// A separate playground entry for eyeballing modals and settings on an isolated origin.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider, useApp } from './context/AppContext';
import { BaseModal } from './components/Modals/BaseModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FolderModal } from './components/Modals/FolderModal';
import { FolderInfoModal } from './components/Modals/FolderInfoModal';
import { FolderViewModal } from './components/Modals/FolderViewModal';
import { VaultModal } from './components/Modals/VaultModal';
import { ComposerModal } from './components/Modals/ComposerModal';
import { SearchModal } from './components/Search/SearchModal';
import { LogModal } from './components/Logs/LogModal';
import { ToastContainer } from './components/UI/Toast';

// Separate origin only: never start this entry on the real application's port.
const isolated = location.port === '5174';
if (isolated) {
  const config = JSON.stringify({ enabled: false, autoSync: false, serverUrl: 'http://127.0.0.1:1' });
  localStorage.setItem('slag_sync_config_v2', config);
  localStorage.setItem('slag_sync_config_v2_default_vault', config);
}

export function Playground() {
  const app = useApp();
  const [dialog, setDialog] = useState<'basic' | 'confirm' | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDialog(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const button = 'min-h-11 px-4 py-3 text-left text-sm text-fg-primary bg-surface border border-border-subtle rounded-xl hover:bg-surface-hover active:opacity-70 cursor-pointer';
  const samples: [string, () => void][] = [
    ['обычная модалка', () => setDialog('basic')],
    ['подтверждение действия', () => setDialog('confirm')],
    ['настройки · все вкладки', () => app.openSettingsModal('ai')],
    ['поиск', () => app.setIsSearchOpen(true)],
    ['создание заметки', () => app.openComposerModal()],
    ['создание папки', () => app.openCreateFolderModal()],
    ['информация о папке', () => app.openFolderInfoModal(app.currentFolder)],
    ['вид и фильтры папки', () => app.openFolderViewModal()],
    ['хранилища', () => app.openVaultModal()],
    ['логи', () => app.setIsLogViewerOpen(true)],
  ];
  return <main className="fixed inset-0 overflow-y-auto bg-canvas text-fg-primary p-5 sm:p-10">
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-16">
      <header><h1 className="text-xl font-semibold">ui playground</h1><p className="mt-2 text-sm text-fg-muted">временная песочница · настоящие компоненты · отдельные локальные данные</p><p className="mt-1 text-xs text-fg-muted">esc / крестик / фон — закрыть. настройки устройств и привязка — внутри настроек. реальные ключи сюда не вводи.</p></header>
      <section className="flex flex-col gap-3"><h2 className="text-xs text-fg-muted">тоасты</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button className={button} onClick={() => app.addToast('Настройки сохранены', 'success')}>успех</button>
        <button className={button} onClick={() => app.addToast('Не удалось проверить сервер: HTTP 503', 'error')}>ошибка</button>
        <button className={button} onClick={() => app.addToast('Синхронизация приостановлена', 'info')}>информация</button>
        <button className={button} onClick={() => app.addToast('Запись в корзине', 'info', { kind: 'undo', label: 'Отменить', onClick: () => app.addToast('Действие отменено', 'success') })}>с действием</button>
      </div><button className={button} onClick={() => app.addToast('Длинное сообщение: сервер временно недоступен. Данные сохранены локально, повторите попытку подключения позже.', 'error')}>длинный текст</button></section>
      <section className="flex flex-col gap-3"><h2 className="text-xs text-fg-muted">модалки</h2><div className="grid sm:grid-cols-2 gap-2">{samples.map(([label, onClick]) => <button key={label} className={button} onClick={onClick}>{label}</button>)}</div></section>
      <p className="text-xs text-fg-muted">для мобильного вида сузь окно или открой ссылку с телефона. свайпни тоаст, чтобы убрать; наведи мышь, чтобы задержать.</p>
    </div>
    <BaseModal isOpen={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'confirm' ? 'Удалить демозапись?' : 'Обычная модалка'} role={dialog === 'confirm' ? 'alertdialog' : 'dialog'} contentClassName="p-5" footer={<div className="flex justify-end gap-2"><button className={button} onClick={() => setDialog(null)}>отмена</button><button className={button} onClick={() => { setDialog(null); app.addToast('Демонстрационное действие выполнено', 'success'); }}>продолжить</button></div>}>
      <p className="text-sm text-fg-secondary">это демоданные. можно проверить вход, выход, затемнение фона и тоаст поверх модалки.</p>
      <button className={`${button} mt-4`} onClick={() => app.addToast('Тоаст поверх модалки', 'info')}>показать тоаст</button>
    </BaseModal>
    <SettingsModal /><SearchModal /><FolderModal /><FolderInfoModal /><FolderViewModal /><VaultModal /><ComposerModal /><LogModal /><ToastContainer />
  </main>;
}

createRoot(document.getElementById('root')!).render(isolated ? <AppProvider><Playground /></AppProvider> : <p>песочница доступна только на отдельном порту 5174</p>);
