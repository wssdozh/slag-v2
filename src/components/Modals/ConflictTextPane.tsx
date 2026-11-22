import { useState } from 'react';
import { useSwipeGesture } from '../../hooks/gestures/useSwipeGesture';

export function ConflictTextPane({ before, after, onEdit, onBack }: {
  before: string;
  after: string;
  onEdit?: (value: string) => void;
  onBack?: () => void;
}) {
  const [local, setLocal] = useState(Boolean(onBack));
  const [copyStatus, setCopyStatus] = useState('');
  const select = (value: boolean) => { setLocal(value); setCopyStatus(''); };
  const swipe = useSwipeGesture({
    onSwipeLeft: () => { if (window.getSelection()?.isCollapsed !== false) select(true); },
    onSwipeRight: () => { if (window.getSelection()?.isCollapsed !== false) select(false); },
  });
  const text = local ? after : before;
  const label = local ? 'Моя правка' : 'Версия релея';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Скопировано');
    } catch {
      setCopyStatus('Не удалось скопировать. Выделите текст и скопируйте вручную.');
    }
  };
  const textStyle = 'w-full select-text whitespace-pre-wrap break-words px-4 py-3 font-mono text-base leading-relaxed text-fg-primary';
  return (
    <div className={`${onBack ? 'flex' : 'flex md:hidden'} min-h-0 flex-1 flex-col bg-canvas`}>
      <div {...swipe} className="shrink-0 touch-pan-y border-b border-subtle px-4">
        <div role="group" aria-label="Версии текста" className="grid grid-cols-2 gap-2">
          {(['Версия релея', 'Моя правка'] as const).map((name, index) => (
            <button key={name} type="button" aria-pressed={local === Boolean(index)} onClick={() => select(Boolean(index))}
              className="min-h-11 border-b-2 border-transparent text-sm text-fg-secondary aria-pressed:border-accent aria-pressed:text-fg-primary">
              {name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-xs">
          <button type="button" className="min-h-11 disabled:opacity-40" disabled={!text} onClick={() => void copy()}>Скопировать текст</button>
          {onBack && <button type="button" className="min-h-11 text-fg-secondary" onClick={onBack}>К сравнению</button>}
          <span role="status" className="text-fg-secondary">{copyStatus}</span>
        </div>
      </div>
      {local && onEdit ? (
        <textarea aria-label={label} className={`${textStyle} min-h-0 flex-1 resize-none bg-transparent`} value={text} onChange={(event) => onEdit(event.currentTarget.value)} />
      ) : (
        <div {...swipe} className="min-h-0 flex-1 touch-pan-y overflow-y-auto">
          {text ? <pre className={textStyle}>{text}</pre> : <p className="p-4 text-sm text-fg-secondary">Нет текста</p>}
        </div>
      )}
    </div>
  );
}
