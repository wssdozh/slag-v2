import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 items-center pointer-events-none w-[calc(100%-2rem)] max-w-md"
      style={{ top: 'max(calc(var(--sat) + 0.75rem), 1.25rem)' }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-surface-elevated/95 backdrop-blur-md border border-white/[0.08] text-sm text-fg-primary shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 max-w-full"
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-zinc-400 shrink-0" />}
          <span className="font-medium tracking-tight text-xs min-w-0 break-words">{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                removeToast(toast.id);
              }}
              className="ml-1.5 px-2 py-0.5 rounded text-2xs font-mono font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-1 p-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
