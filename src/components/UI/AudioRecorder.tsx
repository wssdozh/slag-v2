import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import type { SlagAttachment } from '../../types';

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
      } catch (mediaErr) {
        console.warn('Microphone not accessible, fallback to synthetic stream:', mediaErr);
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();
          stream = dest.stream;
        } catch {
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
          console.warn('AudioContext visualization not available:', audioErr);
        }

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.start(100);
        startTimeRef.current = Date.now();

        timerIntervalRef.current = window.setInterval(() => {
          setElapsedMs(Date.now() - startTimeRef.current);
        }, 80);
      } catch (err) {
        console.error('MediaRecorder error:', err);
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

  // Format mm:ss,t (Telegram format e.g. 0:05,8)
  const formatTelegramTimer = (ms: number) => {
    const totalSecs = ms / 1000;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mins}:${secs < 10 ? '0' : ''}${secs},${tenths}`;
  };

  return (
    <div className="flex items-center justify-between w-full px-1 py-0.5 select-none animate-in fade-in duration-150">
      {/* Left: Red Pulse + Timer mm:ss,t */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50" />
        <span className="font-mono text-sm font-semibold tracking-wider text-white">
          {formatTelegramTimer(elapsedMs)}
        </span>
      </div>

      {/* Center: Live Waveform ("Полосочка") */}
      <div className="flex-1 flex items-center justify-center px-3 max-w-xs mx-auto">
        <div className="flex items-center gap-[2.5px] h-6">
          {liveAmplitudes.map((amp, i) => {
            const height = Math.round(4 + amp * 18);
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className="w-[2.5px] rounded-full bg-[#529ee8] transition-all duration-75"
              />
            );
          })}
        </div>
      </div>

      {/* Right Controls: CANCEL text button + Blue circular send button */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleDiscard}
          className="text-xs font-semibold text-[#529ee8] hover:text-rose-400 transition-colors uppercase tracking-wider cursor-pointer px-1 py-1"
        >
          ОТМЕНА
        </button>

        <button
          type="button"
          onClick={() => handleFinish(true)}
          className="w-9 h-9 rounded-full bg-[#2a82e4] hover:bg-[#2473cb] active:scale-95 flex items-center justify-center text-white transition-all shadow-md shadow-[#2a82e4]/30 cursor-pointer"
          title="Отправить войс"
        >
          <Send className="w-4 h-4 ml-0.5 fill-current" />
        </button>
      </div>
    </div>
  );
};
