import React from 'react';
import { Music } from 'lucide-react';
import { MobileScreenHeader } from './MobileScreenHeader';
import { AudioPanel } from '../Audio/AudioPanel';
import { useApp } from '../../context/AppContext';

export const MobileAudioView: React.FC = () => {
  const { currentFolder } = useApp();

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none relative">
      {/* Top Header */}
      <MobileScreenHeader
        title="Плеер"
        subtitle={currentFolder || 'Входящие'}
        icon={<Music className="w-3.5 h-3.5 text-zinc-300" />}
      />

      {/* Main Content: Full Audio Panel */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <AudioPanel />
      </div>
    </div>
  );
};
