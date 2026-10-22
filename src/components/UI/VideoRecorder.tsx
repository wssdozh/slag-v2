import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, Check } from 'lucide-react';
import type { SlagAttachment } from '../../types';

interface VideoRecorderProps {
  onRecorded: (attachment: SlagAttachment) => void;
  onCancel: () => void;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ onRecorded, onCancel }) => {
  const MAX_SECONDS = 60;
  const [seconds, setSeconds] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const handleFinish = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const id = 'att_vid_' + Date.now();
        const attachment: SlagAttachment = {
          id,
          name: `square_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`,
          type: 'video',
          mimeType: 'video/webm',
          size: blob.size,
          relativePath: `.attachments/${id}.webm`,
          dataUrl: base64,
        };
        onRecorded(attachment);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorderRef.current.stop();
  }, [onRecorded]);

  // Auto-stop at 60s limit
  useEffect(() => {
    if (seconds >= MAX_SECONDS) {
      handleFinish();
    }
  }, [seconds, handleFinish]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480 },
            height: { ideal: 480 },
            aspectRatio: 1,
            facingMode: 'user',
          },
          audio: true,
        });

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

        mediaRecorder.start(250);
        setIsReady(true);

        timerRef.current = window.setInterval(() => {
          setSeconds(s => s + 1);
        }, 1000);
      } catch (err) {
        console.error('Camera/Microphone error:', err);
        onCancel();
      }
    };

    startCamera();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [onCancel]);

  const handleDiscard = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    onCancel();
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[#141417] border border-white/[0.08] shadow-2xl animate-in fade-in max-w-xs mx-auto">
      {/* Square Camera Preview */}
      <div className="relative w-44 h-44 rounded-2xl overflow-hidden bg-black border border-white/[0.1] shadow-inner">
        <video
          ref={videoPreviewRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />

        {/* Pulse recording badge with 60s max */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-mono text-white border border-white/10">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span>{formatTimer(seconds)} / 01:00</span>
        </div>
      </div>

      <div className="flex items-center justify-between w-full px-2 text-xs">
        <button
          onClick={handleDiscard}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06] transition-colors"
          title="Отмена"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <span className="text-[11px] text-zinc-500 font-medium">Видео-квадратик</span>

        <button
          onClick={handleFinish}
          disabled={!isReady}
          className="px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors flex items-center gap-1.5"
          title="Прикрепить видео"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Готово</span>
        </button>
      </div>
    </div>
  );
};
