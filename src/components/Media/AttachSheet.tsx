import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileUp, Images, Mic } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePresence } from '../../hooks/usePresence';
import { useSheetDrag } from '../../hooks/gestures/useSheetDrag';
import { processFileListToAttachments } from '../../lib/media/fileDropHelper';
import { isDeviceGalleryAvailable, pingDeviceGallery } from '../../lib/media/deviceGallery';
import { logger } from '../../lib/logger';
import { AudioRecorder } from '../UI/AudioRecorder';
import type { SlagAttachment } from '../../types';

const mediaLog = logger.scope('MEDIA');

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
    className="flex flex-col items-start gap-1 rounded-xl border border-white/[0.06] bg-surface px-3 py-2.5 text-left hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer"
  >
    <span className="text-fg-secondary">{icon}</span>
    <span className="text-xs font-medium text-fg-primary leading-tight">{label}</span>
    <span className="text-[10px] text-fg-muted leading-tight">{hint}</span>
  </button>
);

/**
 * One place that attaches things: photos and videos, an arbitrary file, a voice note, a photo
 * from the camera. It owns the hidden file inputs, the platform file chooser is behind them,
 * and the surface only receives ready attachments.
 */
export const AttachSheet: React.FC = () => {
  const { attachSheet, closeAttachSheet, isMobile, addToast } = useApp();

  const isOpen = attachSheet !== null;
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isOpen);
  const { panelRef, scrimRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle } =
    useSheetDrag({ isOpen, onDismiss: closeAttachSheet });

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const attachments = await processFileListToAttachments(files);
      if (attachments.length > 0) attachSheet?.onAdd(attachments);
    } catch {
      addToast('Не удалось прочитать файл', 'error');
    }
    closeAttachSheet();
  }, [attachSheet, closeAttachSheet, addToast]);

  const addRecorded = useCallback((attachment: SlagAttachment) => {
    attachSheet?.onAdd([attachment]);
    setIsRecordingVoice(false);
    closeAttachSheet();
  }, [attachSheet, closeAttachSheet]);

  // Spike: prove the Kotlin side answers before the grid is built on top of it.
  useEffect(() => {
    if (!isDeviceGalleryAvailable()) return;
    void pingDeviceGallery()
      .then((result) => mediaLog.info(`Gallery bridge answered: sdk ${result.sdk}`))
      .catch((error: unknown) => mediaLog.error('Gallery bridge failed', error));
  }, []);

  if (!isPresent) return null;

  return (
    <div
      ref={(node) => {
        ref.current = node;
        scrimRef.current = node;
      }}
      data-testid="attach-sheet"
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      aria-hidden={!isOpen || undefined}
      onClick={closeAttachSheet}
      className="fixed inset-0 z-[115] bg-black/85 flex flex-col justify-end motion-fade motion-scrim-hold select-none"
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        data-testid="attach-sheet-panel"
        data-motion-state={phase}
        className="w-full sm:max-w-[420px] sm:mx-auto bg-canvas-subtle border-t sm:border border-white/[0.08] rounded-t-2xl sm:rounded-2xl p-3 flex flex-col gap-2 motion-sheet"
        style={{ paddingBottom: isMobile ? 'max(var(--sab), 0.75rem)' : undefined, ...panelStyle }}
      >
        <div
          data-sheet-handle
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerCancel}
          style={{ touchAction: 'none' }}
          className="flex flex-col gap-2 shrink-0"
        >
          <div className="w-8 h-1 bg-white/20 rounded-full mx-auto shrink-0 mb-1" />
          <div className="px-1 pb-1">
            <p className="text-xs font-medium text-fg-primary">Прикрепить</p>
            <p className="text-[10px] text-fg-muted">Файл ляжет в .attachments заметки</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SourceTile
            icon={<Images className="w-4 h-4" />}
            label="Фото и видео"
            hint="из галереи"
            onClick={() => mediaInputRef.current?.click()}
          />
          <SourceTile
            icon={<FileUp className="w-4 h-4" />}
            label="Файл"
            hint="любой документ"
            onClick={() => filesInputRef.current?.click()}
          />
          <SourceTile
            icon={<Mic className="w-4 h-4" />}
            label="Голос"
            hint="записать сейчас"
            onClick={() => setIsRecordingVoice(true)}
          />
          {isMobile && (
            <SourceTile
              icon={<Camera className="w-4 h-4" />}
              label="Камера"
              hint="снять фото"
              onClick={() => cameraInputRef.current?.click()}
            />
          )}
        </div>

        <input
          ref={mediaInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          data-testid="attach-input-media"
          className="hidden"
          onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }}
        />
        <input
          ref={filesInputRef}
          type="file"
          multiple
          data-testid="attach-input-files"
          className="hidden"
          onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="attach-input-camera"
          className="hidden"
          onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }}
        />
      </div>

      {isRecordingVoice && (
        <AudioRecorder onRecorded={addRecorded} onCancel={() => setIsRecordingVoice(false)} />
      )}
    </div>
  );
};
