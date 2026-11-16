// Pictures on a card: one hero or a deck of thumbs, each with OCR text to unfold.
import React, { memo, useMemo, useState } from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { SlagAttachment } from '../../../types';
import {
  THUMB_MAX_HEIGHT,
  THUMB_MAX_WIDTH,
  attachmentSrc,
  buildImageDeck,
} from './itemAttachments';

export interface ItemImagesProps {
  /** Every picture of the note, in its own order: one is a hero, two and up are a canvas. */
  images: SlagAttachment[];
  srcs: AttachmentSrcs;
  /** Ids whose bytes are gone for good: only those may say "нет файла". */
  missing: ReadonlySet<string>;
  /** A card with no prose hugs its picture; the open OCR panel claims the column back. */
  isPictureBubble: boolean;
  /** Which pictures have their recognised text unfolded right now. */
  expandedOcrIds: ReadonlySet<string>;
  onToggleOcr: (attachmentId: string) => void;
  onImageClick: (image: SlagAttachment) => void;
  onEnrich: (attachment: SlagAttachment) => void;
}

/** A media slot with no bytes behind it. Says so once, instead of a broken-image icon. */
const MissingMedia: React.FC<{ name: string }> = ({ name }) => (
  <span
    data-testid="media-missing"
    title={`Файл не найден: ${name}`}
    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-tint-4 text-fg-dim"
  >
    <Icon name="entity.imageMissing" size="md" tone="inherit" />
    <span className="font-mono text-3xs">нет файла</span>
  </span>
);

/** A media slot whose bytes are still being resolved: a quiet slab instead of a verdict. */
const LoadingMedia: React.FC = () => (
  <span
    data-testid="media-skeleton"
    aria-hidden
    className="absolute inset-0 bg-tint-4 motion-safe:animate-pulse"
  />
);

/** Pictures of a note: a lone frame keeps its own shape, a pile fills one canvas. */
const ItemImagesComponent: React.FC<ItemImagesProps> = ({
  images,
  srcs,
  missing,
  isPictureBubble,
  expandedOcrIds,
  onToggleOcr,
  onImageClick,
  onEnrich,
}) => {
  // A picture sizes itself from its own proportions: height has a ceiling, width follows the
  // ratio. Without the loaded ratio the browser inflates the box to the unclamped width.
  // ponytail: the ratio is only known after `onLoad`, so the hero box settles on load. Storing
  // the intrinsics at attach time (width/height in the attachment) would remove the jump.
  const [firstImageRatio, setFirstImageRatio] = useState<number | null>(null);
  // Decoded frames fade in: until `onLoad` the picture is transparent over its skeleton.
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(() => new Set());
  const deck = useMemo(() => buildImageDeck(images), [images]);
  const hero = deck.hero;
  const album = deck.album;

  if (!hero && !album) return null;

  const heroSrc = attachmentSrc(srcs, hero);
  const markLoaded = (id: string) => {
    setLoadedIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  return (
    <div className={`pt-1 flex flex-col gap-1.5 ${isPictureBubble ? 'w-fit max-w-full' : 'w-full items-start'}`}>
      {hero ? (
        <>
          <div
            className="relative min-w-[9rem] min-h-[4.5rem] rounded-lg overflow-hidden group/img flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
            style={
              firstImageRatio
                ? {
                    width: Math.min(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT * firstImageRatio),
                    aspectRatio: String(firstImageRatio),
                    maxWidth: '100%',
                  }
                : undefined
            }
            onClick={heroSrc ? () => onImageClick(hero) : undefined}
          >
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={hero.name}
                loading="lazy"
                decoding="async"
                data-loaded={loadedIds.has(hero.id) ? 'true' : 'false'}
                className={`${
                  firstImageRatio
                    ? 'block h-full w-full object-contain'
                    : 'block h-auto w-auto max-h-[20rem] max-w-full object-contain'
                } transition-opacity duration-200 motion-reduce:transition-none ${
                  loadedIds.has(hero.id) ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={(event) => {
                  const picture = event.currentTarget;
                  if (picture.naturalWidth && picture.naturalHeight) {
                    setFirstImageRatio(picture.naturalWidth / picture.naturalHeight);
                  }
                  markLoaded(hero.id);
                }}
              />
            ) : missing.has(hero.id) ? (
              <MissingMedia name={hero.name} />
            ) : (
              <LoadingMedia />
            )}
            {heroSrc && !loadedIds.has(hero.id) && <LoadingMedia />}

            {/* Text action badge anchored in the bottom-right corner of the image */}
            {hero.extractedText ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleOcr(hero.id);
                }}
                className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-scrim-80 hover:bg-scrim-90 border border-tint-15 text-fg-tertiary hover:text-white flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md motion-press z-10"
                title={expandedOcrIds.has(hero.id) ? 'Скрыть текст' : 'Показать текст с фото'}
              >
                <Icon name="entity.article" size="sm" tone="tertiary" />
                <span>Текст</span>
                <Icon name="nav.down" size="sm" className={`transition-transform ${expandedOcrIds.has(hero.id) ? 'rotate-180' : ''}`} />
              </button>
            ) : hero.enrichmentStatus === 'processing' ? (
              <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-scrim-80 border border-tint-15 text-fg-tertiary text-2xs font-mono flex items-center gap-1.5 shadow-md z-10 animate-pulse">
                <Icon name="status.loading" size="sm" className="animate-spin" />
                <span>Анализ...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEnrich(hero);
                }}
                className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-scrim-80 hover:bg-scrim-90 border border-tint-15 text-fg-tertiary hover:text-white flex items-center gap-1.5 cursor-pointer select-none text-2xs font-mono shadow-md motion-press z-10"
                title="Распознать текст на изображении"
              >
                <Icon name="system.ai" size="sm" />
                <span>{hero.enrichmentStatus === 'error' ? 'Повторить' : 'Текст'}</span>
              </button>
            )}
          </div>

          {/* Extracted text accordion directly under the hero picture */}
          {hero.extractedText && (
            <div
              className="motion-accordion w-full"
              data-expanded={expandedOcrIds.has(hero.id)}
              aria-hidden={!expandedOcrIds.has(hero.id)}
            >
              <div className="motion-accordion-inner w-full mt-1.5 pt-1.5 border-t border-tint-8 text-xs font-mono text-fg-tertiary leading-relaxed select-text whitespace-pre-wrap">
                {hero.extractedText}
              </div>
            </div>
          )}
        </>
      ) : album ? (
        <div className="flex w-[20rem] max-w-full flex-col gap-0.5 overflow-hidden rounded-lg" data-testid="media-album">
          {album.rows.map((perRow, rowIndex) => (
            <div key={rowIndex} className="flex gap-0.5">
              {album.tiles.slice(album.rowStarts[rowIndex], album.rowStarts[rowIndex] + perRow).map((tile) => {
                const tileSrc = attachmentSrc(srcs, tile.image);
                return (
                  <button
                    key={tile.hidden > 0 ? 'more' : tile.image.id}
                    type="button"
                    onClick={tile.hidden > 0 || tileSrc ? () => onImageClick(tile.image) : undefined}
                    title={tile.hidden > 0 ? `Ещё ${tile.hidden}` : tile.image.name}
                    className={`relative min-w-0 flex-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90 ${
                      perRow === 1 ? 'aspect-[3/2]' : 'aspect-square'
                    } ${tile.hidden > 0 ? 'bg-tint-6' : ''}`}
                  >
                    {tile.hidden === 0 && (
                      tileSrc ? (
                        <>
                          <img
                            src={tileSrc}
                            alt={tile.image.name}
                            loading="lazy"
                            decoding="async"
                            data-loaded={loadedIds.has(tile.image.id) ? 'true' : 'false'}
                            onLoad={() => markLoaded(tile.image.id)}
                            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${
                              loadedIds.has(tile.image.id) ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                          {!loadedIds.has(tile.image.id) && <LoadingMedia />}
                        </>
                      ) : missing.has(tile.image.id) ? (
                        <MissingMedia name={tile.image.name} />
                      ) : (
                        <LoadingMedia />
                      )
                    )}
                    {tile.hidden > 0 ? (
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-mono text-fg-soft">
                        +{tile.hidden}
                      </span>
                    ) : (
                      tile.image.extractedText && (
                        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent-strong" />
                      )
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const ItemImages = memo(ItemImagesComponent);
