import { useState } from 'react';
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { SlagAttachment } from '../../../types';
import { Icon } from '../../UI/icons/Icon';
import { AudioPlayer } from '../../UI/AudioPlayer';
import { attachmentSrc } from './itemAttachments';

interface Props {
  attachments: SlagAttachment[];
  srcs: AttachmentSrcs;
  missing: ReadonlySet<string>;
  onOpen: (attachment: SlagAttachment) => void;
  onEnrich: (attachment: SlagAttachment) => void;
}

const tile = 'flex aspect-square w-20 max-w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-tint-4 text-fg-secondary hover:bg-tint-8 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg-secondary';

export function ItemAttachmentGrid({ attachments, srcs, missing, onOpen, onEnrich }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = attachments.find(({ id }) => id === expandedId);
  const toggle = (id: string) => setExpandedId(current => current === id ? null : id);
  if (!attachments.length) return null;

  return (
    <>
      <div className="flex max-w-full flex-wrap gap-1.5 pt-1" data-testid="item-attachment-grid">
        {attachments.map(att => {
          const src = attachmentSrc(srcs, att);
          const isAudio = att.type === 'audio';
          const isImage = att.type === 'image';
          const isVideo = att.type === 'video';
          const unavailable = !src && missing.has(att.id);
          const caption = <span className="w-full truncate px-1 text-center text-2xs">{att.name}</span>;
          return (
            <div key={att.id} className="relative max-w-full">
              {att.type === 'file' && src ? (
                <a href={src} download={att.name} title={att.name} className={tile}>
                  <Icon name="entity.article" size="lg" />{caption}
                </a>
              ) : (
                <button type="button" title={att.name} aria-label={att.name} disabled={!src}
                  aria-expanded={isAudio ? expandedId === att.id : undefined}
                  className={`relative ${tile} ${src ? 'cursor-pointer' : ''}`}
                  onClick={() => isAudio ? toggle(att.id) : onOpen(att)}
                >
                  {isImage && src ? <img src={src} alt={att.name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> :
                    isVideo && src ? <>
                      <video src={src} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                      <span className="relative rounded-full bg-scrim-80 p-1.5 text-fg-primary"><Icon name="media.play" size="md" /></span>
                    </> : unavailable ? <span data-testid="media-missing" className="text-2xs">нет файла</span> : !src ?
                      <span data-testid="media-skeleton" className="absolute inset-0 bg-tint-4 motion-safe:animate-pulse" /> : <>
                        <Icon name="media.play" size="lg" />{caption}
                      </>}
                </button>
              )}
              {isImage && src && (
                <button type="button" title="Текст с изображения" aria-label={`Текст: ${att.name}`}
                  aria-expanded={att.extractedText ? expandedId === att.id : undefined}
                  disabled={att.enrichmentStatus === 'processing'}
                  className="absolute right-1 bottom-1 rounded-md bg-scrim-80 p-1 text-fg-primary hover:bg-scrim-90 focus-visible:ring-1 focus-visible:ring-fg-primary"
                  onClick={() => att.extractedText ? toggle(att.id) : onEnrich(att)}
                >
                  <Icon name={att.enrichmentStatus === 'processing' ? 'status.loading' : 'entity.article'} size="sm" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {expanded?.type === 'audio' && <AudioPlayer src={attachmentSrc(srcs, expanded) ?? ''} name={expanded.name}
        duration={expanded.duration} waveform={expanded.waveform} transcript={expanded.extractedText}
        summary={expanded.summary} enrichmentStatus={expanded.enrichmentStatus} onEnrich={() => onEnrich(expanded)} />}
      {expanded?.type === 'image' && (
        <div className="max-w-xs border-x border-tint-12 px-2">
          <button type="button" onClick={() => toggle(expanded.id)} aria-expanded="true"
            aria-label="Скрыть распознанный текст"
            className="flex w-full cursor-pointer items-center justify-between gap-2 py-1 text-left text-2xs font-medium text-fg-secondary hover:text-fg-primary focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg-secondary"
          >
            Распознанный текст
            <Icon name="nav.down" size="sm" className="rotate-180" />
          </button>
          <div className="whitespace-pre-wrap break-words pb-1 text-xs text-fg-tertiary select-text">{expanded.extractedText}</div>
        </div>
      )}
    </>
  );
}
