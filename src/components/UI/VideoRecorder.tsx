import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, RefreshCw, Trash2 } from 'lucide-react';
import type { SlagAttachment } from '../../types';
import { logger } from '../../lib/logger';
import { THEME_COLORS } from '../../styles/theme';

const mediaLog = logger.scope('MEDIA');

interface VideoRecorderProps {
  onRecorded: (attachment: SlagAttachment, autoSend?: boolean) => void;
  onCancel: () => void;
  finishTriggerRef?: React.MutableRefObject<((autoSend?: boolean) => void) | null>;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ onRecorded, onCancel, finishTriggerRef }) => {
  const MAX_SECONDS = 60;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const handleFinish = useCallback((autoSend: boolean = false) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    const finalDuration = Math.max(0.5, (Date.now() - startTimeRef.current) / 1000);

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const id = 'att_vid_' + Date.now();
        const attachment: SlagAttachment = {
          id,
          name: `circle_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`,
          type: 'video',
          mimeType: 'video/webm',
          size: blob.size,
          relativePath: `.attachments/${id}.webm`,
          dataUrl: base64,
          duration: Number(finalDuration.toFixed(1)),
        };
        mediaLog.info(`Video circle recording finished (${attachment.duration}s, ${attachment.size} bytes)`);
        onRecorded(attachment, autoSend);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorderRef.current.stop();
  }, [onRecorded]);

  useEffect(() => {
    if (finishTriggerRef) {
      finishTriggerRef.current = (autoSend: boolean = true) => handleFinish(autoSend);
      return () => {
        finishTriggerRef.current = null;
      };
    }
  }, [finishTriggerRef, handleFinish]);

  // Auto-stop at 60s limit
  useEffect(() => {
    if (elapsedMs >= MAX_SECONDS * 1000) {
      handleFinish();
    }
  }, [elapsedMs, handleFinish]);

  const handleDiscard = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    let active = true;

    const initCamera = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 480 },
              height: { ideal: 480 },
              aspectRatio: 1,
              facingMode,
            },
            audio: true,
          });
          mediaLog.info(`Camera & mic access granted (${facingMode})`);
        } catch (mediaErr) {
          mediaLog.warn('Camera/Mic not accessible, fallback to synthetic stream:', mediaErr);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = THEME_COLORS.surfaceElevated;
              ctx.fillRect(0, 0, 480, 480);
            }
            stream = canvas.captureStream(15);
          } catch {
            mediaLog.error('Failed to initialize fallback video stream');
            onCancel();
            return;
          }
        }

        if (!active || !stream) {
          stream?.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm',
        });
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.start(100);
        mediaLog.debug('Video MediaRecorder recording loop active');
        startTimeRef.current = Date.now();
        setIsReady(true);

        timerIntervalRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startTimeRef.current);
        }, 80);
      } catch (err) {
        mediaLog.error('Camera/Microphone error:', err);
        onCancel();
      }
    };

    initCamera();

    return () => {
      active = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [facingMode, onCancel]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const progressFraction = Math.min(1, elapsedMs / (MAX_SECONDS * 1000));
  const radius = 106;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progressFraction * circumference;

  const formatTelegramTimer = (ms: number) => {
    const totalSecs = ms / 1000;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mins}:${secs < 10 ? '0' : ''}${secs},${tenths}`;
  };

  return (
    <div className="flex flex-col items-center gap-2.5 p-1 select-none animate-in fade-in w-full max-w-sm mx-auto">
      {/* Telegram Circular Video Preview with SVG Progress Ring */}
      <div className="relative w-52 h-52 sm:w-60 sm:h-60 rounded-full overflow-hidden bg-black border-2 border-white/20 shadow-2xl">
        <video
          ref={videoPreviewRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* Circular Progress Arc */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none -rotate-90"
          viewBox="0 0 240 240"
        >
          <circle
            cx="120"
            cy="120"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="4"
          />
          <circle
            cx="120"
            cy="120"
            r={radius}
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-75"
          />
        </svg>

        {/* Switch Camera Button floating inside circle */}
        <button
          type="button"
          onClick={toggleCamera}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/60 backdrop-blur-md text-white/90 hover:text-white border border-white/10 hover:bg-black/80 transition-all cursor-pointer"
          title="Сменить камеру"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Bar: Red pulse timer, Trash2, Linear White Send Button */}
      <div className="flex items-center justify-between w-full px-1 py-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/40" />
          <span className="font-mono text-xs font-medium text-zinc-300">
            {formatTelegramTimer(elapsedMs)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDiscard}
            className="w-7 h-7 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center justify-center"
            title="Отменить запись (Esc)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleFinish(true)}
            disabled={!isReady}
            className="w-7 h-7 rounded-lg bg-white text-black hover:bg-zinc-200 active:scale-95 flex items-center justify-center transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Отправить видео-сообщение (Enter)"
          >
            <Send className="w-3.5 h-3.5 ml-0.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
