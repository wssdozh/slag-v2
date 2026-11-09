import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motionEase, motionMs } from '../../lib/motion';

/** How far the pager coasts after a release: the velocity the finger had, in ms. */
const PROJECT_MS = 180;
/** A drag past a quarter of the width, or a flick, turns the page. */
const SWIPE_COMMIT = 0.25;
const FLICK_PX_MS = 0.35;
/** Downward travel that closes the viewer instead of snapping back. */
const DISMISS_PX = 120;
const MAX_ZOOM = 4;
/** A press must not turn into a one-pixel swipe: below this it is still a tap. */
const SLOP_PX = 6;

type DragMode = 'idle' | 'x' | 'y' | 'pinch' | 'pan';

interface Drag {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  dx: number;
  dy: number;
  mode: DragMode;
  pointers: Map<number, { x: number; y: number }>;
  startZoom: number;
  startDistance: number;
  startPanX: number;
  startPanY: number;
  moved: boolean;
}

export interface PhotoPagerOptions {
  /** Slides in the deck; a swipe clamps at both ends. */
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** Swiped down far enough, or flicked: the viewer leaves. */
  onDismiss: () => void;
  /**
   * Hide the chrome after this many ms without a touch. Default 0: it stays, which is
   * what a mouse expects and what the desktop tests assert.
   */
  hideChromeAfter?: number;
}

/**
 * One finger deck for a full-screen viewer: pager, pinch, pan and swipe-to-close.
 *
 * The DOM is moved by hand — a swipe writes `transform` straight to the node, so nothing
 * waits for a re-render mid-gesture. Zoom and pan stay in state because the slide re-renders
 * when they change anyway (a transform that is only written to the node drifts on re-render).
 */
export function usePhotoPager({ count, index, onIndexChange, onDismiss, hideChromeAfter = 0 }: PhotoPagerOptions) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  /** The track node itself; a callback ref reports the moment it appears. */
  const trackNodeRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  /** The pager is placed by hand, so the layout effect must not snap over a running settle. */
  const placedRef = useRef(-1);
  /** A drag is followed by a click on the same node; a backdrop-close must not read it as a tap. */
  const swallowClickRef = useRef(false);
  /** Whether the chrome was up when this press started: a tap reveals, it does not dim again. */
  const chromeShownAtPressRef = useRef(false);

  // A new slide starts unzoomed; the reset belongs to render, not to an effect.
  const [zoomIndex, setZoomIndex] = useState(index);
  if (zoomIndex !== index) {
    setZoomIndex(index);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  /** Write the pager offset straight to the node: a swipe must not wait for a re-render. */
  const placeTrack = useCallback((next: number, offset = 0, animate = false) => {
    const track = trackNodeRef.current;
    if (!track) return;
    track.style.transition = animate
      ? `transform ${motionMs('base')}ms ${motionEase('settle')}`
      : 'none';
    track.style.transform = `translate3d(calc(${-next * 100}% + ${offset}px), 0, 0)`;
  }, []);

  // The viewer unmounts its tree when it closes, so the track is a new node every time it opens.
  // A fresh node carries no transform and would show the first slide; it is placed on attach, and
  // the effect below then jumps it to the requested slide without animating in from nowhere.
  const latestIndexRef = useRef(index);
  useLayoutEffect(() => {
    latestIndexRef.current = index;
  }, [index]);

  const trackRef = useCallback((node: HTMLDivElement | null) => {
    trackNodeRef.current = node;
    if (!node) return;
    placeTrack(latestIndexRef.current);
    placedRef.current = -1;
  }, [placeTrack]);

  useLayoutEffect(() => {
    if (placedRef.current === index) return;
    // Coming from a drag the track is already there; a jump from a key or a button still slides.
    const isFirstPlacement = placedRef.current < 0;
    placedRef.current = index;
    placeTrack(index, 0, !isFirstPlacement);
  }, [index, placeTrack]);

  const showChrome = useCallback(() => setIsChromeVisible(true), []);

  useEffect(() => {
    if (hideChromeAfter <= 0 || !isChromeVisible) return;
    const timer = setTimeout(() => setIsChromeVisible(false), hideChromeAfter);
    return () => clearTimeout(timer);
  }, [hideChromeAfter, isChromeVisible, index]);

  const distanceOf = (pointers: Map<number, { x: number; y: number }>) => {
    const [first, second] = [...pointers.values()];
    return Math.hypot(first.x - second.x, first.y - second.y) || 1;
  };

  const commitZoom = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, next));
    const settled = clamped < 1.15 ? 1 : clamped;
    setZoom(settled);
    if (settled === 1) setPan({ x: 0, y: 0 });
  }, []);

  /** A zoomed slide pans only as far as its overflow, or it would be dragged off the screen. */
  const clampPan = useCallback((x: number, y: number, level: number) => {
    const limitX = ((rootRef.current?.clientWidth ?? 360) * (level - 1)) / 2;
    const limitY = ((rootRef.current?.clientHeight ?? 640) * (level - 1)) / 2;
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y)),
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Controls own their own drags: a slider under the finger is not a swipe.
    if ((event.target as HTMLElement).closest('button, input, a, textarea, audio')) return;
    chromeShownAtPressRef.current = isChromeVisible;
    showChrome();
    swallowClickRef.current = false;
    const drag = dragRef.current;
    if (!drag) {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocity: 0,
        dx: 0,
        dy: 0,
        mode: 'idle',
        pointers: new Map(),
        startZoom: zoom,
        startDistance: 1,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
    }
    const current = dragRef.current!;
    current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (current.pointers.size === 2) {
      current.mode = 'pinch';
      current.startDistance = distanceOf(current.pointers);
      current.startZoom = zoom;
    }
  }, [isChromeVisible, pan.x, pan.y, showChrome, zoom]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.pointers.has(event.pointerId)) return;
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (drag.mode === 'pinch') {
      if (drag.pointers.size < 2) return;
      const next = drag.startZoom * (distanceOf(drag.pointers) / drag.startDistance);
      const clamped = Math.max(1, Math.min(MAX_ZOOM, next));
      if (imageRef.current) imageRef.current.style.transform = `scale(${clamped})`;
      return;
    }

    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientX - drag.lastX) / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;

    if (zoom > 1) {
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) < SLOP_PX) return;
      drag.moved = true;
      drag.mode = 'pan';
      const nextPan = clampPan(drag.startPanX + drag.dx, drag.startPanY + drag.dy, zoom);
      if (imageRef.current) {
        imageRef.current.style.transform = `scale(${zoom}) translate(${nextPan.x / zoom}px, ${nextPan.y / zoom}px)`;
      }
      return;
    }

    if (drag.mode === 'idle') {
      if (Math.hypot(drag.dx, drag.dy) < SLOP_PX) return;
      drag.moved = true;
      drag.mode = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
    }

    if (drag.mode === 'x') {
      const atEdge = (drag.dx > 0 && index === 0) || (drag.dx < 0 && index === count - 1);
      placeTrack(index, atEdge ? drag.dx * 0.3 : drag.dx);
      return;
    }

    if (drag.dy > 0 && stageRef.current) {
      stageRef.current.style.transition = 'none';
      stageRef.current.style.transform = `translate3d(0, ${drag.dy}px, 0) scale(${Math.max(0.8, 1 - drag.dy / 1600)})`;
    }
  }, [clampPan, count, index, placeTrack, zoom]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.moved) swallowClickRef.current = true;
    drag.pointers.delete(event.pointerId);

    if (drag.mode === 'pinch') {
      if (drag.pointers.size === 0) {
        const applied = imageRef.current?.style.transform.match(/scale\(([\d.]+)\)/);
        commitZoom(applied ? Number(applied[1]) : zoom);
        dragRef.current = null;
      }
      return;
    }

    if (drag.mode === 'pan') {
      setPan(clampPan(drag.startPanX + drag.dx, drag.startPanY + drag.dy, zoom));
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'x') {
      const width = rootRef.current?.clientWidth ?? 360;
      const projected = drag.dx + drag.velocity * PROJECT_MS;
      const commit = Math.abs(projected) > width * SWIPE_COMMIT || Math.abs(drag.velocity) > FLICK_PX_MS;
      const next = commit
        ? Math.max(0, Math.min(count - 1, index + (projected < 0 ? 1 : -1)))
        : index;
      placedRef.current = next;
      placeTrack(next, 0, true);
      if (next !== index) onIndexChange(next);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'y') {
      const stage = stageRef.current;
      if (stage) {
        stage.style.transition = `transform ${motionMs('base')}ms ${motionEase('settle')}`;
        stage.style.transform = '';
      }
      if (drag.dy > DISMISS_PX || drag.velocity > FLICK_PX_MS) {
        onDismiss();
      }
      dragRef.current = null;
      return;
    }

    // A press without movement is a tap. Pressing already revealed the chrome, so a tap only
    // ever puts it away — a hidden viewer must not dim itself on the very tap that woke it.
    if (!drag.moved && chromeShownAtPressRef.current) setIsChromeVisible(false);
    dragRef.current = null;
  }, [clampPan, commitZoom, count, index, onDismiss, onIndexChange, placeTrack, zoom]);

  const onPointerCancel = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === 'x') placeTrack(index, 0, true);
    if (drag.mode === 'y' && stageRef.current) {
      stageRef.current.style.transition = `transform ${motionMs('base')}ms ${motionEase('settle')}`;
      stageRef.current.style.transform = '';
    }
  }, [index, placeTrack]);

  /**
   * A click that follows a drag is the tail of the gesture, not a tap on the backdrop. Shells
   * that close themselves on a click put this in capture, the way the viewer root does.
   */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  return {
    rootRef,
    stageRef,
    trackRef,
    imageRef,
    zoom,
    pan,
    commitZoom,
    isChromeVisible,
    showChrome,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
  };
}
