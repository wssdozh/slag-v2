// Records a voice memo in a bottom bar, previews its length, then hands the clip over.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons/Icon';
import type { SlagAttachment } from '../../types';
import { logger } from '../../lib/logger/logger';

const mediaLog = logger.scope('MEDIA');

interface AudioRecorderProps {
  onRecorded: (attachment: SlagAttachment, autoSend?: boolean) => void;
  onCancel: () => void;
  finishTriggerRef?: React.MutableRefObject<((autoSend?: boolean) => void) | null>;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecorded, onCancel, finishTriggerRef }) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  /** Which `init` attempt is allowed to own the recorder; see the guard inside it. */
  const initRunRef = useRef(0);

  // Keep the bar on screen for the exit animation, then hand control back.
  const closeThen = useCallback((after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(after, 200);
  }, []);

  const stopCapture = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const cancelAndClose = useCallback(() => {
    stopCapture();
    closeThen(onCancel);
  }, [stopCapture, closeThen, onCancel]);

  const handleFinish = useCallback((autoSend: boolean = false) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    mediaRecorderRef.current.onstop = () => {
      // The container, not the encoder's codec list: `audio/webm;codecs=opus` carries a comma,
      // and a data URL splits on the first one — the memo then reads as unreadable.
      const mime = (mediaRecorderRef.current?.mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: mime });

      if (blob.size === 0) {
        setError('запись пустая, попробуй ещё раз');
        return;
      }

      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const id = 'att_audio_' + Date.now();
        const attachment: SlagAttachment = {
          id,
          name: `voice_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`,
          type: 'audio',
          mimeType: mime,
          size: blob.size,
          relativePath: `.attachments/${id}.${ext}`,
          dataUrl: base64,
          duration: Number(Math.max(0.5, (Date.now() - startTimeRef.current) / 1000).toFixed(1)),
        };
        closeThen(() => onRecorded(attachment, autoSend));
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorderRef.current.stop();
  }, [onRecorded, closeThen]);

  useEffect(() => {
    if (finishTriggerRef) {
      finishTriggerRef.current = (autoSend: boolean = true) => handleFinish(autoSend);
      return () => { finishTriggerRef.current = null; };
    }
  }, [finishTriggerRef, handleFinish]);

  const init = useCallback(async () => {
    // StrictMode's double effect and the retry button both start another take; only the newest
    // attempt may own the recorder, or two of them interleave chunks into one unreadable file.
    const run = initRunRef.current + 1;
    initRunRef.current = run;
    chunksRef.current = [];
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== initRunRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      
      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

    } catch (err) {
      mediaLog.error('AudioRecorder init error:', err);
      streamRef.current?.getTracks().forEach(t => t.stop());
      setError('нет доступа к микрофону. разреши доступ в настройках приложения');
    }
  }, []);

  // Esc closes, Enter sends — same contract the inline recorder had.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelAndClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleFinish(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelAndClose, handleFinish]);

  // The effect only starts the external media pipeline; the ref keeps retry current.
  const initRef = useRef(init);
  useEffect(() => {
    initRef.current = init;
  }, [init]);

  useEffect(() => {
    void initRef.current();
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [init]);

  const formatTimer = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const t = Math.floor((ms % 1000) / 100);
    return `${m}:${sec < 10 ? '0' : ''}${sec}.${t}`;
  };

  return (
    <div
      data-testid="audio-recorder"
      className={`w-full select-none flex flex-col gap-2 rounded-2xl bg-surface-elevated p-2 record-bar ${
        isClosing ? 'record-bar-out pointer-events-none' : ''
      }`}
    >
      {error && <p className="px-1 text-xs text-fg-tertiary">{error}</p>}

      <div className="grid grid-cols-3 items-center gap-2">
        <div className="flex items-center gap-2 pl-1">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-fg-muted' : 'bg-rose-500 animate-pulse'}`} />
          <span className="font-mono text-xs text-fg-tertiary">{formatTimer(elapsedMs)}</span>
        </div>

        <div className="justify-self-center flex items-center gap-2">
          <button type="button" onClick={cancelAndClose} className="h-ctrl-sm px-3 rounded-md text-xs font-medium text-accent hover:bg-accent-subtle transition-colors">отмена</button>
          {error && (
            <button type="button" onClick={() => { setError(null); void init(); }} className="h-ctrl-sm px-3 rounded-md text-xs font-medium text-fg-tertiary hover:bg-surface-hover transition-colors">повторить</button>
          )}
        </div>

        {error ? (
          <span className="w-ctrl-sm h-ctrl-sm justify-self-end" />
        ) : (
          <button type="button" onClick={() => handleFinish(true)} className="justify-self-end w-ctrl-sm h-ctrl-sm rounded-full bg-accent-strong text-white flex items-center justify-center motion-press" aria-label="Отправить аудио">
            <Icon name="action.send" size="md" tone="inherit" />
          </button>
        )}
      </div>
    </div>
  );
};
