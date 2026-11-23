// The feed's media viewer: swipeable photos and clips, keyboard nav, OCR side panel.
import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from './icons/Icon';
import type { LightboxImage } from '../../types';
import { useApp } from '../../context/AppContext';
import { usePresence } from '../../hooks/ui/usePresence';
import { usePhotoPager } from '../../hooks/gestures/usePhotoPager';
import { useItemActions } from '../../hooks/useItemActions';
import { useAttachmentSrcOnDemand, type AttachmentSource } from '../../hooks/media/useAttachmentSrcOnDemand';
import { ViewerVideo } from '../Media/ViewerVideo';
import { LightboxTextPanel } from './LightboxTextPanel';

export type { LightboxImage };

/** Idle before the chrome leaves on a phone, the way every media viewer behaves there. */
const CHROME_IDLE_MS = 2500;

/** A slide's bytes live where its note says; a deck built by hand may carry them inline only. */
function sourceOf(image: LightboxImage): AttachmentSource | undefined {
  if (!image.id) return undefined;
  const attachment = image.sourceItem?.attachments?.find((candidate) => candidate.id === image.id);
  if (!attachment) return image.url ? { id: image.id, dataUrl: image.url } : undefined;
  return { id: attachment.id, relativePath: attachment.relativePath, mimeType: attachment.mimeType, dataUrl: image.url || undefined };
}

/**
 * One mounted slide. The deck is built before the bytes may be here, so the slide asks for its
 * own file — and only the neighbours the pager keeps mounted are built at all.
 */
const LightboxSlide: React.FC<{
  image: LightboxImage;
  isActive: boolean;
  chromeVisible: boolean;
  onDoubleClick: (event: React.MouseEvent) => void;
}> = ({ image, isActive, chromeVisible, onDoubleClick }) => {
  const src = useAttachmentSrcOnDemand(sourceOf(image), true);

  if (image.kind === 'video') {
    if (!isActive || !src) return <div className="h-full w-full bg-black" />;
    return <ViewerVideo src={src} isActive chromeVisible={chromeVisible} />;
  }
  // No `src=""`: an empty source asks the page for itself and paints a broken frame. Bytes that
  // are still on their way are a black frame, the same way a clip that is not playing is.
  if (!src) return <div className="h-full w-full bg-black" aria-hidden />;
  return (
    <img
      src={src}
      alt={image.name}
      draggable={false}
      onDoubleClick={onDoubleClick}
      className="max-h-full max-w-full select-none object-contain"
    />
  );
};

export interface ImageLightboxProps {
  images: LightboxImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onRetryEnrich?: (image: LightboxImage) => void;
}

/**
 * The feed's viewer. One deck of slides — photos and clips together — with the same finger deck
 * the picker uses, and a chrome that leaves on its own: on a phone the picture is the interface.
 * The keyboard, the wheel and the OCR panel stay, because they are what a desktop is for.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  onRetryEnrich,
}) => {
  const { isMobile } = useApp();
  const { ref: containerRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  const [payloadSnapshot, setPayloadSnapshot] = useState({ images, currentIndex });
  if (isOpen && (payloadSnapshot.images !== images || payloadSnapshot.currentIndex !== currentIndex)) {
    setPayloadSnapshot({ images, currentIndex });
  }
  const activePayload = isOpen ? { images, currentIndex } : payloadSnapshot;
  const activeImages = activePayload.images;
  const activeIndex = activePayload.currentIndex;

  const [isTextPanelOpen, setIsTextPanelOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const currentImage = activeImages[activeIndex];
  const isVideo = currentImage?.kind === 'video';

  const { rootRef, stageRef, trackRef, imageRef, zoom, pan, commitZoom, isChromeVisible, handlers } = usePhotoPager({
    count: activeImages.length,
    index: activeIndex,
    onIndexChange: onNavigate,
    onDismiss: onClose,
    hideChromeAfter: isMobile ? CHROME_IDLE_MS : 0,
  });

  // The viewer is not the note: reply and "open" both hand the screen back to what is behind it.
  const actions = useItemActions(currentImage?.sourceItem, () => setIsMenuOpen(false));

  const handlePrev = useCallback(() => {
    if (activeImages.length > 1) onNavigate((activeIndex - 1 + activeImages.length) % activeImages.length);
  }, [activeImages.length, activeIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (activeImages.length > 1) onNavigate((activeIndex + 1) % activeImages.length);
  }, [activeImages.length, activeIndex, onNavigate]);

  // Escape closes the viewer, not the sheet underneath it. T and the arrows are desktop comfort.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (isMenuOpen) setIsMenuOpen(false);
        else if (isTextPanelOpen) setIsTextPanelOpen(false);
        else onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePrev();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNext();
        return;
      }
      if (event.key === 't' || event.key === 'T' || event.key === 'е' || event.key === 'Е') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        event.preventDefault();
        setIsTextPanelOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev, isMenuOpen, isOpen, isTextPanelOpen, onClose]);

  // A wheel is a mouse gesture: it exists here and nowhere on a phone.
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      commitZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [commitZoom, containerRef, isOpen, zoom]);

  if (!isPresent || activeImages.length === 0) return null;
  if (!currentImage) return null;

  // While the OCR panel is open on a phone it owns the screen; the bars would sit on its header.
  const chrome = isChromeVisible && !(isMobile && isTextPanelOpen)
    ? 'opacity-100'
    : 'pointer-events-none opacity-0';
  const hasNeighbours = activeImages.length > 1;

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        rootRef.current = node;
      }}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      aria-hidden={!isOpen || undefined}
      onClick={isMobile ? undefined : onClose}
      data-testid="image-lightbox"
      className={`fixed inset-0 z-[130] select-none outline-none motion-fade ${isMobile ? 'bg-black' : 'bg-scrim-95'}`}
      style={{ touchAction: 'none' }}
      {...handlers}
    >
      <div
        data-testid="viewer-chrome-top"
        // The root closes the viewer on any click on desktop, so the chrome has to stop it:
        // without this every button up here opened its own panel and closed the viewer at once.
        onClick={(event) => event.stopPropagation()}
        className={`absolute inset-x-0 top-0 z-30 flex items-center gap-1 bg-gradient-to-b from-scrim-80 to-transparent px-2 pb-8 pt-[max(var(--sat),0.5rem)] transition-opacity duration-150 ${chrome}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-tertiary transition-colors hover:bg-tint-10 hover:text-white"
        >
          {isMobile ? <Icon name="nav.back" size="lg" tone="inherit" /> : <Icon name="action.close" size="md" tone="inherit" />}
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-ui font-medium leading-tight text-fg-primary">{currentImage.name}</p>
          <p className="font-mono text-3xs leading-tight text-fg-muted">
            {activeIndex + 1} из {activeImages.length}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isVideo && (
            <button
              type="button"
              onClick={() => setIsTextPanelOpen((open) => !open)}
              title={isTextPanelOpen ? 'Скрыть текст (T)' : 'Распознанный текст и описание (T)'}
              aria-label="Распознанный текст"
              className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors motion-press ${
                isTextPanelOpen ? 'bg-tint-15 text-white' : 'text-fg-secondary hover:bg-tint-6 hover:text-white'
              }`}
            >
              <Icon name="entity.article" size="md" tone="inherit" className="shrink-0" />
              <span className="hidden sm:inline">Текст</span>
            </button>
          )}

          <div className="hidden items-center gap-0.5 sm:flex">
            <button
              type="button"
              onClick={() => commitZoom(zoom + 0.25)}
              disabled={zoom >= 4}
              title="Увеличить"
              aria-label="Увеличить"
              className="cursor-pointer rounded-lg p-2 text-fg-secondary outline-none transition-colors hover:bg-tint-6 hover:text-white disabled:pointer-events-none disabled:opacity-25 motion-press"
            >
              <Icon name="media.zoomIn" size="md" tone="inherit" />
            </button>
            <span
              onClick={() => commitZoom(1)}
              title="Сбросить масштаб"
              className="w-10 cursor-pointer py-1 text-center font-mono text-2xs text-fg-secondary transition-colors hover:text-fg-soft"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => commitZoom(1)}
              title="Сбросить"
              aria-label="Сбросить"
              className="cursor-pointer rounded-lg p-2 text-fg-secondary outline-none transition-colors hover:bg-tint-6 hover:text-white motion-press"
            >
              <Icon name="action.retry" size="md" tone="inherit" />
            </button>
          </div>

          {isMobile && (
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label="Действия"
              aria-expanded={isMenuOpen}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full outline-none transition-colors motion-press ${
                isMenuOpen ? 'bg-tint-15 text-white' : 'text-fg-tertiary hover:bg-tint-10 hover:text-white'
              }`}
            >
              <Icon name="action.more" size="lg" tone="inherit" />
            </button>
          )}
        </div>
      </div>

      {isMenuOpen && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setIsMenuOpen(false)} />
          <div
            data-testid="viewer-menu"
            className="absolute right-2 z-40 flex w-56 flex-col gap-0.5 rounded-xl border border-tint-8 bg-surface-elevated/95 p-1 text-xs text-fg-tertiary shadow-2xl backdrop-blur-xl motion-popover"
            style={{ top: 'calc(var(--sat) + 58px)' }}
          >
            <button
              type="button"
              onClick={() => {
                actions.handleOpenFocus();
                onClose();
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover hover:text-white"
            >
              <Icon name="entity.article" size="md" tone="muted" className="shrink-0" />
              <span>Открыть заметку</span>
            </button>
            <button
              type="button"
              onClick={() => {
                actions.handleReply();
                onClose();
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover hover:text-white"
            >
              <Icon name="action.reply" size="md" tone="muted" className="shrink-0" />
              <span>Ответить</span>
            </button>
          </div>
        </>
      )}

      {/* The bars are gradients over the frame, so the slide keeps clear of them: nothing is cut
          by a title and nothing hides under the hint. */}
      <div
        className="flex h-full w-full items-stretch"
        style={{ paddingTop: 'calc(var(--sat) + 56px)', paddingBottom: isMobile ? 'calc(var(--sab) + 8px)' : '3rem' }}
      >
        <div ref={stageRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden will-change-transform">
          <div ref={trackRef} className="flex h-full w-full will-change-transform">
            {activeImages.map((image, slideIndex) => {
              const isActiveSlide = slideIndex === activeIndex;
              // The zoom target is the frame, not the picture: it is mounted whether or not the
              // bytes have arrived, so a deferred slide still pans and zooms once it paints.
              const isZoomTarget = isActiveSlide && image.kind !== 'video';
              return (
                <div
                  key={image.id ?? image.url}
                  className="relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden"
                  aria-hidden={slideIndex !== activeIndex}
                >
                  {Math.abs(slideIndex - activeIndex) <= 1 && (
                    <div
                      ref={isZoomTarget ? imageRef : undefined}
                      className="flex h-full w-full items-center justify-center transition-transform duration-150"
                      style={isZoomTarget
                        ? { transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }
                        : undefined}
                    >
                      <LightboxSlide
                        image={image}
                        isActive={isActiveSlide}
                        chromeVisible={isChromeVisible}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          commitZoom(zoom === 1 ? 2 : 1);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasNeighbours && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handlePrev();
              }}
              title="Предыдущее (←)"
              aria-label="Предыдущее изображение"
              className="absolute left-6 z-20 hidden cursor-pointer items-center justify-center rounded-full border border-tint-8 bg-scrim-40 p-2.5 text-fg-secondary shadow-xl backdrop-blur-md transition-colors hover:bg-tint-10 hover:text-white motion-press sm:flex"
            >
              <Icon name="nav.prev" size="lg" tone="inherit" />
            </button>
          )}
          {hasNeighbours && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleNext();
              }}
              title="Следующее (→)"
              aria-label="Следующее изображение"
              className="absolute right-6 z-20 hidden cursor-pointer items-center justify-center rounded-full border border-tint-8 bg-scrim-40 p-2.5 text-fg-secondary shadow-xl backdrop-blur-md transition-colors hover:bg-tint-10 hover:text-white motion-press sm:flex"
            >
              <Icon name="nav.next" size="lg" tone="inherit" />
            </button>
          )}
        </div>

        {/* The panel is the viewer's own state: closed means gone. Left mounted at zero width,
            it kept its text in the tree long after 'T' had closed it. */}
        {isTextPanelOpen && (
          <LightboxTextPanel
            image={currentImage}
            isOpen
            onClose={() => setIsTextPanelOpen(false)}
            onRetryEnrich={isVideo ? undefined : onRetryEnrich}
          />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 hidden h-12 items-center justify-center border-t border-tint-6 bg-scrim-40 backdrop-blur-md sm:flex">
        <span className="select-none text-xs font-medium tracking-wide text-fg-muted">
          ← / → для перелистывания • Колесико для зума • T для текста • Esc для закрытия
        </span>
      </div>
    </div>
  );
};

export default ImageLightbox;
