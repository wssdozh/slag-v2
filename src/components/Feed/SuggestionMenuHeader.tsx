// The shared header of composer suggestions, with key hints only for a precision pointer.
import React from 'react';

interface SuggestionMenuHeaderProps {
  icon: React.ReactNode;
  title: string;
}

/**
 * Общая шапка подсказок композера (@ папки, # теги, / команды).
 * Клавишные сочетания бессмысленны на сенсорном экране, поэтому подсказка
 * показывается только при точном указателе — без ветвлений в каждом меню.
 */
export const SuggestionMenuHeader: React.FC<SuggestionMenuHeaderProps> = ({ icon, title }) => (
  <div className="px-2.5 py-1.5 border-b border-tint-6 bg-tint-2 rounded-t-xl flex items-center justify-between text-3xs text-fg-muted font-mono tracking-wider shrink-0">
    <div className="flex items-center gap-1.5 text-fg-tertiary uppercase">
      {icon}
      <span>{title}</span>
    </div>
    <div className="hidden [@media(pointer:fine)]:flex items-center gap-2 text-fg-muted">
      <span>↑↓ выбор</span>
      <span>•</span>
      <span>Enter применить</span>
      <span>•</span>
      <span>Esc отмена</span>
    </div>
  </div>
);
