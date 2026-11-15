// The Android permission rows: which grant each row speaks about and the words its state maps to.
// Pure on purpose (no tauri, no react) so the mapping can be checked without a device.
import type { DeviceAccessStatus, DeviceAccessTarget } from '../../../types';

export interface DeviceAccessRow {
  target: DeviceAccessTarget;
  label: string;
  description: string;
}

export const DEVICE_ACCESS_ROWS: DeviceAccessRow[] = [
  {
    target: 'overlay',
    label: 'показ поверх других приложений',
    description: 'напоминание и будильник всплывают поверх другого приложения, а не ждут в шторке',
  },
  {
    target: 'fullScreen',
    label: 'будильники поверх экрана',
    description: 'android 14+: будильник занимает экран целиком, а не строкой в шторке',
  },
  {
    target: 'notifications',
    label: 'уведомления',
    description: 'система вообще показывает уведомления этого приложения',
  },
];

/** The status field for a row; null until the first probe answers. */
export function accessValue(
  status: DeviceAccessStatus | null,
  target: DeviceAccessTarget
): boolean | null {
  if (!status) return null;
  if (target === 'overlay') return status.overlay;
  if (target === 'notifications') return status.notifications;
  return status.fullScreenIntent;
}

export function accessStateLabel(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'разрешено' : 'не разрешено';
}

/** Allowed means there is nothing to ask for; the button only takes a look at the switch. */
export function accessActionLabel(value: boolean | null): string {
  return value === false ? 'разрешить' : 'настройки';
}
