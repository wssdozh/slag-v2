// The `/` command list: filtered by the typed query, grouped by category.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
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
      emptyContent={<><Icon name="system.command" size="sm" tone="muted" className="shrink-0" /><span>Команда «/{query}» не найдена</span></>}
      header={<SuggestionMenuHeader icon={<Icon name="system.command" size="sm" />} title="Команды композера" />}
    >
      {filteredCommands.map((cmd, idx) => {
        const isSelected = idx === selectedIndex;
        const isNewCategory = idx === 0 || filteredCommands[idx - 1].category !== cmd.category;

        return (
          <React.Fragment key={cmd.id}>
            {isNewCategory && !cleanQuery && (
              <div className="px-2.5 pt-1.5 pb-0.5 text-2xs font-mono uppercase tracking-wider text-fg-muted">
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
                  ? 'bg-tint-10 text-white font-medium shadow-sm'
                  : 'text-fg-tertiary hover:bg-tint-4'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  name={cmd.icon}
                  size="md"
                  tone="inherit"
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? 'text-fg-primary' : 'text-fg-secondary'
                  }`}
                />

                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-mono font-medium text-fg-primary shrink-0">
                    {cmd.command}
                  </span>
                  <span className="text-xs text-fg-tertiary font-medium truncate">
                    {cmd.title}
                  </span>
                  <span className="text-2xs text-fg-muted truncate hidden sm:inline">
                    — {cmd.description}
                  </span>
                </div>
              </div>

              {cmd.badge && (
                <span className="px-1.5 py-0.5 rounded text-3xs font-mono bg-tint-4 text-fg-secondary border border-tint-6 shrink-0">
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
