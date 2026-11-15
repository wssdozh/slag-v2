// Names and orders the settings sections once, so desktop and mobile cannot drift.
import type { IconName } from '../components/UI/icons/icons';

export type SettingsTabId =
  | 'account'
  | 'sync'
  | 'devices'
  | 'vault'
  | 'notifications'
  | 'integrations'
  | 'ai'
  | 'ui'
  | 'shortcuts'
  | 'updates'
  | 'logs';

export interface SettingsTabDefinition {
  id: SettingsTabId;
  label: string;
  icon: IconName;
}

/**
 * Единственная точка, где названы и упорядочены разделы настроек.
 *
 * Доска на десктопе, список на телефоне и хлебная крошка мобильной шапки
 * держали по своей копии подписей — и расходились («Устройства» против
 * «Устройства & Доступ»). Порядок — по частоте: сначала кто я и что с
 * синхронизацией, потом данные, потом внешний вид и диагностика.
 */
export const SETTINGS_TABS: readonly SettingsTabDefinition[] = [
  { id: 'account', label: 'Аккаунт', icon: 'entity.user' },
  { id: 'sync', label: 'Синхронизация', icon: 'system.sync' },
  { id: 'devices', label: 'Устройства', icon: 'entity.desktop' },
  { id: 'vault', label: 'Хранилище & Бэкап', icon: 'entity.vault' },
  { id: 'notifications', label: 'Уведомления', icon: 'system.notifications' },
  { id: 'integrations', label: 'Интеграции', icon: 'system.integrations' },
  { id: 'ai', label: 'ИИ & Провайдеры', icon: 'system.ai' },
  { id: 'ui', label: 'Интерфейс & Панели', icon: 'system.appearance' },
  { id: 'shortcuts', label: 'Горячие клавиши', icon: 'system.shortcuts' },
  { id: 'updates', label: 'Обновления', icon: 'system.update' },
  { id: 'logs', label: 'Логи & Диагностика', icon: 'system.logs' },
];

export const settingsTabLabel = (id: SettingsTabId): string =>
  SETTINGS_TABS.find((tab) => tab.id === id)?.label ?? '';
