// уведомления этого устройства: что приходит, тихие часы и проверка системного тоста.
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getNotifyPrefs, saveNotifyPrefs } from '../../lib/notify/prefs';
import { sendLocalNotification } from '../../lib/notify/plan';
import type { NotifyPrefs } from '../../types';
import { ContentGroup } from './notifications/ContentGroup';
import { PermissionsGroup } from './notifications/PermissionsGroup';
import { QuietHoursGroup } from './notifications/QuietHoursGroup';
import { SystemGroup } from './notifications/SystemGroup';

/** что устройство показывает само, пока молчит телеграм: напоминания, тихие часы, проверка. */
export const NotificationsSettingsTab: React.FC = () => {
  const { addToast } = useApp();
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs());

  const patchPrefs = (next: Partial<NotifyPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotifyPrefs(merged);
  };

  const handleTest = async () => {
    const result = await sendLocalNotification('slag', 'уведомления работают');
    if (result === 'sent') addToast('уведомление отправлено', 'success');
    else if (result === 'denied') addToast('система не разрешает уведомления: включи их в настройках ос', 'error');
    else addToast('в браузере системных уведомлений нет: работают в приложении', 'info');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Android draws its own settings screen for these; the group renders nothing elsewhere. */}
      <PermissionsGroup />

      <ContentGroup
        tasks={prefs.tasks}
        overdue={prefs.overdue}
        onTasksChange={(value) => patchPrefs({ tasks: value })}
        onOverdueChange={(value) => patchPrefs({ overdue: value })}
      />

      <QuietHoursGroup
        quietFrom={prefs.quietFrom}
        quietTo={prefs.quietTo}
        onQuietFromChange={(value) => patchPrefs({ quietFrom: value })}
        onQuietToChange={(value) => patchPrefs({ quietTo: value })}
      />

      <SystemGroup onTest={() => void handleTest()} />
    </div>
  );
};
