import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import type { SlagAttachment } from '../../types';
import { logger } from '../../lib/logger';

const mediaLog = logger.scope('MEDIA');

interface VideoRecorderProps {
  onRecorded: (attachment: SlagAttachment, autoSend?: boolean) => void;
  onCancel: () => void;
  finishTriggerRef?: React.MutableRefObject<((autoSend?: boolean) => void) | null>;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ onRecorded, onCancel, finishTriggerRef }) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const closeThen = useCallback((after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(after, 230);
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
      const mime = mediaRecorderRef.current?.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mime });

      if (blob.size === 0) {
        setError('запись пустая, попробуй ещё раз');
        return;
      }

      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const id = 'att_vid_' + Date.now();
        const attachment: SlagAttachment = {
          id,
          name: `square_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`,
          type: 'video',
          mimeType: mime,
          size: blob.size,
          relativePath: `.attachments/${id}.${ext}`,
          dataUrl: base64,
          duration: Number(Math.max(0.5, (Date.now() - startTimeRef.current) / 1000).toFixed(1)),
        };
        mediaLog.info(`Video note finished (${attachment.duration}s, ${attachment.size} bytes)`);
        closeThen(() => onRecorded(attachment, autoSend));
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorderRef.current.stop();
  }, [onRecorded, closeThen]);

  // init must not restart on parent re-render: keep the latest finisher in a ref.
  const finishRef = useRef(handleFinish);
  useEffect(() => {
    finishRef.current = handleFinish;
  }, [handleFinish]);

  useEffect(() => {
    if (finishTriggerRef) {
      finishTriggerRef.current = (autoSend: boolean = true) => handleFinish(autoSend);
      return () => { finishTriggerRef.current = null; };
    }
  }, [finishTriggerRef, handleFinish]);

  const init = useCallback(async () => {
    chunksRef.current = [];
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setIsReady(true);

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= 60000) finishRef.current(true);
      }, 100);

    } catch (err) {
      mediaLog.error('VideoRecorder init error:', err);
      streamRef.current?.getTracks().forEach(t => t.stop());
      setError('нет доступа к камере и микрофону. разреши доступ в настройках приложения');
    }
  }, []);

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

  return createPortal(
    <div className={`fixed inset-0 z-[200] flex flex-col px-2 pt-[max(var(--sat),1rem)] pb-[max(var(--sab),0.5rem)] record-overlay ${isClosing ? 'record-overlay-out pointer-events-none' : ''}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <div className={`relative aspect-square w-[min(82vw,340px)] rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-2xl record-card ${isClosing ? 'record-card-out' : ''} flex flex-col`}>
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
              <p className="text-sm text-zinc-300">{error}</p>
              <button onClick={() => { setError(null); setIsReady(false); void init(); }} className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium">Повторить</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full min-h-0 object-cover scale-x-[-1]" />

              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-xs font-mono text-zinc-300">включаю камеру…</span>
                </div>
              )}

              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/15">
                <div className="h-full bg-white transition-all duration-100" style={{ width: `${Math.min(100, (elapsedMs / 60000) * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`relative w-full max-w-2xl mx-auto grid grid-cols-3 items-center gap-2 rounded-2xl bg-surface-elevated border border-white/[0.12] p-2 shadow-2xl shadow-black/50 record-bar ${isClosing ? 'record-bar-out' : ''}`}>
        <div className="flex items-center gap-2 pl-1">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-zinc-500' : 'bg-rose-500 animate-pulse'}`} />
          <span className="font-mono text-xs text-zinc-300">{(elapsedMs / 1000).toFixed(1)}s</span>
        </div>
        <button type="button" onClick={cancelAndClose} className="justify-self-center h-ctrl-sm px-3 rounded-md text-xs font-medium text-accent hover:bg-accent-subtle transition-colors">отмена</button>
        {error ? (
          <span className="w-ctrl-sm h-ctrl-sm justify-self-end" />
        ) : (
          <button type="button" onClick={() => handleFinish(true)} disabled={!isReady} className="justify-self-end w-ctrl-sm h-ctrl-sm rounded-full bg-accent-strong disabled:opacity-50 text-white flex items-center justify-center motion-press" aria-label="Отправить видео">
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
