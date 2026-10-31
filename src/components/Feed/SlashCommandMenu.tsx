import React, { useEffect, useRef } from 'react';
import { Command } from 'lucide-react';
import { SLASH_COMMANDS, CATEGORY_LABELS, type SlashCommand } from '../../types/slashCommands';

interface SlashCommandMenuProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  query,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal = false,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Фильтрация списка по введенному запросу
  const cleanQuery = query.toLowerCase().trim();
  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!cleanQuery) return true;
    if (cmd.command.toLowerCase().includes(cleanQuery)) return true;
    if (cmd.title.toLowerCase().includes(cleanQuery)) return true;
    if (cmd.description.toLowerCase().includes(cleanQuery)) return true;
    return cmd.aliases.some((alias) => alias.toLowerCase().includes(cleanQuery));
  });

  // Автоскролл к выбранному элементу
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const isBottom = placement === 'bottom';
  const positionClasses = isBottom
    ? 'top-full mt-2'
    : isModal
    ? 'bottom-[calc(100%+55px)]'
    : 'bottom-[calc(100%+14px)]';
  const animationClasses = isBottom ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2';

  if (filteredCommands.length === 0) {
    return (
      <div className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-surface-elevated border border-white/[0.12] shadow-2xl shadow-black/90 p-3 z-50 animate-in ${animationClasses} fade-in duration-150 ease-out select-none`}>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Command className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>Команда «/{query}» не найдена</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-surface-elevated border border-white/[0.12] shadow-2xl shadow-black/90 p-1.5 z-50 flex flex-col gap-0.5 animate-in ${animationClasses} fade-in duration-150 ease-out select-none overflow-hidden`}
    >
      {/* Шапка формы команд — фиксированная */}
      <div className="px-2.5 py-1.5 border-b border-white/[0.06] bg-white/[0.02] rounded-t-xl flex items-center justify-between text-[10px] text-zinc-500 font-mono tracking-wider shrink-0">
        <div className="flex items-center gap-1.5 text-zinc-300 uppercase">
          <Command className="w-3 h-3 text-zinc-400" />
          <span>Команды композера</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>↑↓ выбор</span>
          <span>•</span>
          <span>Enter применить</span>
          <span>•</span>
          <span>Esc отмена</span>
        </div>
      </div>

      {/* Список команд со скроллом строго внутри */}
      <div
        ref={listRef}
        className="flex flex-col gap-0.5 pt-1 max-h-44 overflow-y-auto pr-0.5"
      >
        {filteredCommands.map((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          const isNewCategory = idx === 0 || filteredCommands[idx - 1].category !== cmd.category;
          const IconComponent = cmd.icon;

          return (
            <React.Fragment key={cmd.id}>
              {isNewCategory && !cleanQuery && (
                <div className="px-2.5 pt-1.5 pb-0.5 text-2xs font-mono uppercase tracking-wider text-zinc-500">
                  {CATEGORY_LABELS[cmd.category]}
                </div>
              )}

              <button
                type="button"
                data-selected={isSelected}
                onClick={() => onSelect(cmd)}
                className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-white/10 text-white font-medium shadow-sm'
                    : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <IconComponent
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isSelected ? 'text-zinc-100' : 'text-zinc-400'
                    }`}
                  />

                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs font-mono font-medium text-zinc-100 shrink-0">
                      {cmd.command}
                    </span>
                    <span className="text-xs text-zinc-300 font-medium truncate">
                      {cmd.title}
                    </span>
                    <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
                      — {cmd.description}
                    </span>
                  </div>
                </div>

                {cmd.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-zinc-400 border border-white/[0.06] shrink-0">
                    {cmd.badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
