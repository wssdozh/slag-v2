// The same three tasks on a phone-width column and on a laptop-width one. Both are the live feed's
// task card (`ItemCard`), so the tick on either side is the app's own status mark; the wire between
// the columns is the only piece the app does not draw.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { TagChip } from '../UI/TagChip';
import { TaskStatusMark } from '../UI/TaskStatusMark';
import { FeedDateBubble } from '../Feed/list/FeedDateBubble';

interface SyncTask {
  id: string;
  title: string;
  folder: string;
  due: string;
  time: string;
  done?: boolean;
  tags: string[];
}

const TASKS: SyncTask[] = [
  {
    id: 'service',
    title: 'Позвонить в сервис',
    folder: 'Карьера',
    due: '15 ноя',
    time: '15:00',
    done: true,
    tags: ['карьера'],
  },
  {
    id: 'tea',
    title: 'Купить чай',
    folder: 'Личное',
    due: '15 ноя',
    time: '18:00',
    tags: ['дом'],
  },
  {
    id: 'repair',
    title: 'Смета на ремонт',
    folder: 'Проекты',
    due: '12 ноя',
    time: '11:40',
    tags: ['ремонт'],
  },
];

interface SyncTaskCardProps {
  task: SyncTask;
  /** The phone hides the folder (no room); the laptop shows where the task lives. */
  showFolder: boolean;
  tickBeat?: 'tick-phone' | 'tick-desk';
  marginTop?: number;
}

const SyncTaskCard: React.FC<SyncTaskCardProps> = ({ task, showFolder, tickBeat, marginTop }) => (
  <div className="relative w-full mx-auto feed-card-contain">
    <div
      className="group relative flex flex-col gap-1.5 w-full p-2.5 rounded-xl cursor-default select-none bg-surface hover:bg-surface-hover"
      style={marginTop ? { marginTop } : undefined}
    >
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            data-beat={tickBeat}
            title={task.done ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
            aria-label="Изменить статус таски"
            className="mt-0.5 text-fg-secondary hover:text-white transition-colors shrink-0"
          >
            <TaskStatusMark done={Boolean(task.done)} className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 pr-6">
            <h3
              className={`text-base font-medium leading-snug tracking-tight ${
                task.done ? 'line-through text-fg-muted' : 'text-fg-primary'
              }`}
            >
              {task.title}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 min-h-[16px] w-full select-none">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap">
          {showFolder && (
            <>
              <span className="text-2xs text-fg-muted font-mono truncate max-w-[96px] leading-none shrink-0">
                {task.folder}
              </span>
              <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
            </>
          )}

          <span className="flex items-center gap-1 text-2xs text-fg-muted font-mono shrink-0">
            <Icon name="time.date" size="xs" tone="dim" />
            <span>{task.due}</span>
          </span>

          {showFolder && (
            <>
              <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-nowrap">
                {task.tags.map(tag => (
                  <TagChip key={tag} tag={tag} variant="flat" />
                ))}
              </div>
            </>
          )}
        </div>

        <span className="text-2xs font-mono text-fg-muted select-none ml-auto shrink-0 leading-none">
          {task.time}
        </span>
      </div>
    </div>
  </div>
);

/**
 * 960×320 of the same vault on two devices. The phone column is the width a phone actually gives
 * a card; the laptop column is the feed's own reading width. Nothing here stretches: the canvas is
 * fixed, and both columns are sized in pixels.
 */
export const SyncFragment: React.FC = () => (
  <div
    data-landing-canvas="sync"
    className="flex items-stretch overflow-hidden bg-canvas font-sans antialiased leading-normal text-fg-primary select-none"
    style={{ width: 960 }}
  >
    <div data-beat="phone" className="w-[300px] shrink-0 flex flex-col gap-2 p-3 overflow-hidden">
      <FeedDateBubble label="Сегодня" />

      <div className="flex flex-col">
        {TASKS.map((task, index) => (
          <SyncTaskCard
            key={task.id}
            task={task}
            showFolder
            tickBeat={index === 0 ? 'tick-phone' : undefined}
            marginTop={index > 0 ? 6 : undefined}
          />
        ))}
      </div>
    </div>

    <div data-beat="wire" className="flex-1 flex items-center px-3">
      <div className="relative w-full h-px bg-tint-12">
        <span className="absolute -top-[2px] left-0 w-1.5 h-1.5 rounded-full bg-accent" />
      </div>
    </div>

    <div data-beat="desk" className="w-[520px] shrink-0 flex flex-col gap-2 p-3 overflow-hidden">
      <FeedDateBubble label="Сегодня" />

      <div className="flex flex-col">
        {TASKS.map((task, index) => (
          <SyncTaskCard
            key={task.id}
            task={task}
            showFolder
            tickBeat={index === 0 ? 'tick-desk' : undefined}
            marginTop={index > 0 ? 6 : undefined}
          />
        ))}
      </div>
    </div>
  </div>
);
