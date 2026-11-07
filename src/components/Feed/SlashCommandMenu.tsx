import React from 'react';
import { Command } from 'lucide-react';
import { SLASH_COMMANDS, CATEGORY_LABELS, type SlashCommand } from '../../types/slashCommands';
import { SuggestionMenuHeader } from './SuggestionMenuHeader';
import { SuggestionMenuShell } from './SuggestionMenuShell';

interface SlashCommandMenuProps {
  isOpen?: boolean;
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  isOpen = true,
  query,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal = false,
}) => {
  // Фильтрация списка по введенному запросу
  const cleanQuery = query.toLowerCase().trim();
  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!cleanQuery) return true;
    if (cmd.command.toLowerCase().includes(cleanQuery)) return true;
    if (cmd.title.toLowerCase().includes(cleanQuery)) return true;
    if (cmd.description.toLowerCase().includes(cleanQuery)) return true;
    return cmd.aliases.some((alias) => alias.toLowerCase().includes(cleanQuery));
  });

  return (
    <SuggestionMenuShell
      isOpen={isOpen}
      selectedIndex={selectedIndex}
      placement={placement}
      isModal={isModal}
      isEmpty={filteredCommands.length === 0}
      emptyContent={<><Command className="w-3.5 h-3.5 text-zinc-500 shrink-0" /><span>Команда «/{query}» не найдена</span></>}
      header={<SuggestionMenuHeader icon={<Command className="w-3 h-3 text-zinc-400" />} title="Команды композера" />}
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
              // Keep the caret in the textarea: the command reads its selection.
              onMouseDown={(e) => e.preventDefault()}
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
    </SuggestionMenuShell>
  );
};
