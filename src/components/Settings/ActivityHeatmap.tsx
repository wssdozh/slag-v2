// A year of activity as GitHub draws it: one column per week, one square per day.
import React from 'react';
import type { ActivitySummary, ActivityDay } from '../../lib/activityStats';
import { pluralRu } from '../../lib/activityStats';

const CELL = 7;
const GAP = 2;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Five steps, chosen relative to the busiest day so a quiet vault still reads as a graph. */
const LEVEL_CLASS = [
  'bg-white/[0.05]',
  'bg-accent/25',
  'bg-accent/45',
  'bg-accent/70',
  'bg-accent',
];

function levelFor(day: ActivityDay | null, best: number): number {
  if (!day || day.total === 0 || best === 0) return 0;
  return Math.min(LEVEL_CLASS.length - 1, Math.max(1, Math.ceil((day.total / best) * (LEVEL_CLASS.length - 1))));
}

function humanDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]}`;
}

function describeDay(day: ActivityDay): string {
  const parts: string[] = [];
  if (day.created) parts.push(`создано: ${day.created}`);
  if (day.updated) parts.push(`правок: ${day.updated}`);
  if (day.completed) parts.push(`закрыто: ${day.completed}`);
  return parts.length ? `${humanDate(day.date)} · ${parts.join(', ')}` : `${humanDate(day.date)} · пусто`;
}

interface ActivityHeatmapProps {
  summary: ActivitySummary;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ summary }) => {
  const columns = summary.weeks.length;
  const template = `repeat(${columns}, ${CELL}px)`;
  const monthLabels: (string | null)[] = [];
  let previousMonth = -1;
  summary.weeks.forEach((week, index) => {
    const first = week.find((day): day is ActivityDay => day !== null);
    const month = first ? Number(first.date.slice(5, 7)) - 1 : -1;
    // A label every time the month flips, unless the previous label is still two squares away.
    const tooClose = index > 0 && monthLabels.slice(Math.max(0, index - 2)).some(Boolean);
    monthLabels.push(month >= 0 && month !== previousMonth && !tooClose ? MONTHS[month] : null);
    if (month >= 0) previousMonth = month;
  });

  return (
    <div className="flex flex-col gap-2 p-3.5">
      <div className="grid grid-cols-4 gap-2">
        {[
          { value: summary.totalCreated, label: pluralRu(summary.totalCreated, ['заметка', 'заметки', 'заметок']) },
          { value: summary.totalCompleted, label: 'задач закрыто' },
          { value: summary.streak, label: pluralRu(summary.streak, ['день подряд', 'дня подряд', 'дней подряд']) },
          { value: summary.characters, label: pluralRu(summary.characters, ['символ', 'символа', 'символов']) },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span className="font-mono text-sm text-fg-primary">{stat.value.toLocaleString('ru-RU')}</span>
            <span className="text-[10px] leading-tight text-fg-muted">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1.5 pt-1">
          <div
            className="grid pt-[15px] text-[9px] leading-[7px] text-fg-dim"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}
          >
            {['пн', '', 'ср', '', 'пт', '', ''].map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          <div className="flex flex-col" style={{ gap: `${GAP}px` }}>
            <div className="grid text-[9px] leading-[7px] text-fg-dim" style={{ gridTemplateColumns: template, columnGap: `${GAP}px` }}>
              {monthLabels.map((label, index) => (
                <span key={index} className="whitespace-nowrap">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: template, columnGap: `${GAP}px`, rowGap: `${GAP}px` }}>
              {summary.weeks.map((week, weekIndex) =>
                week.map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    title={day ? describeDay(day) : undefined}
                    className={`rounded-[2px] ${LEVEL_CLASS[levelFor(day, summary.bestDay)]} ${day ? '' : 'opacity-0'}`}
                    style={{ width: CELL, height: CELL, gridRow: dayIndex + 1, gridColumn: weekIndex + 1 }}
                  />
                )),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-fg-dim">
          {summary.bestDay === 0
            ? 'пока ни одной записи'
            : `${summary.activeDays} ${pluralRu(summary.activeDays, ['активный день', 'активных дня', 'активных дней'])} за год · ${humanDate(summary.firstDate)} — ${humanDate(summary.lastDate)}`}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-fg-dim">меньше</span>
          {LEVEL_CLASS.map((tone, index) => (
            <span key={index} className={`rounded-[2px] ${tone}`} style={{ width: CELL, height: CELL }} />
          ))}
          <span className="text-[10px] text-fg-dim">больше</span>
        </span>
      </div>
    </div>
  );
};
