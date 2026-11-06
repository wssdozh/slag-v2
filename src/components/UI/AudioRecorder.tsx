import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2 } from 'lucide-react';
import type { SlagAttachment } from '../../types';
import { logger } from '../../lib/logger';
import { VoiceOrb } from './VoiceOrb';

const mediaLog = logger.scope('MEDIA');

interface AudioRecorderProps {
  onRecorded: (attachment: SlagAttachment, autoSend?: boolean) => void;
  onCancel: () => void;
  finishTriggerRef?: React.MutableRefObject<((autoSend?: boolean) => void) | null>;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecorded, onCancel, finishTriggerRef }) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

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
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume().catch(() => {});
          }
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.75;
          analyserRef.current = analyser;
          setAnalyserNode(analyser);
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          sourceRef.current = source;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateLiveWave = () => {
            if (!active) return;
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i] / 255;
            }
            const currentAverage = sum / dataArray.length;
            collectedPeaksRef.current.push(currentAverage);

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
    <div className="flex flex-col items-center justify-between w-full pt-1 pb-0.5 px-1 select-none motion-fade">
      {/* Centerpiece: Large Glowing Azure Liquid Orb */}
      <div className="relative my-2 flex items-center justify-center">
        <VoiceOrb analyser={analyserNode} size={116} />
      </div>

      {/* Bottom Row: Actions corner aligned + Timer centered (NO red dot) */}
      <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={handleDiscard}
          className="h-ctrl-sm px-2 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono"
          title="Отменить запись (Esc)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="text-2xs">Отмена</span>
        </button>

        {/* Clean Monospace Timer centered in the bottom row (No red dot) */}
        <div className="font-mono text-xs font-medium tracking-wider text-zinc-300 select-none">
          {formatTimer(elapsedMs)}
        </div>

        <button
          type="button"
          onClick={() => handleFinish(true)}
          className="h-ctrl-sm px-3 rounded-md bg-white text-black hover:bg-zinc-200 motion-press flex items-center gap-1.5 shadow-sm cursor-pointer text-xs font-medium"
          title="Отправить войс"
        >
          <span>Отправить</span>
          <Send className="w-3 h-3 fill-current" />
        </button>
      </div>
    </div>
  );
};
