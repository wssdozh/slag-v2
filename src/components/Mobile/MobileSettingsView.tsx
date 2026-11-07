import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { MobileTabId } from '../../types';
import { syncEngine } from '../../lib/sync/syncEngine';
import { accountClient } from '../../lib/sync/account';
import { navigatePage } from '../../lib/navigation';
import { acceptSharedVault } from '../../lib/sync/vaultSharing';
import {
  Sparkles,
  Database,
  Terminal,
  Shield,
  Folder,
  CheckSquare,
  Calendar,
  Music,
  Settings as SettingsIcon,
  RotateCcw,
  Check,
  Plus,
  GripVertical,
  Sliders,
  Keyboard,
  Laptop
} from 'lucide-react';
import { MobileScreenHeader } from './MobileScreenHeader';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import { SettingsGroup, SettingsRow, SettingsDivider } from '../Settings/SettingsUI';

const ALL_AVAILABLE_TABS: { id: MobileTabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'folders', label: 'Папки', icon: Folder },
  { id: 'tasks', label: 'Таски', icon: CheckSquare },
  { id: 'assistant', label: 'ИИ', icon: Sparkles },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  { id: 'calendar', label: 'Календарь', icon: Calendar },
  { id: 'audio', label: 'Плеер', icon: Music },
];

export const MobileSettingsView: React.FC = () => {
  const {
    vault,
    items,
    folders,
    openSettingsModal,
    createVault,
    switchVault,
    setIsLogViewerOpen,
    mobileDockTabs,
    setMobileDockTabs,
    addToast
  } = useApp();

  const [acceptingVaultId, setAcceptingVaultId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const touchDragRef = useRef<{ startIndex: number } | null>(null);

  const [syncStatus, setSyncStatus] = useState(syncEngine.getStatus());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false);

  useEffect(() => syncEngine.subscribe(setSyncStatus), []);
  useEffect(() => accountClient.subscribe(setAccountState), []);

  const isLocked = syncStatus.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;

  const handleAcceptInvitation = async (vaultId: string) => {
    const invitation = accountState.invitations.find((item) => item.vaultId === vaultId);
    if (!invitation || acceptingVaultId) return;
    setAcceptingVaultId(vaultId);
    try {
      const result = await acceptSharedVault({
        vaultId,
        vaultName: invitation.vaultName || vaultId,
        encryptedKey: invitation.encryptedKey,
      }, syncEngine.getConfig().deviceId, { createVault, switchVault });
      addToast(
        `${result === 'merged' ? 'Хранилище объединено' : 'Хранилище добавлено'}: «${invitation.vaultName || vaultId}»`,
        'success',
      );
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setAcceptingVaultId(null);
    }
  };

  const handleDeclineInvitation = async (vaultId: string) => {
    try {
      await accountClient.declineVault(vaultId);
      addToast('Приглашение скрыто', 'info');
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const activeTabs = mobileDockTabs
    .map(id => ALL_AVAILABLE_TABS.find(t => t.id === id))
    .filter((t): t is typeof ALL_AVAILABLE_TABS[number] => Boolean(t));

  const inactiveTabs = ALL_AVAILABLE_TABS.filter(t => !mobileDockTabs.includes(t.id));

  const handleDragStart = (_e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const nextTabs = [...mobileDockTabs];
    const [removed] = nextTabs.splice(draggedIndex, 1);
    nextTabs.splice(index, 0, removed);
    setDraggedIndex(index);
    setMobileDockTabs(nextTabs);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleTouchStart = (idx: number) => {
    touchDragRef.current = { startIndex: idx };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-dock-tab-index]');
    if (targetEl) {
      const overIdx = Number(targetEl.dataset.dockTabIndex);
      if (!isNaN(overIdx) && overIdx !== touchDragRef.current.startIndex) {
        const nextTabs = [...mobileDockTabs];
        const [moved] = nextTabs.splice(touchDragRef.current.startIndex, 1);
        nextTabs.splice(overIdx, 0, moved);
        touchDragRef.current.startIndex = overIdx;
        setMobileDockTabs(nextTabs);
      }
    }
  };

  const handleTouchEnd = () => {
    touchDragRef.current = null;
  };

  const toggleDockTab = (tabId: MobileTabId) => {
    if (mobileDockTabs.includes(tabId)) {
      if (mobileDockTabs.length <= 2) {
        addToast('Минимум 2 вкладки в панели', 'error');
        return;
      }
      setMobileDockTabs(mobileDockTabs.filter(id => id !== tabId));
    } else {
      if (mobileDockTabs.length >= 5) {
        addToast('Максимум 5 вкладок в панели', 'error');
        return;
      }
      setMobileDockTabs([...mobileDockTabs, tabId]);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* Top Header */}
      <MobileScreenHeader
        title="Настройки"
        icon={<SettingsIcon className="w-3.5 h-3.5" />}
      />

      {/* Main Settings List (Matching iOS/Telegram grouped style) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 pb-36">
        <SettingsGroup title="Хранилище">
          <SettingsRow icon={<Database className="w-4 h-4" />} label={vault.name || 'SLAG Vault'} description={`${folders.length} ${folders.length === 1 ? 'папка' : folders.length < 5 ? 'папки' : 'папок'} · ${items.length} ${items.length === 1 ? 'запись' : items.length < 5 ? 'записи' : 'записей'}`} value="Obsidian" onClick={() => setIsVaultSwitcherOpen(true)} chevron />
        </SettingsGroup>
        <VaultSwitcherMenu isOpen={isVaultSwitcherOpen} onClose={() => setIsVaultSwitcherOpen(false)} variant="sheet" />

        {accountState.invitations.length > 0 && (
          <SettingsGroup title="Приглашения в хранилища">
            {accountState.invitations.map((inv, index) => (
              <React.Fragment key={inv.vaultId}>
                {index > 0 && <SettingsDivider />}
                <SettingsRow label={inv.vaultName || inv.vaultId} description={inv.mode === 'receive-only' ? 'Только чтение' : 'Полный доступ'} right={
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => void handleDeclineInvitation(inv.vaultId)} className="px-2 py-1.5 text-2xs text-fg-muted cursor-pointer">Скрыть</button>
                    <button type="button" disabled={acceptingVaultId !== null} onClick={() => void handleAcceptInvitation(inv.vaultId)} className="px-2 py-1.5 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{acceptingVaultId === inv.vaultId ? 'подключаем…' : 'Принять'}</button>
                  </span>
                } />
              </React.Fragment>
            ))}
          </SettingsGroup>
        )}
        {isLocked && (
          <SettingsGroup title="Аккаунт">
            <SettingsRow icon={<Shield className="w-4 h-4" />} label="SLAG ID" description="Синхронизация и облачный ИИ" right={<button type="button" data-testid="mobile-settings-login-btn" onClick={() => navigatePage('account')} className="px-3 py-1.5 text-xs text-fg-primary rounded-md hover:bg-surface-hover cursor-pointer">Войти</button>} />
          </SettingsGroup>
        )}
        {!isLocked && account && (
          <SettingsGroup title="Аккаунт"><SettingsRow icon={<Shield className="w-4 h-4" />} label={account.planLabel || 'SLAG ID'} description="Аккаунт подключен" onClick={() => navigatePage('account')} chevron /></SettingsGroup>
        )}
        <SettingsGroup title="Параметры">
          <SettingsRow icon={<Sparkles className="w-4 h-4" />} label="ИИ & Провайдеры" onClick={() => openSettingsModal('ai')} chevron />
          <SettingsDivider inset />
          <SettingsRow icon={<Database className="w-4 h-4" />} label="Хранилище & Бэкап" onClick={() => openSettingsModal('vault')} chevron />
          <SettingsDivider inset />
          <SettingsRow icon={<Laptop className="w-4 h-4" />} label="Устройства & Доступ" onClick={() => openSettingsModal('devices')} chevron />
          <SettingsDivider inset />
          <SettingsRow icon={<RotateCcw className="w-4 h-4" />} label="Синхронизация & Сервер" onClick={() => openSettingsModal('sync')} chevron />
          <SettingsDivider inset />
          <SettingsRow icon={<Sliders className="w-4 h-4" />} label="Интерфейс, масштаб и плотность" onClick={() => openSettingsModal('ui')} chevron />
          <SettingsDivider inset />
          <SettingsRow icon={<Keyboard className="w-4 h-4" />} label="Горячие клавиши" onClick={() => openSettingsModal('shortcuts')} chevron />
        </SettingsGroup>

        <SettingsGroup title="Нижняя панель (Dock)" action={
          <button type="button" onClick={() => setMobileDockTabs(['folders', 'tasks', 'assistant', 'settings'])} className="flex items-center gap-1 text-2xs text-fg-muted hover:text-fg-primary cursor-pointer"><RotateCcw className="w-3 h-3" />Сбросить</button>
        }>
          <div
            className="divide-y divide-border-subtle"
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Active Tabs (Reorderable Vertical Rows with Grip & Checkmark) */}
            {activeTabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isDragging = draggedIndex === idx;

              return (
                <div
                  key={tab.id}
                  data-dock-tab-index={idx}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={() => handleTouchStart(idx)}
                  className={`w-full flex items-center justify-between p-3.5 transition-colors select-none ${
                    isDragging
                      ? 'bg-surface-active opacity-60'
                      : 'hover:bg-surface-hover active:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-fg-muted hover:text-fg-secondary cursor-grab active:cursor-grabbing p-0.5 shrink-0">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 text-fg-secondary">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-fg-primary truncate">
                      {tab.label}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDockTab(tab.id);
                    }}
                    className="p-1 rounded text-fg-secondary hover:text-fg-primary transition-colors cursor-pointer"
                    title="Отключить"
                    aria-label={`Отключить ${tab.label}`}
                  >
                    <Check className="w-4 h-4 text-fg-primary" />
                  </button>
                </div>
              );
            })}

            {/* Inactive Tabs ("вниз без галочек", with + icon) */}
            {inactiveTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <div
                  key={tab.id}
                  onClick={() => toggleDockTab(tab.id)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer select-none opacity-50 hover:opacity-90"
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleDockTab(tab.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Добавить ${tab.label}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 shrink-0" />
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 text-fg-muted">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium text-fg-secondary truncate">
                      {tab.label}
                    </span>
                  </div>

                  <div className="p-1 text-fg-muted">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Отладка & Диагностика">
          <SettingsRow icon={<Terminal className="w-4 h-4" />} label="Логи & Dev HUD" onClick={() => setIsLogViewerOpen(true)} chevron />
        </SettingsGroup>

        {/* Version info footer */}
        <div className="text-center text-xs text-fg-dim font-mono py-2">
          SLAG v2.0 • Local-First Minimal Notes
        </div>
      </div>
    </div>
  );
};
