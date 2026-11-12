// The hotkey catalogue, rendered from the same table the keydown handler reads.
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getPlatformInfo,
  setupSystemHotkey,
  removeSystemHotkey,
  type PlatformInfo,
} from '../../lib/platform';
import { APP_COMMANDS, formatShortcut } from '../../lib/commands';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

export const ShortcutsSettingsTab: React.FC = () => {
  const { isSettingsOpen, settingsTab, addToast, isMobile } = useApp();
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [isUpdatingHotkey, setIsUpdatingHotkey] = useState(false);

  useEffect(() => {
    if (isSettingsOpen && settingsTab === 'shortcuts') {
      void getPlatformInfo().then(setPlatformInfo);
    }
  }, [isSettingsOpen, settingsTab]);

  const handleSetupHotkey = async () => {
    setIsUpdatingHotkey(true);
    try {
      const updated = await setupSystemHotkey();
      if (updated) {
        setPlatformInfo(updated);
        addToast('Системный хоткей успешно привязан!', 'success');
      }
    } catch {
      addToast('Не удалось привязать хоткей', 'error');
    } finally {
      setIsUpdatingHotkey(false);
    }
  };

  const handleRemoveHotkey = async () => {
    setIsUpdatingHotkey(true);
    try {
      const updated = await removeSystemHotkey();
      if (updated) {
        setPlatformInfo(updated);
        addToast('Системный хоткей отключен', 'info');
      }
    } catch {
      addToast('Не удалось отключить хоткей', 'error');
    } finally {
      setIsUpdatingHotkey(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* System-level OS Integration Card (Desktop Only) */}
      {!isMobile && platformInfo && (
        <SettingsGroup title="Глобальный вызов в операционной системе">
          <SettingsRow label="Системный хоткей" value={platformInfo.shortcut} description={platformInfo.details} />
          <SettingsDivider />
          <SettingsRow label="Окружение" value={`${platformInfo.os} · ${platformInfo.desktopEnvironment} (${platformInfo.sessionType})`} />
          {platformInfo.hotkeyBackend === 'gnome_gsettings' && (
            <>
              <SettingsDivider />
              <SettingsRow label={platformInfo.isHotkeyRegistered ? 'Актуализировать путь' : 'Привязать хоткей в GNOME'} disabled={isUpdatingHotkey} onClick={() => void handleSetupHotkey()} />
              {platformInfo.isHotkeyRegistered && <><SettingsDivider /><SettingsRow label="Отвязать" danger disabled={isUpdatingHotkey} onClick={() => void handleRemoveHotkey()} /></>}
            </>
          )}
          {platformInfo.hotkeyBackend === 'custom_launcher' && (
            <><SettingsDivider /><SettingsRow label="Команда запуска" value={<code className="select-all">{platformInfo.executablePath} --quick</code>} /></>
          )}
        </SettingsGroup>
      )}

      <SettingsGroup title="Глобальные команды и шорткаты">
        {APP_COMMANDS.filter(c => c.shortcut).map((cmd, index) => (
          <React.Fragment key={cmd.id}>
            {index > 0 && <SettingsDivider />}
            <SettingsRow label={cmd.title} value={<kbd className="font-mono">{[cmd.shortcut, ...(cmd.aliases || [])].filter(Boolean).map(shortcut => formatShortcut(shortcut!)).join(' / ')}</kbd>} />
          </React.Fragment>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Редактор, модальные окна и ввод">
        {[
          ['Сохранить запись (редактор)', formatShortcut('mod+s')],
          ['Применить AI Diff', formatShortcut('mod+enter')],
          ['Отправить', isMobile ? 'кнопка ↑' : 'Enter'],
          ['Перенос строки', isMobile ? 'Enter' : 'Shift + Enter'],
          ['Закрыть окно / Esc', 'Esc'],
          ['Контекстное меню', 'ПКМ'],
        ].map(([label, shortcut], index) => (
          <React.Fragment key={label}>
            {index > 0 && <SettingsDivider />}
            <SettingsRow label={label} value={<kbd className="font-mono">{shortcut}</kbd>} />
          </React.Fragment>
        ))}
      </SettingsGroup>
    </div>
  );
};
