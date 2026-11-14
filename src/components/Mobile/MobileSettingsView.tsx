// The phone settings tab: grouped rows, live sync status, and the vault switcher.
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { syncEngine } from '../../lib/sync/syncEngine';
import { accountClient } from '../../lib/sync/account';
import { navigatePage } from '../../lib/navigation';
import { acceptSharedVault } from '../../lib/sync/vaultSharing';
import { Database } from 'lucide-react';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import { SettingsGroup, SettingsRow, SettingsDivider } from '../Settings/SettingsUI';
import { ProfileCard } from '../Settings/ProfileCard';
import { SETTINGS_TABS } from '../../config/settingsTabs';

export const MobileSettingsView: React.FC = () => {
  const {
    vault,
    items,
    folders,
    openSettingsModal,
    createVault,
    switchVault,
    addToast
  } = useApp();

  const [acceptingVaultId, setAcceptingVaultId] = useState<string | null>(null);

  const [syncStatus, setSyncStatus] = useState(syncEngine.getStatus());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false);

  useEffect(() => syncEngine.subscribe(setSyncStatus), []);
  useEffect(() => accountClient.subscribe(setAccountState), []);

  const isLocked = syncStatus.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const planLabel = account?.planLabel || syncStatus.subscription.planLabel;
  const usedCacheMb = account?.usedCacheMb ?? syncStatus.subscription.usedCacheMb;
  const maxCacheMb = account?.maxCacheMb ?? syncStatus.subscription.maxCacheMb;
  const cacheLabel = maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`;

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

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* Корень настроек без верхней плашки: контент начинается сразу под статус-баром. */}
      <div
        data-testid="mobile-settings-root"
        className="flex-1 overflow-y-auto px-4 pb-36 flex flex-col gap-4"
        style={{ paddingTop: 'calc(max(var(--sat), 0px) + 1rem)' }}
      >
        {/* Аккаунт первым: в настройки заходят проверить его, а не папки. */}
        <SettingsGroup className="pt-5">
          <ProfileCard
            planLabel={isLocked ? 'Войти · синхронизация и облачный ИИ' : `Тариф ${planLabel} · кеш ${usedCacheMb} МБ из ${cacheLabel}`}
          />
          <SettingsDivider />
          <SettingsRow
            label={isLocked ? 'SLAG ID' : 'Личный кабинет'}
            testId={isLocked ? 'mobile-settings-login-btn' : 'mobile-settings-account-btn'}
            onClick={() => navigatePage('account')}
            chevron
          />
        </SettingsGroup>

        <SettingsGroup className="pt-5">
          <SettingsRow
            icon={<Database className="w-4 h-4" />}
            label={vault.name || 'SLAG Vault'}
            value={<span className="font-mono">{folders.length} • {items.length}</span>}
            testId="mobile-vault-row"
            onClick={() => setIsVaultSwitcherOpen(true)}
            chevron
          />
        </SettingsGroup>
        <VaultSwitcherMenu isOpen={isVaultSwitcherOpen} onClose={() => setIsVaultSwitcherOpen(false)} variant="sheet" />

        {accountState.invitations.length > 0 && (
          <SettingsGroup className="pt-5">
            {accountState.invitations.map((inv, index) => (
              <React.Fragment key={inv.vaultId}>
                {index > 0 && <SettingsDivider />}
                <SettingsRow icon={<Database className="w-4 h-4" />} label={inv.vaultName || inv.vaultId} description={inv.mode === 'receive-only' ? 'Только чтение' : 'Полный доступ'} right={
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => void handleDeclineInvitation(inv.vaultId)} className="px-2 py-1.5 text-2xs text-fg-muted cursor-pointer">Скрыть</button>
                    <button type="button" disabled={acceptingVaultId !== null} onClick={() => void handleAcceptInvitation(inv.vaultId)} className="px-2 py-1.5 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{acceptingVaultId === inv.vaultId ? 'подключаем…' : 'Принять'}</button>
                  </span>
                } />
              </React.Fragment>
            ))}
          </SettingsGroup>
        )}

        <SettingsGroup className="pt-5">
          {SETTINGS_TABS.filter((tab) => tab.id !== 'account').map((tab, index) => {
            const TabIcon = tab.icon;
            return (
              <React.Fragment key={tab.id}>
                {index > 0 && <SettingsDivider inset />}
                <SettingsRow icon={<TabIcon className="w-4 h-4" />} label={tab.label} testId={`mobile-settings-${tab.id}`} onClick={() => openSettingsModal(tab.id)} chevron />
              </React.Fragment>
            );
          })}
        </SettingsGroup>

        {/* Version info footer */}
        <div className="text-center text-xs text-fg-dim font-mono py-2">
          SLAG v2.0 • Local-First Minimal Notes
        </div>
      </div>
    </div>
  );
};
