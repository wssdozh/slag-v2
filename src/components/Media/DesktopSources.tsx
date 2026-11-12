// Desktop's attach shortcuts: images, files and voice, each behind a system dialog.
import React, { useRef } from 'react';
import { FileUp, Images, Mic } from 'lucide-react';

interface SourceTileProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}

const SourceTile: React.FC<SourceTileProps> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-white/[0.06] bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-hover"
  >
    <span className="text-fg-secondary">{icon}</span>
    <span className="text-xs font-medium leading-tight text-fg-primary">{label}</span>
    <span className="text-[10px] leading-tight text-fg-muted">{hint}</span>
  </button>
);

export interface DesktopSourcesProps {
  onPickFiles: (files: FileList) => void;
  onRecordVoice: () => void;
}

/**
 * Desktop has no media database to browse, and its own file dialog is good, so the sheet keeps
 * the four question marks it always had: pick, record, or nothing.
 */
export const DesktopSources: React.FC<DesktopSourcesProps> = ({ onPickFiles, onRecordVoice }) => {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <SourceTile
        icon={<Images className="h-4 w-4" />}
        label="Фото и видео"
        hint="из галереи"
        onClick={() => mediaInputRef.current?.click()}
      />
      <SourceTile
        icon={<FileUp className="h-4 w-4" />}
        label="Файл"
        hint="любой документ"
        onClick={() => filesInputRef.current?.click()}
      />
      <SourceTile
        icon={<Mic className="h-4 w-4" />}
        label="Голос"
        hint="записать сейчас"
        onClick={onRecordVoice}
      />

      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        data-testid="attach-input-media"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) onPickFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        data-testid="attach-input-files"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) onPickFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
};
