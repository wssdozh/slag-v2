import React, { useCallback, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { usePresence } from '../../hooks/usePresence';
import { useSheetDrag } from '../../hooks/gestures/useSheetDrag';
import {
  attachmentFromDataUrl,
  MAX_ATTACHMENT_BYTES,
  processFileListToAttachments,
} from '../../lib/media/fileDropHelper';
import { readEntryBytes } from '../../lib/media/folderBrowser';
import { formatBytes } from '../../lib/formatBytes';
import { logger } from '../../lib/logger';
import { AudioRecorder } from '../UI/AudioRecorder';
import { Checkbox } from '../UI/Checkbox';
import { DesktopSources } from './DesktopSources';
import { MobilePicker } from './MobilePicker';
import type { DevicePick, SlagAttachment } from '../../types';

const mediaLog = logger.scope('MEDIA');

/**
 * One place that attaches things. On the phone it is the picker itself — tabs over the media
 * database and the folders already granted — while the desktop keeps the system dialog, which is
 * the better one there. The surface above only ever receives ready attachments.
 */
export const AttachSheet: React.FC = () => {
  const { attachSheet, closeAttachSheet, isMobile, addToast } = useApp();

  const isOpen = attachSheet !== null;
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  const [selected, setSelected] = useState<DevicePick[]>([]);
  const [noCompress, setNoCompress] = useState(false);
  const [isPickerFullscreen, setIsPickerFullscreen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  /** Closing always drops the selection: a half-picked folder must not resurface next time. */
  const dismiss = useCallback(() => {
    setSelected([]);
    setIsPickerFullscreen(false);
    closeAttachSheet();
  }, [closeAttachSheet]);

  const { panelRef, scrimRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle } =
    useSheetDrag({ isOpen, onDismiss: dismiss });

  const handOver = useCallback((attachments: SlagAttachment[]) => {
    if (attachments.length > 0) attachSheet?.onAdd(attachments);
    setSelected([]);
    setIsPickerFullscreen(false);
    closeAttachSheet();
  }, [attachSheet, closeAttachSheet]);

  const addFiles = useCallback(async (files: FileList) => {
    try {
      handOver(await processFileListToAttachments(files, !noCompress));
    } catch (error) {
      mediaLog.error('File conversion failed', error);
      addToast('Не удалось прочитать файл', 'error');
    }
  }, [addToast, handOver, noCompress]);

  const attachPicked = useCallback(async (picks: DevicePick[]) => {
    if (picks.length === 0) return;
    setIsAttaching(true);
    const ready: SlagAttachment[] = [];
    try {
      for (const pick of picks) {
        if (pick.size > MAX_ATTACHMENT_BYTES) {
          addToast(`«${pick.name}» больше 25 МБ — пропустил`, 'error');
          continue;
        }
        const dataUrl = await readEntryBytes(pick.uri, pick.mimeType);
        ready.push(await attachmentFromDataUrl({
          name: pick.name,
          mimeType: pick.mimeType,
          size: pick.size,
          dataUrl,
          compress: !noCompress,
        }));
      }
      handOver(ready);
    } catch (error) {
      mediaLog.error('Picked file read failed', error);
      addToast('Не удалось прочитать файл', 'error');
    } finally {
      setIsAttaching(false);
    }
  }, [addToast, handOver, noCompress]);

  const togglePick = useCallback((pick: DevicePick) => {
    setSelected((prev) => (
      prev.some((current) => current.uri.uri === pick.uri.uri)
        ? prev.filter((current) => current.uri.uri !== pick.uri.uri)
        : [...prev, pick]
    ));
  }, []);

  const addRecorded = useCallback((attachment: SlagAttachment) => {
    setIsRecordingVoice(false);
    handOver([attachment]);
  }, [handOver]);

  if (!isPresent) return null;

  const selectedBytes = selected.reduce((total, pick) => total + pick.size, 0);

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
      onClick={dismiss}
      className="fixed inset-0 z-[115] flex select-none flex-col justify-end bg-black/85 motion-fade motion-scrim-hold"
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        data-testid="attach-sheet-panel"
        data-motion-state={phase}
        className={`flex w-full min-h-0 flex-col gap-2 bg-canvas-subtle p-3 motion-sheet transition-[height] duration-200 ease-out sm:mx-auto sm:max-w-[420px] border-t border-white/[0.08] sm:border ${
          isPickerFullscreen ? 'rounded-none sm:rounded-none' : 'rounded-t-2xl sm:rounded-2xl'
        }`}
        style={{
          paddingBottom: isMobile ? 'max(var(--sab), 0.75rem)' : undefined,
          height: isMobile ? (isPickerFullscreen ? '100dvh' : '78dvh') : undefined,
          transitionTimingFunction: 'var(--ease-settle)',
          ...panelStyle,
        }}
      >
        {!(isMobile && isPickerFullscreen) && (
          <div
            data-sheet-handle
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerCancel}
            style={{ touchAction: 'none' }}
            className="flex shrink-0 flex-col gap-2"
          >
            <div className="mx-auto mb-1 h-1 w-8 shrink-0 rounded-full bg-white/20" />
          </div>
        )}

        {isMobile ? (
          <MobilePicker
            selected={selected}
            onToggle={togglePick}
            onAttach={(picks) => void attachPicked(picks)}
            onCameraFiles={(files) => void addFiles(files)}
            onRecordVoice={() => setIsRecordingVoice(true)}
            isFullscreen={isPickerFullscreen}
            onToggleFullscreen={() => setIsPickerFullscreen((prev) => !prev)}
          />
        ) : (
          <DesktopSources
            onPickFiles={(files) => void addFiles(files)}
            onRecordVoice={() => setIsRecordingVoice(true)}
          />
        )}

        <div className="flex shrink-0 items-center gap-2 pt-1">
          <Checkbox
            checked={noCompress}
            onChange={setNoCompress}
            label="не сжимать"
            className="text-fg-secondary"
          />

          {isMobile && (
            <>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-muted">
                {selected.length > 0 ? `${selected.length} · ${formatBytes(selectedBytes)}` : ''}
              </span>
              <button
                type="button"
                disabled={selected.length === 0 || isAttaching}
                onClick={() => void attachPicked(selected)}
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  selected.length === 0 || isAttaching
                    ? 'cursor-not-allowed bg-surface text-fg-dim'
                    : 'cursor-pointer bg-accent-strong text-white hover:bg-accent-strong/90'
                }`}
              >
                {isAttaching ? 'Прикрепляю…' : 'Прикрепить'}
              </button>
            </>
          )}
        </div>
      </div>

      {isRecordingVoice && (
        <AudioRecorder onRecorded={addRecorded} onCancel={() => setIsRecordingVoice(false)} />
      )}
    </div>
  );
};
