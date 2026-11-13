// The settings shell: a rail of tabs, the mobile and desktop frames, and the pinned footer.
import React, { useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { X, ArrowLeft } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { AccountSettingsTab } from '../Settings/AccountSettingsTab';
import { SyncSettingsTab } from '../Settings/SyncSettingsTab';
import { DevicesSettingsTab } from '../Settings/DevicesSettingsTab';
import { NotificationsSettingsTab } from '../Settings/NotificationsSettingsTab';
import { AiSettingsTab } from '../Settings/AiSettingsTab';
import { VaultSettingsTab } from '../Settings/VaultSettingsTab';
import { UiSettingsTab } from '../Settings/UiSettingsTab';
import { ShortcutsSettingsTab } from '../Settings/ShortcutsSettingsTab';
import { LogsSettingsTab } from '../Settings/LogsSettingsTab';
import { SETTINGS_TABS, settingsTabLabel } from '../../config/settingsTabs';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab: activeTab,
    setSettingsTab: setActiveTab,
    isMobile,
  } = useApp();

  const presence = usePresence(isSettingsOpen);
  const { ref: presenceRef, phase: presencePhase, isPresent: isSettingsPresent, onTransitionEnd: onSettingsTransitionEnd } = presence;

  // Держим активную вкладку видимой: при возврате в настройки полоса оставалась
  // на прежней позиции, и выбранный раздел оказывался за правым краем.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSettingsOpen) return;
    const box = tabsRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2 });
  }, [activeTab, isSettingsOpen]);

  // Both branches keep their DOM through the exit: the phone overlay used to
  // unmount the moment it closed, so it had no exit at all.
  if (!isSettingsPresent) return null;

  // On a desktop the rail sits one tone brighter than the pane, the way a file manager
  // keeps its sidebar a step lighter than the folder view; the tone does the separating,
  // so there is no divider between them. A phone keeps the original strip: it is a bar
  // above the content, not a column beside it, and there the divider still reads.
  const tabRail = (
    <div
      ref={tabsRef}
      className="flex md:flex-col overflow-x-auto md:overflow-y-auto md:overflow-x-hidden md:w-48 shrink-0 bg-panel md:bg-surface p-2 gap-1 md:gap-0.5 border-b md:border-b-0 border-border-subtle select-none scrollbar-none"
    >
      {SETTINGS_TABS.map((tab) => {
        const TabIcon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-tab={tab.id}
            data-testid={`settings-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 flex items-center gap-2 md:gap-2.5 px-3 md:px-2.5 py-1.5 md:py-2 rounded-xl md:rounded-lg text-xs text-left whitespace-nowrap cursor-pointer motion-press ${
              isActive
                ? 'bg-surface-active text-fg-primary font-medium'
                : 'text-fg-muted hover:text-fg-primary hover:bg-surface-hover'
            }`}
          >
            <TabIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-fg-muted shrink-0" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const tabPane = (
    <div key={activeTab} className="flex-1 min-h-0 overflow-y-auto p-4 pb-8 sm:p-5 sm:pb-5 motion-fade motion-settings-tab">
      {activeTab === 'account' && (
        <AccountSettingsTab />
      )}

      {activeTab === 'ai' && (
        <AiSettingsTab />
      )}

      {activeTab === 'vault' && (
        <VaultSettingsTab />
      )}

      {activeTab === 'devices' && (
        <DevicesSettingsTab />
      )}

      {activeTab === 'sync' && (
        <SyncSettingsTab />
      )}

      {activeTab === 'notifications' && (
        <NotificationsSettingsTab />
      )}

      {activeTab === 'ui' && (
        <UiSettingsTab />
      )}

      {activeTab === 'shortcuts' && (
        <ShortcutsSettingsTab />
      )}

      {activeTab === 'logs' && (
        <LogsSettingsTab />
      )}

      {/* Only the AI tab has something to commit; every other tab closes from the header. */}
      {activeTab === 'ai' && (
        <div
          className="flex justify-end pt-4"
          style={{ paddingBottom: 'max(var(--sab), 0rem)' }}
        >
          <button
            type="submit"
            form="ai-settings-form"
            className="px-4 py-1.5 rounded-md bg-fg-primary text-canvas font-semibold text-xs hover:bg-fg-secondary transition-colors cursor-pointer shadow-sm motion-press"
          >
            Сохранить
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div
        ref={presenceRef}
        role="dialog"
        aria-modal="true"
        aria-label="Настройки"
        data-motion-state={presencePhase}
        onTransitionEnd={onSettingsTransitionEnd}
        className="fixed inset-0 z-50 bg-canvas flex flex-col select-none motion-fade motion-screen overflow-hidden"
      >
        {/* Top Header */}
        <div
          className="px-4 py-3 border-b border-border-subtle flex items-center justify-between shrink-0 bg-panel"
          style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1.5 -ml-1 text-fg-muted hover:text-fg-primary cursor-pointer motion-press"
              title="Назад"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-semibold text-fg-primary">
              Настройки
              <span className="text-fg-dim font-normal ml-2">
                / {settingsTabLabel(activeTab)}
              </span>
            </h3>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {tabRail}
          {tabPane}
        </div>
      </div>
    );
  }

  return (
    <BaseModal
      presence={presence}
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      hideHeader
      maxWidth="md:max-w-[740px]"
      maxHeight="h-full md:h-[720px] md:max-h-[88vh]"
      contentClassName="flex flex-col h-full overflow-hidden"
      containerClassName="rounded-none md:rounded-2xl border-0 md:border md:border-border-subtle"
    >
      <div className="flex flex-1 min-h-0">
        {tabRail}

        <div className="flex-1 flex flex-col min-h-0 bg-panel">
          {/* The pane keeps its own header: the rail runs the full height, so the
              wordmark is the only thing that would otherwise start under it. */}
          <div
            className="px-5 h-12 flex items-center justify-between shrink-0"
            style={{ paddingTop: 'max(var(--sat), 0rem)' }}
          >
            <h3 className="text-sm font-semibold text-fg-primary">
              Настройки
            </h3>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded text-fg-dim hover:text-fg-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {tabPane}
        </div>
      </div>
    </BaseModal>
  );
};
