import { useState, useRef, useEffect } from 'react';
import { UI_DELAYS } from '../config';

export interface UseComposerMediaOptions {
  onCancel?: () => void;
  onAutoSend?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function useComposerMedia(options: UseComposerMediaOptions = {}) {
  const { addToast } = options;
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordMode, setRecordMode] = useState<'idle' | 'holding' | 'locked'>('idle');
  const [lockHint, setLockHint] = useState<'audio' | 'video' | null>(null);
  const [mobileMediaType, setMobileMediaType] = useState<'audio' | 'video'>('audio');

  const pointerStartRef = useRef<{ x: number; y: number; time: number; target: 'audio' | 'video' } | null>(null);
  const triggerFinishRef = useRef<((autoSend?: boolean) => void) | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  // Clear hold timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (isRecordingAudio || isRecordingVideo) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const currentTarget = mobileMediaType;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      target: currentTarget,
    };

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    // Hold threshold to differentiate single tap (toggle audio/video) from holding (record)
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setRecordMode('holding');
      setLockHint(currentTarget);
      if (currentTarget === 'audio') {
        setIsRecordingVideo(false);
        setIsRecordingAudio(true);
      } else {
        setIsRecordingAudio(false);
        setIsRecordingVideo(true);
      }
      try {
        navigator.vibrate?.(UI_DELAYS.HAPTIC_VIBRATION_MS);
      } catch {}
    }, UI_DELAYS.HOLD_TO_RECORD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dy = e.clientY - pointerStartRef.current.y;
    const dx = e.clientX - pointerStartRef.current.x;

    // If hold timer is still pending and user moved noticeably, trigger hold immediately
    if (holdTimerRef.current && (dy < -15 || dx < -15)) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      const target = pointerStartRef.current.target;
      setRecordMode('holding');
      setLockHint(target);
      if (target === 'audio') {
        setIsRecordingVideo(false);
        setIsRecordingAudio(true);
      } else {
        setIsRecordingAudio(false);
        setIsRecordingVideo(true);
      }
    }

    if (recordMode !== 'holding') return;

    // Swipe up -> Lock hands-free recording
    if (dy < -35) {
      setRecordMode('locked');
      setLockHint(null);
      pointerStartRef.current = null;
      try {
        navigator.vibrate?.(10);
      } catch {}
      return;
    }

    // Swipe left -> Cancel
    if (dx < -55) {
      setIsRecordingAudio(false);
      setIsRecordingVideo(false);
      setRecordMode('idle');
      setLockHint(null);
      pointerStartRef.current = null;
      addToast?.('Запись отменена', 'info');
      try {
        navigator.vibrate?.(15);
      } catch {}
    }
  };

  const handlePointerUp = (_e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const holdTime = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (_e.pointerType === 'mouse') {
        // Desktop click: directly start hands-free locked recording
        setRecordMode('locked');
        setLockHint(null);
        if (mobileMediaType === 'audio') {
          setIsRecordingVideo(false);
          setIsRecordingAudio(true);
        } else {
          setIsRecordingAudio(false);
          setIsRecordingVideo(true);
        }
        return;
      }
      // Mobile tap: toggle audio <-> video mode
      setMobileMediaType((prev) => (prev === 'audio' ? 'video' : 'audio'));
      try {
        navigator.vibrate?.(10);
      } catch {}
      return;
    }

    if (recordMode === 'holding') {
      if (holdTime < 350) {
        // Short tap while in holding mode -> lock in hands-free mode for comfortable recording
        setRecordMode('locked');
        setLockHint(null);
      } else {
        // Held and released -> auto-finish and send
        setRecordMode('idle');
        setLockHint(null);
        if (triggerFinishRef.current) {
          triggerFinishRef.current(true);
        }
      }
    }
  };

  const handlePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recordMode === 'holding') {
      setIsRecordingAudio(false);
      setIsRecordingVideo(false);
      setRecordMode('idle');
      setLockHint(null);
    }
    pointerStartRef.current = null;
  };

  const cancelRecording = () => {
    setIsRecordingAudio(false);
    setIsRecordingVideo(false);
    setRecordMode('idle');
    setLockHint(null);
  };

  return {
    isRecordingAudio,
    setIsRecordingAudio,
    isRecordingVideo,
    setIsRecordingVideo,
    recordMode,
    setRecordMode,
    lockHint,
    setLockHint,
    mobileMediaType,
    setMobileMediaType,
    triggerFinishRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    cancelRecording,
  };
}
