import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2 } from 'lucide-react';
import type { SlagAttachment } from '../../types';
import { logger } from '../../lib/logger';

const mediaLog = logger.scope('MEDIA');

interface AudioRecorderProps {
  onRecorded: (attachment: SlagAttachment, autoSend?: boolean) => void;
  onCancel: () => void;
  finishTriggerRef?: React.MutableRefObject<((autoSend?: boolean) => void) | null>;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecorded, onCancel, finishTriggerRef }) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveAmplitudes, setLiveAmplitudes] = useState<number[]>(() => new Array(24).fill(0.1));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const collectedPeaksRef = useRef<number[]>([]);

  const handleFinish = useCallback((autoSend: boolean = false) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    const finalDuration = Math.max(0.5, (Date.now() - startTimeRef.current) / 1000);
    const peaks = collectedPeaksRef.current;

    // Normalize peaks into 40 samples for the final waveform
    const finalWaveform: number[] = [];
    const targetSamples = 40;
    if (peaks.length > 0) {
      const step = peaks.length / targetSamples;
      for (let i = 0; i < targetSamples; i++) {
        const idx = Math.min(peaks.length - 1, Math.floor(i * step));
        finalWaveform.push(Math.max(0.15, Math.min(1, peaks[idx] || 0.2)));
      }
    } else {
      // Fallback
      for (let i = 0; i < targetSamples; i++) {
        finalWaveform.push(0.3 + Math.sin(i * 0.4) * 0.2);
      }
    }

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
          duration: Number(finalDuration.toFixed(1)),
          waveform: finalWaveform,
        };
        mediaLog.info(`Voice audio recording finished (${attachment.duration}s, ${attachment.size} bytes)`);
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

  const handleDiscard = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    let active = true;

    const startRecording = async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaLog.info('Microphone access granted, audio stream initialized');
      } catch (mediaErr) {
        mediaLog.warn('Microphone not accessible, fallback to synthetic stream:', mediaErr);
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();
          stream = dest.stream;
        } catch {
          mediaLog.error('Failed to initialize fallback audio stream');
          onCancel();
          return;
        }
      }

      if (!active || !stream) {
        stream?.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      try {
        // Web Audio API setup for live audio waveform
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = audioContextRef.current || new AudioContextClass();
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          sourceRef.current = source;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateLiveWave = () => {
            if (!active) return;
            analyser.getByteFrequencyData(dataArray);

            // Compute normalized amplitudes for 24 visual bars
            const barsCount = 24;
            const newBars: number[] = [];
            let sum = 0;

            for (let i = 0; i < barsCount; i++) {
              const binIdx = Math.floor((i / barsCount) * dataArray.length);
              const val = (dataArray[binIdx] || 0) / 255;
              sum += val;
              newBars.push(Math.max(0.12, Math.min(1, val * 1.5)));
            }

            const currentAverage = sum / barsCount;
            collectedPeaksRef.current.push(currentAverage);
            setLiveAmplitudes(newBars);

            animFrameRef.current = requestAnimationFrame(updateLiveWave);
          };

          animFrameRef.current = requestAnimationFrame(updateLiveWave);
        } catch (audioErr) {
          mediaLog.warn('AudioContext visualization not available:', audioErr);
        }

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.start(100);
        mediaLog.debug('MediaRecorder recording loop active');
        startTimeRef.current = Date.now();

        timerIntervalRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startTimeRef.current);
        }, 80);
      } catch (err) {
        mediaLog.error('MediaRecorder error:', err);
        onCancel();
      }
    };

    startRecording();

    return () => {
      active = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onCancel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleDiscard();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleFinish(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDiscard, handleFinish]);

  // Format mm:ss.t (clean mono format e.g. 0:05.8)
  const formatTimer = (ms: number) => {
    const totalSecs = ms / 1000;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}.${tenths}`;
  };

  return (
    <div className="flex items-center justify-between w-full h-8 px-1 select-none animate-in fade-in duration-150">
      {/* Left: Red Pulse + Timer mm:ss.t */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50" />
        <span className="font-mono text-xs font-medium tracking-wide text-zinc-300">
          {formatTimer(elapsedMs)}
        </span>
      </div>

      {/* Center: Live Waveform (Linear monochrome style) */}
      <div className="flex-1 flex items-center justify-center px-4 max-w-sm mx-auto">
        <div className="flex items-center gap-[2.5px] h-6">
          {liveAmplitudes.map((amp, i) => {
            const height = Math.round(3 + amp * 18);
            const isSpike = amp > 0.22;
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className={`w-[2.5px] rounded-full transition-all duration-75 ${
                  isSpike ? 'bg-zinc-200' : 'bg-zinc-600/70'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Right Controls: Trash2 icon button + Linear white send button */}
      <div className="flex items-center gap-1.5 shrink-0">
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
          className="w-7 h-7 rounded-lg bg-white text-black hover:bg-zinc-200 active:scale-95 flex items-center justify-center transition-all shadow-sm cursor-pointer"
          title="Отправить голосовую заметку (Enter)"
        >
          <Send className="w-3.5 h-3.5 ml-0.5 fill-current" />
        </button>
      </div>
    </div>
  );
};
