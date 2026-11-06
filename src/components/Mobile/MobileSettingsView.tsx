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
  ChevronRight,
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
        {/* Profile / Vault Card (Horizontal, Compact, Clickable to open Vault Switcher) */}
        <button
          type="button"
          onClick={() => setIsVaultSwitcherOpen(true)}
          className="w-full flex items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-surface/80 border border-white/[0.06] shadow-sm hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white text-base font-bold font-mono shrink-0 shadow-inner">
              {vault.name ? vault.name.slice(0, 2).toUpperCase() : 'SL'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight truncate">{vault.name || 'SLAG Vault'}</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.06] text-[10px] font-mono shrink-0">
                  <Shield className="w-2.5 h-2.5" />
                  <span>Obsidian</span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                {folders.length} {folders.length === 1 ? 'папка' : folders.length < 5 ? 'папки' : 'папок'} • {items.length} {items.length === 1 ? 'запись' : items.length < 5 ? 'записи' : 'записей'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
        </button>

        <VaultSwitcherMenu
          isOpen={isVaultSwitcherOpen}
          onClose={() => setIsVaultSwitcherOpen(false)}
          variant="sheet"
        />

        {/* Pending Vault Invitations */}
        {accountState.invitations.length > 0 && (
          <div className="flex flex-col gap-2">
            {accountState.invitations.map((inv) => (
              <div
                key={inv.vaultId}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-emerald-500/30 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-2xs font-mono text-emerald-400 uppercase tracking-wider">Приглашение в хранилище</div>
                  <div className="text-xs font-semibold text-white truncate mt-0.5">{inv.vaultName || inv.vaultId}</div>
                  <div className="text-2xs text-zinc-500">{inv.mode === 'receive-only' ? 'Только чтение' : 'Полный доступ'}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDeclineInvitation(inv.vaultId)}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Скрыть
                  </button>
                  <button
                    type="button"
                    disabled={acceptingVaultId !== null}
                    onClick={() => void handleAcceptInvitation(inv.vaultId)}
                    className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 cursor-pointer motion-press"
                  >
                    {acceptingVaultId === inv.vaultId ? 'подключаем…' : 'Принять'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SLAG ID Banner (When not logged in) */}
        {isLocked && (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface/80 border border-white/[0.06] shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white shrink-0">
                <Shield className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white tracking-tight">SLAG ID</div>
                <div className="text-2xs text-zinc-400 mt-0.5 truncate">Синхронизация и облачный ИИ</div>
              </div>
            </div>
            <button
              type="button"
              data-testid="mobile-settings-login-btn"
              onClick={() => navigatePage('account')}
              className="h-ctrl-sm px-3.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 cursor-pointer shrink-0 motion-press"
            >
              Войти
            </button>
          </div>
        )}

        {!isLocked && account && (
          <div
            onClick={() => navigatePage('account')}
            className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface/60 border border-white/[0.05] hover:bg-surface/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{account.planLabel || 'SLAG ID'}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">Аккаунт подключен</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </div>
        )}

        {/* Group 1: Quick Settings Navigation (Opens specific tab in SettingsModal) */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            Параметры
          </div>
          <div className="rounded-2xl bg-surface/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => openSettingsModal('ai')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">ИИ & Провайдеры</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('vault')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Database className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Хранилище & Бэкап</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('devices')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Laptop className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Устройства & Доступ</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('sync')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Синхронизация & Сервер</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('ui')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Интерфейс, масштаб и плотность</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('shortcuts')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Горячие клавиши</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Group 2: Dock Customization & Drag Ordering (Clean Vertical List, Zero Blue) */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
            <span>Нижняя панель (Dock)</span>
            <button
              onClick={() => setMobileDockTabs(['folders', 'tasks', 'assistant', 'settings'])}
              className="text-zinc-500 hover:text-white flex items-center gap-1 cursor-pointer text-[10px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          </div>

          <div
            className="rounded-2xl bg-surface/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]"
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
                      ? 'bg-white/[0.08] opacity-60'
                      : 'hover:bg-white/[0.02] active:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing p-0.5 shrink-0">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 text-zinc-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-200 truncate">
                      {tab.label}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDockTab(tab.id);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Отключить"
                    aria-label={`Отключить ${tab.label}`}
                  >
                    <Check className="w-4 h-4 text-white" />
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
                  className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors cursor-pointer select-none opacity-50 hover:opacity-90"
                  role="button"
                  tabIndex={0}
                  aria-label={`Добавить ${tab.label}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 shrink-0" />
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 text-zinc-500">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium text-zinc-400 truncate">
                      {tab.label}
                    </span>
                  </div>

                  <div className="p-1 text-zinc-500">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Group 3: Diagnostics & HUD */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            Отладка & Диагностика
          </div>
          <div className="rounded-2xl bg-surface/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => setIsLogViewerOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Логи & Dev HUD</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Version info footer */}
        <div className="text-center text-xs text-zinc-600 font-mono py-2">
          SLAG v2.0 • Local-First Minimal Notes
        </div>
      </div>
    </div>
  );
};
