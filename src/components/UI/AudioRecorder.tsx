import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Check } from 'lucide-react';
import type { SlagAttachment } from '../../types';

interface AudioRecorderProps {
  onRecorded: (attachment: SlagAttachment) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecorded, onCancel }) => {
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startRecording = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.start();

        timerRef.current = window.setInterval(() => {
          setSeconds(s => s + 1);
        }, 1000);
      } catch (err) {
        console.error('Microphone access denied:', err);
        onCancel();
      }
    };

    startRecording();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onCancel]);

  const handleFinish = () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const id = 'att_audio_' + Date.now();
        const attachment: SlagAttachment = {
          id,
          name: `voice_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`,
          type: 'audio',
          mimeType: 'audio/webm',
          size: blob.size,
          relativePath: `.attachments/${id}.webm`,
          dataUrl: base64,
        };
        onRecorded(attachment);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorderRef.current.stop();
  };

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
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 animate-in fade-in">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
      <span className="font-mono text-xs">{formatTimer(seconds)}</span>
      <span className="text-xs text-zinc-400">Запись голосовой заметки...</span>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={handleDiscard}
          title="Отмена"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleFinish}
          title="Прикрепить войс"
          className="p-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
