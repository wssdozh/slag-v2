// The sidebar shows saved comparison data; it never infers device presence from a manifest.
import { useId, useState } from 'react';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncStatus } from '../../lib/sync/types';
import { Icon } from '../UI/icons/Icon';
import { syncGlyph } from './syncGlyph';

export function SyncStatusButton({ status, vaultId, onSettings }: {
  status: SyncStatus;
  vaultId?: string;
  onSettings: () => void;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const config = syncEngine.getConfig();
  const glyph = syncGlyph(status, config.enabled);
  const manifest = status.manifest;
  const peers = manifest?.peers.filter((peer) => !peer.anonymous) ?? [];
  const devices = new Map(config.trustedDevices.filter((device) =>
    device.id !== config.deviceId && !device.isCurrent && (!device.allowedVaults || (vaultId && device.allowedVaults.includes(vaultId))),
  ).map((device) => [device.id, device.name]));
  const hasLegacyReport = manifest?.peers.some((peer) => peer.anonymous);
  for (const peer of peers) {
    if (peer.deviceId && !devices.has(peer.deviceId)) {
      devices.set(peer.deviceId, config.trustedDevices.find((device) => device.id === peer.deviceId)?.name ?? peer.deviceId);
    }
  }

  return (
    <div
      className="group/sync static shrink-0"
      onMouseEnter={() => setDismissed(false)}
      onFocus={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(false); }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || dismissed) return;
        event.stopPropagation();
        event.currentTarget.querySelector('button')?.focus();
        setDismissed(true);
      }}
    >
      <button
        type="button"
        aria-label={`Состояние синхронизации: ${glyph.title}`}
        aria-controls={id}
        data-testid="sidebar-sync-btn"
        data-sync-state={status.state}
        onClick={(event) => { event.currentTarget.focus(); setDismissed(false); }}
        className="rounded p-1.5 hover:bg-tint-6 focus-visible:bg-tint-8 cursor-pointer"
      >
        <Icon name={glyph.name} size="md" tone="inherit" className={glyph.className} />
      </button>
      <section
        id={id}
        aria-label="Состояние синхронизации"
        data-testid="sidebar-sync-status"
        className={`pointer-events-none invisible absolute inset-x-2 bottom-[calc(100%-0.5rem)] z-30 pb-2 opacity-0 transition-[opacity,visibility] duration-150 ease-in motion-reduce:transition-none ${dismissed ? '' : 'group-hover/sync:pointer-events-auto group-hover/sync:visible group-hover/sync:opacity-100 group-hover/sync:ease-out group-focus-within/sync:pointer-events-auto group-focus-within/sync:visible group-focus-within/sync:opacity-100 group-focus-within/sync:ease-out'}`}
      >
        <div className={`translate-y-1.5 rounded-lg border border-border-subtle bg-surface-elevated p-2.5 text-xs shadow-xl transition-[translate] duration-150 ease-in motion-reduce:translate-y-0 motion-reduce:transition-none ${dismissed ? '' : 'group-hover/sync:translate-y-0 group-hover/sync:ease-out group-focus-within/sync:translate-y-0 group-focus-within/sync:ease-out'}`}>
          <div className={`font-medium ${glyph.className}`}>{glyph.title}</div>
          {status.initialSync.state === 'loading' && <p className="mt-1 text-fg-secondary">Первичная загрузка</p>}
          {status.lastSyncTime && <p className="mt-1 text-fg-muted">Последний обмен: {status.lastSyncTime}</p>}
          {devices.size > 0 && (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto border-t border-border-subtle pt-2">
              {[...devices].map(([deviceId, name]) => {
                const peer = peers.find((candidate) => candidate.deviceId === deviceId);
                return (
                  <li key={deviceId} className="min-w-0">
                    <div className="truncate font-medium text-fg-primary" title={name}>{name}</div>
                    <div className="text-fg-secondary">{peer ? (peer.inSync ? 'Копии совпадали' : 'Копии различались') : 'Нет сохранённой сводки'}</div>
                    {peer?.at != null && <div className="text-fg-muted">Сводка: {new Date(peer.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          {hasLegacyReport && <p className="mt-2 text-fg-muted">Есть старая сводка без имени устройства.</p>}
          {devices.size === 0 && !hasLegacyReport && <p className="mt-2 text-fg-muted">Нет сводок других устройств.</p>}
          <button type="button" onClick={() => { setDismissed(true); onSettings(); }} data-testid="sidebar-sync-open-settings"
            className="mt-2 w-full rounded-md border-t border-border-subtle px-1 py-1.5 text-left text-fg-secondary hover:bg-tint-6 focus-visible:bg-tint-8">
            Настройки синхронизации
          </button>
        </div>
      </section>
    </div>
  );
}
