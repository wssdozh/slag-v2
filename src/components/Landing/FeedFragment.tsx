// A static slice of the feed for the landing: three cards, the day bubble and the composer strip.
// It is the same markup the live feed builds, with the context stripped: no writes, no reply
// target, no drag — only props-constants and the classes from `Feed/ItemCard` and `Feed/Composer`.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { TagChip } from '../UI/TagChip';
import { TaskStatusMark } from '../UI/TaskStatusMark';
import { ToolbarButton } from '../UI/ToolbarButton';
import { SendButton } from '../UI/SendButton';
import { ComposerAiButton } from '../Feed/composer/ComposerAiButton';
import { ComposerTypeSelector } from '../Feed/composer/ComposerTypeSelector';
import { ItemCardActions } from '../Feed/item/ItemCardActions';
import { FeedDateBubble } from '../Feed/list/FeedDateBubble';

const noop = () => {};

const CARD_BASE =
  'group relative flex flex-col gap-1.5 w-full p-2.5 sm:p-3 rounded-xl cursor-default select-none bg-surface hover:bg-surface-hover';

interface FeedCardMetaProps {
  folder: string;
  time: string;
  tags: string[];
  priority?: 'none' | 'low' | 'medium' | 'high';
  due?: string;
}

/** The bottom strip of a card: folder, priority, due date and tags on the left, time on the right. */
const FeedCardMeta: React.FC<FeedCardMetaProps> = ({ folder, time, tags, priority, due }) => (
  <div
    data-testid="item-meta-row"
    className="flex items-center gap-2 pt-1 min-h-[16px] w-full select-none"
  >
    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap">
      <button
        type="button"
        title={`Перейти в папку «${folder}» и перейти к этой записи`}
        className="text-2xs text-fg-muted hover:text-fg-soft font-mono transition-colors cursor-pointer hover:underline underline-offset-2 truncate max-w-[96px] text-left leading-none inline-flex items-center shrink-0"
      >
        {folder}
      </button>

      {priority && priority !== 'none' && (
        <>
          <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
          <span className="flex items-center shrink-0" title="Приоритет">
            <LinearSignalBars priority={priority} className="w-3.5 h-3.5" />
          </span>
        </>
      )}

      {due && (
        <>
          <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
          <span className="flex items-center gap-1 text-2xs text-fg-muted font-mono shrink-0" title={`Срок: ${due}`}>
            <Icon name="time.date" size="xs" tone="dim" />
            <span>{due}</span>
          </span>
        </>
      )}

      {tags.length > 0 && (
        <>
          <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-nowrap">
            {tags.map(tag => (
              <TagChip key={tag} tag={tag} variant="flat" />
            ))}
          </div>
        </>
      )}
    </div>

    <span className="text-2xs font-mono text-fg-muted select-none ml-auto shrink-0 leading-none">
      {time}
    </span>
  </div>
);

interface TaskCardProps extends FeedCardMetaProps {
  title: string;
  body?: string;
  done?: boolean;
  isNew?: boolean;
  marginTop?: number;
}

/** The task variant of `ItemCard`: circle, title, body, subtasks slot, metadata strip. */
const TaskCard: React.FC<TaskCardProps> = ({
  title,
  body,
  done = false,
  isNew = false,
  marginTop,
  ...meta
}) => (
  <div className="relative w-full mx-auto feed-card-contain" data-beat="card">
    <div
      data-beat={isNew ? 'card-new' : undefined}
      className={CARD_BASE}
      style={marginTop ? { marginTop } : undefined}
    >
      <ItemCardActions
        isFloating={false}
        isArticle={false}
        onReply={noop}
        onOpenArticle={noop}
      />

      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            data-beat={isNew ? 'tick' : undefined}
            title={done ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
            aria-label="Изменить статус таски"
            className="mt-0.5 text-fg-secondary hover:text-white transition-colors shrink-0"
          >
            <TaskStatusMark done={done} className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 pr-14 sm:pr-16">
            <h3
              className={`text-base font-medium leading-snug tracking-tight ${
                done ? 'line-through text-fg-muted' : 'text-fg-primary'
              }`}
            >
              {title}
            </h3>

            {body && (
              <div className="mt-1 text-sm text-fg-tertiary leading-relaxed font-normal">
                {body}
              </div>
            )}          </div>
        </div>
      </div>

      <FeedCardMeta {...meta} />
    </div>
  </div>
);

interface NoteCardProps extends FeedCardMetaProps {
  text: string;
  marginTop?: number;
}

/** The stream-note variant of `ItemCard`: no header, the text itself is the card. */
const NoteCard: React.FC<NoteCardProps> = ({ text, marginTop, ...meta }) => (
  <div className="relative w-full mx-auto feed-card-contain" data-beat="card">
    <div className={CARD_BASE} style={marginTop ? { marginTop } : undefined}>
      <ItemCardActions
        isFloating={false}
        isArticle={false}
        onReply={noop}
        onOpenArticle={noop}
      />

      <div className="flex flex-col gap-1.5 pr-14 sm:pr-16">
        <div className="text-sm text-fg-soft leading-relaxed font-normal">{text}</div>
      </div>

      <FeedCardMeta {...meta} />
    </div>
  </div>
);

/** The composer strip as `BaseComposer` paints it: the field, the type switcher and the send plate. */
const FeedComposer: React.FC = () => (
  <div data-composer-root="" className="composer-surface relative flex w-full min-w-0 justify-center select-none">
    <div
      data-composer-panel=""
      data-beat="composer"
      className="rounded-2xl bg-surface-elevated focus-within:ring-1 focus-within:ring-tint-10 p-2 flex flex-col gap-2 md:shadow-2xl md:shadow-scrim-50 transition-shadow w-full relative max-w-[var(--feed-content-width,42rem)]"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="relative flex min-w-0 flex-1">
          <div
            aria-hidden="true"
            className="composer-mirror pointer-events-none absolute inset-0 z-0 select-none overflow-hidden whitespace-pre-wrap break-words py-0 text-base md:text-sm leading-normal text-fg-primary"
          >
            <span data-beat="typed">
              позвонить в сервис <span className="text-mention">завтра в 15:00</span>
            </span>
          </div>
          <textarea
            readOnly
            rows={1}
            value="позвонить в сервис завтра в 15:00"
            aria-label="Текст записи"
            className="min-w-0 flex-1 w-full bg-transparent text-base md:text-sm text-fg-primary placeholder-fg-muted placeholder:truncate resize-none overflow-y-hidden relative z-10 leading-normal py-0 outline-none border-none"
            style={{
              minHeight: '24px',
              maxHeight: '220px',
              color: 'transparent',
              caretColor: 'var(--color-fg-primary)',
            }}
          />
        </div>

        <div className="composer-top-actions flex shrink-0 items-center gap-1">
          <ToolbarButton
            size="sm"
            title="Раскрыть в полноэкранный редактор"
            aria-label="Раскрыть в полноэкранный редактор"
            className="flex text-fg-secondary hover:text-fg-soft"
            icon={<Icon name="action.expand" size="sm" tone="inherit" />}
          />
        </div>
      </div>

      <div className="composer-toolbar relative flex min-w-0 items-end justify-between gap-2">
        <div className="composer-toolbar-group relative">
          <ComposerAiButton isGenerating={false} onClick={noop} />

          <ComposerTypeSelector value="task" onChange={noop} />

          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            active
            glow="blue"
            title="Срок: завтра, 15:00 (клик для изменения, ПКМ для сброса)"
            aria-label="Срок: завтра, 15:00"
            icon={<Icon name="time.date" size="md" tone="inherit" />}
          />

          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            title="Установить длительность таски"
            aria-label="Установить длительность таски"
            icon={<Icon name="time.time" size="md" tone="inherit" />}
          />

          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            title="повторение: настроить повтор"
            aria-label="Повторяющаяся таска"
            icon={<Icon name="time.repeat" size="md" tone="inherit" />}
          />

          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            title="Приоритет: Обычный (клик для изменения)"
            aria-label="Приоритет: Обычный"
            icon={<LinearSignalBars size="md" priority="none" />}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 ml-auto">
          <ToolbarButton
            size="md"
            className="composer-toolbar-control composer-toolbar-icon"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
            icon={<Icon name="action.attach" size="md" tone="inherit" />}
          />

          <SendButton
            onClick={noop}
            label="Отправить (Enter)"
            className="composer-toolbar-control composer-send"
          />
        </div>
      </div>
    </div>
  </div>
);

/**
 * The feed exactly as the app paints it: the day bubble, three notes and the input dock under
 * them. The width is the design canvas (960); the height is whatever the column actually needs,
 * so the block has no empty band above the notes or under the composer.
 */
export const FeedFragment: React.FC = () => (
  <main
    data-landing-canvas="feed"
    className="font-sans antialiased leading-normal text-fg-primary select-none bg-canvas flex flex-col overflow-hidden"
    style={{ width: 960 }}
  >
    <div className="px-4 pt-4 pb-2 flex flex-col gap-6">
      <div className="flex flex-col gap-2" data-beat="feed">
        <FeedDateBubble label="Сегодня" />

        <div className="flex flex-col">
          <NoteCard
            text="Созвон перенесли на четверг — Аня скинула ссылку, надо проверить, что VPN не отвалится."
            folder="Карьера"
            tags={['работа', 'созвон']}
            time="09:24"
          />

          <TaskCard
            title="Смета на ремонт"
            body="Собрать три сметы и сравнить по материалам."
            folder="Проекты"
            tags={['ремонт']}
            priority="medium"
            due="15 ноя"
            time="11:40"
            marginTop={12}
          />

          <TaskCard
            title="Сервис: позвонить"
            folder="Карьера"
            tags={['карьера']}
            due="16 ноя · 15:00"
            time="11:33"
            done
            isNew
            marginTop={6}
          />
        </div>
      </div>
    </div>

    <div className="pb-3 px-2 sm:pl-4 sm:pr-[22px] flex justify-center">
      <div className="w-full max-w-[var(--feed-content-width,42rem)]">
        <FeedComposer />
      </div>
    </div>
  </main>
);
