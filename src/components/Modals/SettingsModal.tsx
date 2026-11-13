// The settings shell: a rail of tabs, the mobile and desktop frames, and the pinned footer.
import React, { useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { Settings, X, ArrowLeft } from 'lucide-react';
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

  const settingsBody = (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* Tabs Nav: Horizontal scroll on mobile, vertical left column on desktop */}
      <div
        ref={tabsRef}
        className="flex md:flex-col overflow-x-auto md:overflow-visible md:w-48 border-b md:border-b-0 md:border-r border-border-subtle bg-panel p-2 gap-1 select-none shrink-0 scrollbar-none"
      >
        {SETTINGS_TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              data-tab={tab.id}
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
                activeTab === tab.id
                  ? 'bg-surface-active text-fg-primary font-medium'
                  : 'text-fg-muted hover:text-fg-primary hover:bg-surface-hover'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Tab Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-panel">
        <div key={activeTab} className="flex-1 overflow-y-auto p-4 pb-8 sm:pb-4 motion-fade motion-settings-tab">
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
        </div>

        {/* Only the AI tab has something to commit; every other tab closes from the header. */}
        {activeTab === 'ai' && (
          <div
            className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-panel shrink-0"
            style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
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

        {/* Form Body */}
        {settingsBody}
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
      {/* Top Header */}
      <div
        className="px-4 md:px-5 py-3 border-b border-border-subtle flex items-center justify-between shrink-0 bg-panel"
        style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 items-center justify-center text-fg-muted hidden md:flex">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-fg-primary">
            Настройки
          </h3>
        </div>
        <button
          onClick={() => setIsSettingsOpen(false)}
          className="p-1 rounded text-fg-dim hover:text-fg-primary hover:bg-surface-hover transition-colors hidden md:block cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {settingsBody}
    </BaseModal>
  );
};
