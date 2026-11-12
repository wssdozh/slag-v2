// The phone picker: photo, video, audio and file tabs over one selection, plus fullscreen.
import React, { useRef, useState } from 'react';
import { Maximize2, Mic, Minimize2 } from 'lucide-react';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';
import { FolderBrowser } from './FolderBrowser';
import { MediaGrid } from './MediaGrid';
import type { DevicePick } from '../../types';

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
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Handed to whichever scroller is on screen, so the sheet can fold from its top edge. */
  bodyRef?: (node: HTMLDivElement | null) => void;
}

/**
 * The picker itself: four tabs over one selection, and a second state that fills the screen the
 * way the focus editor does. No title — the tab strip already says where you are.
 */
export const MobilePicker: React.FC<MobilePickerProps> = ({
  selected,
  onToggle,
  onAttach,
  onCameraFiles,
  onRecordVoice,
  isFullscreen,
  onToggleFullscreen,
  bodyRef,
}) => {
  const [tab, setTab] = useState<PickerTab>('image');
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const attachSelected = () => onAttach(selected);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="mobile-picker">
      <div className="relative flex shrink-0 justify-center">
        <ResponsiveSegmented
          value={tab}
          onChange={setTab}
          options={TAB_OPTIONS}
          ariaLabel="Тип вложения"
          className="max-w-full overflow-x-auto scrollbar-none"
        />
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Свернуть' : 'На весь экран'}
          className="absolute right-0 top-0 cursor-pointer rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {tab === 'files' ? (
        <FolderBrowser selected={selected} onToggle={onToggle} onSystemPick={onAttach} bodyRef={bodyRef} />
      ) : tab === 'audio' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={onRecordVoice}
            className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-surface py-2 text-xs font-medium text-fg-primary transition-colors hover:bg-surface-hover"
          >
            <Mic className="h-3.5 w-3.5" /> Записать голос
          </button>
          <MediaGrid
            kind="audio"
            selected={selected}
            onToggle={onToggle}
            onAttachSelected={attachSelected}
            bodyRef={bodyRef}
          />
        </div>
      ) : (
        <MediaGrid
          key={tab}
          kind={tab}
          selected={selected}
          onToggle={onToggle}
          onAttachSelected={attachSelected}
          onCamera={tab === 'image' ? () => cameraRef.current?.click() : undefined}
          bodyRef={bodyRef}
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
