import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { useApp } from '../../context/AppContext';

/**
 * The app's own question for irreversible actions. It replaces `window.confirm`, which on
 * desktop is an OS window and on Android a grey WebView alert, neither of which belongs to
 * this interface.
 */
export const ConfirmDialog: React.FC = () => {
  const { confirmRequest, resolveConfirm } = useApp();

  if (!confirmRequest) return null;

  return (
    <BaseModal
      isOpen
      onClose={() => resolveConfirm(false)}
      title={confirmRequest.title}
      icon={confirmRequest.isDestructive ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : undefined}
      showCloseButton={false}
      role="alertdialog"
      maxWidth="max-w-sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => resolveConfirm(false)}
            className="px-3 py-1.5 rounded-md text-xs text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors cursor-pointer"
          >
            {confirmRequest.cancelLabel ?? 'Отмена'}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              confirmRequest.isDestructive
                ? 'bg-rose-500/90 text-white hover:bg-rose-500'
                : 'bg-accent-strong text-white hover:bg-accent-strong/90'
            }`}
          >
            {confirmRequest.confirmLabel}
          </button>
        </div>
      }
    >
      <p className="px-4 md:px-5 py-4 text-xs leading-relaxed text-fg-secondary">
        {confirmRequest.description ?? 'Действие нельзя отменить.'}
      </p>
    </BaseModal>
  );
};
