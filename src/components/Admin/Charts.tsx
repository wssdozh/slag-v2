// Dependency-free SVG charts — sparkline, bars, donut, funnel — for the admin tabs.
import React, { useState } from 'react';

export interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface SparklineProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  unit?: string;
  formatValue?: (val: number) => string;
}

export const SparklineChart: React.FC<SparklineProps> = ({
  data,
  height = 90,
  color = 'var(--color-success)',
  unit = '',
  formatValue = (v) => v.toLocaleString('ru-RU'),
}) => {
  const gradId = `grad-${React.useId().replace(/:/g, '')}`;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="h-[90px] flex items-center justify-center text-xs text-fg-dim">нет данных</div>;
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const width = 360;
  const paddingX = 12;
  const paddingY = 14;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const points = data.map((d, i) => {
    const x = paddingX + (i / Math.max(1, data.length - 1)) * innerWidth;
    const y = height - paddingY - ((d.value - minVal) / range) * innerHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cp1x = prev.x + (p.x - prev.x) / 2;
    const cp2x = cp1x;
    return `${acc} C ${cp1x} ${prev.y}, ${cp2x} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between text-2xs font-mono text-fg-secondary">
        <span>{activePoint.label}</span>
        <span className="font-semibold text-white">
          {formatValue(activePoint.value)} {unit}
        </span>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color }} stopOpacity="0.28" />
              <stop offset="100%" style={{ stopColor: color }} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradId})`} />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            style={{ stroke: color }}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Grid bounds */}
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            className="stroke-tint-6"
            strokeDasharray="2 3"
          />

          {/* Points hover targets */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="12"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
              />
              {(hoverIndex === i || (hoverIndex === null && i === points.length - 1)) && (
                <>
                  <circle cx={p.x} cy={p.y} r="4.5" className="fill-canvas-subtle" style={{ stroke: color }} strokeWidth="2" />
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={p.x}
                    y2={height - paddingY}
                    className="stroke-tint-15"
                    strokeDasharray="1 2"
                  />
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

interface BarChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  unit?: string;
  formatValue?: (val: number) => string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 90,
  color = 'var(--color-mention)',
  unit = '',
  formatValue = (v) => v.toLocaleString('ru-RU'),
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="h-[90px] flex items-center justify-center text-xs text-fg-dim">нет данных</div>;
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  const active = hoverIndex !== null ? data[hoverIndex] : data[data.length - 1];

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between text-2xs font-mono text-fg-secondary">
        <span>{active.label}</span>
        <span className="font-semibold text-white">
          {formatValue(active.value)} {unit}
        </span>
      </div>

      <div
        style={{ height: `${height}px` }}
        className="flex items-end gap-1.5 w-full pt-3 pb-1 border-b border-tint-6"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {data.map((d, i) => {
          const barHeight = Math.max(4, Math.round((d.value / maxVal) * 65));
          const isSelected = hoverIndex === i || (hoverIndex === null && i === data.length - 1);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
              onMouseEnter={() => setHoverIndex(i)}
            >
              <div
                style={{ height: `${barHeight}px`, backgroundColor: isSelected ? color : 'var(--color-tint-12)' }}
                className="w-full max-w-[24px] rounded-t transition-[background-color,filter] group-hover:brightness-125"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface FunnelStep {
  name: string;
  count: number;
  rate: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  dropOffRate: number;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({ steps, dropOffRate }) => {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg-secondary">воронка перехвата и оплат</span>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-fg-muted font-mono">отвал на чекауте:</span>
          <span className={`text-xs font-mono font-semibold ${dropOffRate > 50 ? 'text-rose-400' : 'text-amber-400'}`}>
            {dropOffRate}%
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((st, i) => {
          const widthPct = Math.max(6, Math.min(100, st.rate));
          const dropFromPrev = i > 0 && steps[i - 1].count > 0
            ? Math.round((1 - st.count / steps[i - 1].count) * 100)
            : 0;

          return (
            <div key={st.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-2xs font-mono">
                <span className="text-fg-tertiary">{st.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{st.count.toLocaleString('ru-RU')}</span>
                  <span className="text-fg-muted w-10 text-right">({st.rate}%)</span>
                </div>
              </div>

              {/* ponytail: width tracks chart data, not surrounding layout. */}
              <div className="relative w-full h-2 rounded-full bg-tint-4 overflow-hidden">
                <div
                  style={{ width: `${widthPct}%` }}
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    i === steps.length - 1
                      ? 'bg-emerald-400'
                      : i === 0
                      ? 'bg-fg-secondary'
                      : 'bg-indigo-400'
                  }`}
                />
              </div>

              {i > 0 && dropFromPrev > 0 && (
                <div className="text-3xs font-mono text-rose-400/80 pl-1">
                  ↳ отвал шага: -{dropFromPrev}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DistributionGaugeProps {
  min: number;
  max: number;
  mean: number;
  median: number;
  unit?: string;
}

export const DistributionGauge: React.FC<DistributionGaugeProps> = ({
  min,
  max,
  mean,
  median,
  unit = 'tok',
}) => {
  const range = max - min || 1;
  const meanPos = Math.max(5, Math.min(95, ((mean - min) / range) * 100));
  const medianPos = Math.max(5, Math.min(95, ((median - min) / range) * 100));

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 rounded bg-tint-3 border border-tint-4">
          <span className="block text-3xs font-mono text-fg-muted">мин</span>
          <span className="text-xs font-mono font-medium text-fg-tertiary">
            {min.toLocaleString('ru-RU')} {unit}
          </span>
        </div>
        <div className="p-2 rounded bg-tint-3 border border-tint-4">
          <span className="block text-3xs font-mono text-indigo-400">медиана</span>
          <span className="text-xs font-mono font-semibold text-white">
            {median.toLocaleString('ru-RU')} {unit}
          </span>
        </div>
        <div className="p-2 rounded bg-tint-3 border border-tint-4">
          <span className="block text-3xs font-mono text-emerald-400">среднее</span>
          <span className="text-xs font-mono font-semibold text-white">
            {mean.toLocaleString('ru-RU')} {unit}
          </span>
        </div>
        <div className="p-2 rounded bg-tint-3 border border-tint-4">
          <span className="block text-3xs font-mono text-fg-muted">макс</span>
          <span className="text-xs font-mono font-medium text-amber-300">
            {max.toLocaleString('ru-RU')} {unit}
          </span>
        </div>
      </div>

      <div className="relative w-full h-3 bg-tint-4 rounded-full mt-1">
        <div
          className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-fg-muted via-indigo-400 to-amber-400 opacity-60"
          style={{ width: '100%' }}
        />
        {/* Median pin */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-indigo-300 rounded-sm shadow-md"
          style={{ left: `calc(${medianPos}% - 4px)` }}
          title={`Медиана: ${median}`}
        />
        {/* Mean pin */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-emerald-400 rounded-sm shadow-md"
          style={{ left: `calc(${meanPos}% - 4px)` }}
          title={`Среднее: ${mean}`}
        />
      </div>
    </div>
  );
};
