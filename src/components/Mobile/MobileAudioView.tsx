// Phone frame for the audio panel: safe-area padding and nothing of its own.
import React from 'react';
import { AudioPanel } from '../Audio/AudioPanel';

export const MobileAudioView: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none relative pt-[max(var(--sat),0px)]">
      {/* Main Content: Full Audio Panel */}
      <AudioPanel />
    </div>
  );
};
