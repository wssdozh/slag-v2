// Names and orders the settings sections once, so desktop and mobile cannot drift.
import { Database, Keyboard, Laptop, RefreshCw, Sliders, Sparkles, Terminal, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SettingsTabId = 'account' | 'sync' | 'devices' | 'vault' | 'ai' | 'ui' | 'shortcuts' | 'logs';

export interface SettingsTabDefinition {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
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
  { id: 'account', label: 'Аккаунт', icon: UserRound },
  { id: 'sync', label: 'Синхронизация', icon: RefreshCw },
  { id: 'devices', label: 'Устройства', icon: Laptop },
  { id: 'vault', label: 'Хранилище & Бэкап', icon: Database },
  { id: 'ai', label: 'ИИ & Провайдеры', icon: Sparkles },
  { id: 'ui', label: 'Интерфейс & Панели', icon: Sliders },
  { id: 'shortcuts', label: 'Горячие клавиши', icon: Keyboard },
  { id: 'logs', label: 'Логи & Диагностика', icon: Terminal },
];

export const settingsTabLabel = (id: SettingsTabId): string =>
  SETTINGS_TABS.find((tab) => tab.id === id)?.label ?? '';
