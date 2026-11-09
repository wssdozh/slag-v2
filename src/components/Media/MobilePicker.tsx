import React, { useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';
import { FolderBrowser } from './FolderBrowser';
import { MediaGrid } from './MediaGrid';
import type { DevicePick, FolderEntry } from '../../types';

type PickerTab = 'image' | 'video' | 'audio' | 'files';

const TAB_OPTIONS: SegmentedOption<PickerTab>[] = [
  { value: 'image', label: 'Фото' },
  { value: 'video', label: 'Видео' },
  { value: 'audio', label: 'Аудио' },
  { value: 'files', label: 'Файлы' },
];

export interface MobilePickerProps {
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  onAttach: (picks: DevicePick[]) => void;
  onCameraFiles: (files: FileList) => void;
  onRecordVoice: () => void;
}

/**
 * The picker itself: four tabs over one selection. No title — the tab strip already says where
 * you are, and a header would only repeat it in a smaller font.
 */
export const MobilePicker: React.FC<MobilePickerProps> = ({
  selected,
  onToggle,
  onAttach,
  onCameraFiles,
  onRecordVoice,
}) => {
  const [tab, setTab] = useState<PickerTab>('image');
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const attachSystemFiles = (entries: FolderEntry[]) => {
    onAttach(entries);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="mobile-picker">
      <div className="flex justify-center">
        <ResponsiveSegmented
          value={tab}
          onChange={setTab}
          options={TAB_OPTIONS}
          ariaLabel="Тип вложения"
          className="max-w-full overflow-x-auto scrollbar-none"
        />
      </div>

      {tab === 'files' ? (
        <FolderBrowser selected={selected} onToggle={onToggle} onSystemPick={attachSystemFiles} />
      ) : tab === 'audio' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={onRecordVoice}
            className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-surface py-2 text-xs font-medium text-fg-primary transition-colors hover:bg-surface-hover"
          >
            <Mic className="h-3.5 w-3.5" /> Записать голос
          </button>
          <MediaGrid kind="audio" selected={selected} onToggle={onToggle} />
        </div>
      ) : (
        <MediaGrid
          key={tab}
          kind={tab}
          selected={selected}
          onToggle={onToggle}
          onCamera={tab === 'image' ? () => cameraRef.current?.click() : undefined}
        />
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="attach-input-camera"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) onCameraFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
};
