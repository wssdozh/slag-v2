// The log viewer, docked inside settings instead of floating over the feed.
import React from 'react';
import { LogViewer } from '../Logs/LogViewer';

export const LogsSettingsTab: React.FC = () => {
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden rounded-xl border border-border-subtle">
      <LogViewer variant="dock" />
    </div>
  );
};
