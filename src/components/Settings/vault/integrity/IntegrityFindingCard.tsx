// Карточка одной находки сканера — вынесена, чтобы панель не распухала.
import React from 'react';
import { Icon } from '../../../UI/icons/Icon';
import type { Finding } from '../../../../lib/vault/integrity/types';
import { severityLabel } from './severityLabel';

interface IntegrityFindingCardProps {
  finding: Finding;
}

export const IntegrityFindingCard: React.FC<IntegrityFindingCardProps> = ({ finding }) => {
  const sev = severityLabel(finding.severity);
  const evidence = finding.evidence ?? [];
  const extraCount = Math.max(0, evidence.length - 3);

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
      {/* severity + summary */}
      <div className="flex items-start gap-2">
        <span className={`inline-flex shrink-0 items-center text-[11px] font-mono rounded-md leading-none h-4 px-1.5 ${sev.badge}`}>
          {sev.text}
        </span>
        <span className="text-xs font-medium text-fg-soft">{finding.summary}</span>
      </div>

      {/* why */}
      {finding.why && (
        <p className="text-2xs text-fg-muted ml-6">{finding.why}</p>
      )}

      {/* path (if present) */}
      {finding.path && (
        <span className="font-mono text-2xs text-fg-dim ml-6 truncate">{finding.path}</span>
      )}

      {/* action hint */}
      {finding.action && (
        <p className="text-2xs text-fg-secondary ml-6">
          <Icon name="action.refresh" size="xs" tone="accent" className="inline mr-0.5" />
          {finding.action}
        </p>
      )}

      {/* evidence lines */}
      {evidence.length > 0 && (
        <div className="ml-6 flex flex-col gap-0.5 mt-0.5">
          {evidence.slice(0, 3).map((line, i) => (
            <code key={i} className="font-mono text-[10px] leading-snug text-fg-muted">
              {line}
            </code>
          ))}
          {extraCount > 0 && (
            <code className="text-[10px] text-fg-dim">ещё {extraCount}</code>
          )}
        </div>
      )}
    </div>
  );
};
