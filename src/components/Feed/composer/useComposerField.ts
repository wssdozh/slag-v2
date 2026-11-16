// React wrapper for the field handle: the ref is read lazily inside a callback, never during
// render, and the handle itself stays stable for the whole composer lifetime.
import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { textareaFieldHandle, type ComposerFieldHandle } from './field';

export function useComposerField(ref: RefObject<HTMLTextAreaElement | null>): ComposerFieldHandle {
  const getElement = useCallback(() => ref.current, [ref]);
  // oxlint-disable-next-line react-hooks/refs -- the getter is only called from event handlers
  return useMemo(() => textareaFieldHandle(getElement), [getElement]);
}
