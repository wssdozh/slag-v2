// The shared blank slate: an icon, one line of why it is empty, an optional action.
import React from 'react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center select-none ${className}`}>
      <div className="w-12 h-12 rounded-full bg-tint-3 border border-tint-5 flex items-center justify-center mb-3 text-fg-dim">
        {icon}
      </div>
      <p className="text-xs font-medium text-fg-secondary">{title}</p>
      {description && (
        <p className="text-2xs text-fg-dim mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
};
