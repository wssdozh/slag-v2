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
  <div className="px-2.5 py-1.5 border-b border-white/[0.06] bg-white/[0.02] rounded-t-xl flex items-center justify-between text-[10px] text-zinc-500 font-mono tracking-wider shrink-0">
    <div className="flex items-center gap-1.5 text-zinc-300 uppercase">
      {icon}
      <span>{title}</span>
    </div>
    <div className="hidden [@media(pointer:fine)]:flex items-center gap-2 text-zinc-500">
      <span>↑↓ выбор</span>
      <span>•</span>
      <span>Enter применить</span>
      <span>•</span>
      <span>Esc отмена</span>
    </div>
  </div>
);
