import React, { useCallback, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { usePresence } from '../../hooks/ui/usePresence';
import {
  attachmentFromDataUrl,
  MAX_ATTACHMENT_BYTES,
  processFileListToAttachments,
} from '../../lib/media/fileDropHelper';
import { readEntryBytes } from '../../lib/media/folderBrowser';
import { formatBytes } from '../../lib/text/formatBytes';
import { logger } from '../../lib/logger/logger';
import { AudioRecorder } from '../UI/AudioRecorder';
import { Checkbox } from '../UI/Checkbox';
import { SendButton } from '../UI/SendButton';
import { SheetPanel } from '../UI/SheetPanel';
import { DesktopSources } from './DesktopSources';
import { MobilePicker } from './MobilePicker';
import type { DevicePick, SlagAttachment } from '../../types';

const mediaLog = logger.scope('MEDIA');

/**
 * One place that attaches things. On the phone it is the picker itself — tabs over the media
 * database and the folders already granted — inside the same two-detent sheet the editor uses;
 * the desktop keeps the system dialog, which is the better one there. The surface above only
 * ever receives ready attachments.
 */
export const AttachSheet: React.FC = () => {
  const { attachSheet, closeAttachSheet, isMobile, addToast } = useApp();

  const isOpen = attachSheet !== null;
  // On a phone the sheet leaves with its spring; on desktop a plain CSS fade is the exit.
  const { ref, phase, isPresent, onTransitionEnd, finishExit } = usePresence(isOpen, {
    manualExit: isMobile,
    // The spring draws the entrance too; the extra `entering` frame is a stutter on the phone.
    skipEntering: isMobile,
  });

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
      ref={ref}
      data-testid="attach-sheet"
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      aria-hidden={!isOpen || undefined}
      className="fixed inset-0 z-[115] flex select-none flex-col justify-end motion-fade motion-scrim-hold"
    >
      <SheetPanel
        enabled={isMobile}
        expanded={isPickerFullscreen}
        exiting={phase === 'exiting'}
        onExpandedChange={setIsPickerFullscreen}
        onDismiss={dismiss}
        onExited={finishExit}
        rest={0.22}
        testId="attach-sheet-panel"
        scrimClassName="bg-black/85"
        panelClassName={`w-full bg-canvas-subtle border-t border-white/[0.08] rounded-t-2xl sm:mx-auto sm:max-w-[420px] sm:rounded-2xl sm:border ${
          // On a phone the spring owns the panel's transform; on desktop the sheet keeps sliding in.
          isMobile ? '' : 'motion-sheet'
        }`}
        contentClassName={`flex min-h-0 flex-col gap-2 p-3 pb-[max(var(--sab),0.75rem)] ${
          // Unfolded the sheet reaches the top edge, where the status bar sits.
          isMobile && isPickerFullscreen ? 'pt-[max(var(--sat),0.75rem)]' : ''
        }`}
      >
        {({ setBody, setBar }) => (
          <>
            {isMobile ? (
              <MobilePicker
                bodyRef={setBody}
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

            <div
              ref={isMobile ? setBar : undefined}
              data-testid="attach-footer"
              className={
                isMobile
                  // The bar rides the panel's counter-translate, so it stays on the screen edge.
                  ? 'absolute inset-x-0 bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-white/[0.08] bg-canvas-subtle px-3 pb-[max(var(--sab),0.75rem)] pt-2'
                  : 'flex shrink-0 items-center gap-2 pt-1'
              }
            >
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
                  <SendButton
                    size="lg"
                    onClick={() => void attachPicked(selected)}
                    disabled={selected.length === 0 || isAttaching}
                    label={isAttaching ? 'Прикрепляю…' : 'Прикрепить'}
                  />
                </>
              )}
            </div>
          </>
        )}
      </SheetPanel>

      {isRecordingVoice && (
        <AudioRecorder onRecorded={addRecorded} onCancel={() => setIsRecordingVoice(false)} />
      )}
    </div>
  );
};
