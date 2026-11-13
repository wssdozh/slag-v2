// «Ждём подтверждения»: one live code, one progress line, and a link that actually opens.
import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { accountClient } from '../../lib/sync/account';
import type { NotifyInvite } from '../../lib/sync/account';
import { openExternalUrl } from '../../lib/platform/openExternal';

interface NotifyInviteModalProps {
  invite: NotifyInvite;
  vaultId: string;
  onClose: () => void;
  onLinked: (routeToken: string) => void;
}

const TICK_MS = 1000;
const POLL_MS = 2500;

function expiresAtMs(invite: NotifyInvite): number {
  if (typeof invite.expiresAt === 'number') return invite.expiresAt * 1000;
  const parsed = Date.parse(invite.expiresAt);
  return Number.isFinite(parsed) ? parsed : Date.now() + invite.expiresIn * 1000;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The bot is the only side that can confirm: the device just watches the relay's answer. */
export const NotifyInviteModal: React.FC<NotifyInviteModalProps> = ({ invite, vaultId, onClose, onLinked }) => {
  const [now, setNow] = useState(() => Date.now());
  const [linked, setLinked] = useState(false);
  // The deadline belongs to this invite, not to the render: a state initialiser keeps it stable.
  const [deadline] = useState(() => expiresAtMs(invite));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (linked) return;
    let cancelled = false;
    const ask = async () => {
      try {
        const status = await accountClient.notifyStatus(vaultId, invite.routeToken);
        if (!cancelled && status.state !== 'pending') setLinked(true);
      } catch {
        // A relay hiccup is not an answer: keep waiting, the countdown says how long.
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [invite.routeToken, linked, vaultId]);

  useEffect(() => {
    if (!linked) return;
    const timer = setTimeout(() => onLinked(invite.routeToken), 900);
    return () => clearTimeout(timer);
  }, [invite.routeToken, linked, onLinked]);

  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const total = Math.max(1, invite.expiresIn);
  const expired = left === 0;
  const progress = expired ? 100 : Math.min(100, Math.round(((total - left) / total) * 100));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Подключение telegram"
      className="fixed inset-0 z-[60] bg-canvas/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg-primary">Подключение telegram</h3>
            <p className="text-2xs text-fg-muted mt-0.5">канал привязывается к этому хранилищу</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="p-1 -m-1 rounded-md text-fg-dim hover:text-fg-primary hover:bg-surface-hover cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg bg-canvas-subtle border border-border-subtle px-3 py-2 flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-fg-primary select-all break-all">{invite.code}</span>
          <span className="text-2xs font-mono text-fg-dim shrink-0">код</span>
        </div>

        <ol className="flex flex-col gap-1.5">
          <li className="flex items-center gap-2 text-2xs text-fg-secondary">
            <Check className="w-3.5 h-3.5 text-fg-muted shrink-0" />
            код создан, живёт {Math.round(total / 60)} минут
          </li>
          <li className={`flex items-center gap-2 text-2xs ${linked ? 'text-fg-secondary' : 'text-fg-primary'}`}>
            {linked ? (
              <Check className="w-3.5 h-3.5 text-fg-muted shrink-0" />
            ) : (
              <Loader2 className={`w-3.5 h-3.5 shrink-0 ${expired ? 'text-fg-dim' : 'animate-spin text-accent'}`} />
            )}
            {expired && !linked ? 'код истёк — закрой и получи новый' : 'открой бота и нажми /start'}
          </li>
          <li className={`flex items-center gap-2 text-2xs ${linked ? 'text-fg-primary' : 'text-fg-dim'}`}>
            <Check className={`w-3.5 h-3.5 shrink-0 ${linked ? 'text-accent' : 'text-fg-dim opacity-40'}`} />
            канал подключён
          </li>
        </ol>

        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${linked ? 'bg-accent' : 'bg-fg-dim'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-mono text-fg-muted">
            {linked ? 'готово' : expired ? 'истёк' : `осталось ${clock(left)}`}
          </span>
          <div className="flex items-center gap-1.5">
            {invite.link && (
              <button
                type="button"
                disabled={expired || linked}
                onClick={() => void openExternalUrl(invite.link as string)}
                className="px-2.5 py-1.5 rounded-md text-2xs text-fg-primary bg-white/[0.06] hover:bg-surface-hover disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                открыть telegram
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-md text-2xs text-fg-secondary hover:bg-surface-hover cursor-pointer"
            >
              закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
