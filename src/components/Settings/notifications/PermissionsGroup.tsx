// android only: показ поверх других приложений, будильник на весь экран и системные уведомления.
// ни одно из этих разрешений приложение не спрашивает диалогом — ос показывает только свой
// переключатель, поэтому строка сообщает состояние и открывает нужный экран. состояние
// перечитывается при возврате в приложение, а не по таймеру.
import React from 'react';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';
import { useDeviceAccess } from '../../../hooks/useDeviceAccess';
import { isAndroidApp, openDeviceAccessSettings } from '../../../lib/platform/deviceAccess';
import { logger } from '../../../lib/logger/logger';
import type { DeviceAccessTarget } from '../../../types';
import {
  DEVICE_ACCESS_ROWS,
  accessActionLabel,
  accessStateLabel,
  accessValue,
} from './accessCopy';

const accessLog = logger.scope('NOTIFY');

function openSettings(target: DeviceAccessTarget): void {
  void openDeviceAccessSettings(target).catch((cause: unknown) => {
    // A vendor build can ship without one of these screens; the row then keeps its old state.
    accessLog.warn('device access screen failed', { target, error: String(cause) });
  });
}

export const PermissionsGroup: React.FC = () => {
  const isAndroid = isAndroidApp();
  const status = useDeviceAccess(isAndroid);
  if (!isAndroid) return null;

  return (
    <SettingsGroup title="Разрешения android">
      {DEVICE_ACCESS_ROWS.map((row, index) => {
        const value = accessValue(status, row.target);
        return (
          <React.Fragment key={row.target}>
            {index > 0 && <SettingsDivider />}
            <SettingsRow
              label={row.label}
              testId={`access-${row.target}`}
              value={
                <span className="font-mono" data-testid={`access-${row.target}-state`}>
                  {accessStateLabel(value)}
                </span>
              }
              right={
                value === null ? undefined : (
                  <button
                    type="button"
                    onClick={() => openSettings(row.target)}
                    data-testid={`access-${row.target}-btn`}
                    className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover hover:text-fg-primary cursor-pointer"
                  >
                    {accessActionLabel(value)}
                  </button>
                )
              }
            />
          </React.Fragment>
        );
      })}
    </SettingsGroup>
  );
};
