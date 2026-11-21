// The sidebar shows saved comparison data; it never infers device presence from a manifest.
import { useEffect, useId, useState } from 'react';
import { BaseModal } from '../Modals/BaseModal';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncStatus } from '../../lib/sync/types';
import { Icon } from '../UI/icons/Icon';
import { syncGlyph } from './syncGlyph';

export function SyncStatusButton({ vaultId, onSettings, mobile = false }: {
  vaultId?: string;
  onSettings: () => void;
  mobile?: boolean;
}) {
  const [status, setStatus] = useState<SyncStatus>(() => syncEngine.getStatus());
  useEffect(() => syncEngine.subscribe(setStatus), []);
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const config = syncEngine.getConfig();
  const glyph = syncGlyph(status, config.enabled, mobile);
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

  const registry = status.registry;
  const mediaLabel = registry && {
    legacy: 'Legacy', waiting: 'Ожидание', applying: 'Запись…', error: 'Сбой', 'applied-through-cursor': 'Записаны',
  }[registry.media];

  const summary = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className={`flex items-center gap-1.5 font-medium ${glyph.className}`}>
          {registry && <Icon name={glyph.name} size="sm" tone="inherit" />} {glyph.title}
        </span>
        {!registry && status.lastSyncTime && <span className="text-fg-secondary">Обмен: {status.lastSyncTime}</span>}
      </div>
      {registry && (
        <dl aria-label="Прогресс реестра" className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 border-y border-border-subtle py-2">
          <dt className="flex items-center gap-1.5 text-fg-secondary" title="Последняя известная ревизия релея, не подтверждение от других устройств">
            <Icon name="system.syncIdle" size="sm" /> Релей
          </dt>
          <dd className="text-right tabular-nums">{registry.relayHead === null ? 'Не проверен' : `#${registry.relayHead}`}</dd>
          <dt className="flex items-center gap-1.5 text-fg-secondary" title="Ревизия, записанная на этом устройстве">
            <Icon name={mobile ? 'entity.phone' : 'entity.desktop'} size="sm" /> Здесь
          </dt>
          <dd className={`text-right tabular-nums ${registry.application === 'error' ? 'text-warning' : ''}`}>
            {`#${registry.appliedThrough}`}
            {registry.application === 'error' ? ' · Сбой' : registry.application === 'catching-up' ? ' · Сверка' : ''}
          </dd>
          <dt className="flex items-center gap-1.5 text-fg-secondary" title="Вложения реестра на этом устройстве">
            <Icon name="action.attach" size="sm" /> Вложения
          </dt>
          <dd className={`text-right ${registry.media === 'error' ? 'text-warning' : ''}`}>{mediaLabel}</dd>
        </dl>
      )}
      {devices.size > 0 && (
        <ul aria-label="Последняя сверка устройств" className="max-h-48 divide-y divide-border-subtle overflow-y-auto border-y border-border-subtle">
          {[...devices].map(([deviceId, name]) => {
            const peer = peers.find((candidate) => candidate.deviceId === deviceId);
            return (
              <li key={deviceId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="truncate font-medium text-fg-primary" title={name}>{name}</span>
                <span className={`shrink-0 ${peer && !peer.inSync ? 'text-warning' : 'text-fg-secondary'}`} title={peer?.at == null ? undefined : new Date(peer.at).toLocaleString('ru-RU')}>
                  {peer ? (peer.inSync ? 'Совпало' : 'Не совпало') : 'Нет сверки'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!registry && devices.size === 0 && <p className="text-fg-secondary">Нет сверок с другими устройствами</p>}
      {hasLegacyReport && <details className="text-fg-secondary"><summary className="cursor-pointer">Детали сверки</summary>Есть старая сводка без имени устройства.</details>}
      <button type="button" onClick={() => { setIsOpen(false); setDismissed(true); onSettings(); }} data-testid={mobile ? 'mobile-sync-open-settings' : 'sidebar-sync-open-settings'}
        className={`flex w-full items-center gap-2 rounded-md text-left text-fg-primary hover:bg-tint-6 focus-visible:bg-tint-8 cursor-pointer ${mobile ? 'min-h-12' : 'py-1'}`}>
        <Icon name="system.settings" size="sm" /> {registry ? 'Настройки' : 'Настройки синхронизации'}
      </button>
    </div>
  );

  if (mobile) return (
    <>
      <button type="button" aria-label={`Состояние синхронизации: ${glyph.title}`} aria-haspopup="dialog" aria-expanded={isOpen}
        data-testid="mobile-sync-btn" onClick={() => setIsOpen(true)}
        className="grid size-12 shrink-0 place-items-center rounded-lg active:bg-tint-8 focus-visible:bg-tint-8 cursor-pointer">
        <Icon name={glyph.name} size="lg" tone="inherit" className={glyph.className} />
      </button>
      <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Синхронизация" portal
        className="!items-end !p-0" containerClassName="!rounded-b-none !bg-canvas-subtle" contentClassName="px-4 pt-3 pb-[max(var(--sab),0.75rem)] text-sm">
        {summary}
      </BaseModal>
    </>
  );

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
          {summary}
        </div>
      </section>
    </div>
  );
}
