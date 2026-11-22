import { useEffect, useRef, useState } from 'react';
import type { AttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import type { LightboxImage, SlagAttachment } from '../../types';
import { AttachmentTile } from '../Feed/item/ItemAttachmentGrid';
import { attachmentSrc } from '../Feed/item/itemAttachments';
import { AudioPlayer } from '../UI/AudioPlayer';
import { MenuDropdown } from '../UI/MenuDropdown';
import { Icon } from '../UI/icons/Icon';

interface Props {
  itemId: string;
  attachments: SlagAttachment[];
  srcs: AttachmentSrcs;
  missing: ReadonlySet<string>;
  menuId: string | null;
  onMenuChange: (id: string | null) => void;
  onInsertMarkdown: (target: string) => void;
  onMoveAttachment: (index: number, direction: 'up' | 'down') => void;
  onRemoveAttachment: (id: string) => void;
  onOpenLightbox: (images: LightboxImage[], index: number) => void;
}

const menuItem = 'w-full rounded-md px-2.5 py-2 text-left text-xs hover:bg-tint-8 focus-visible:bg-tint-8 disabled:opacity-40 disabled:hover:bg-transparent';

export function AttachmentStrip({ itemId, attachments, srcs, missing, menuId, onMenuChange,
  onInsertMarkdown, onMoveAttachment, onRemoveAttachment, onOpenLightbox }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [audioId, setAudioId] = useState<string | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // Measure the actual tile and gap so docking, phone widths and zoom use the same row.
    const observer = new ResizeObserver(([entry]) => {
      const tile = strip.firstElementChild as HTMLElement | null;
      if (!tile) return;
      const gap = parseFloat(getComputedStyle(strip).columnGap);
      setSlots(Math.max(1, Math.floor((entry.contentRect.width + gap) / (tile.offsetWidth + gap))));
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  const visible = showAll || attachments.length <= slots ? attachments : attachments.slice(0, slots - 1);
  const hidden = attachments.length - visible.length;
  const audio = visible.find(att => att.id === audioId);
  const open = (att: SlagAttachment) => {
    if (att.type === 'audio') {
      setAudioId(audioId === att.id ? null : att.id);
      return;
    }
    const images = attachments.flatMap((file): LightboxImage[] => {
      const url = attachmentSrc(srcs, file);
      if (!url || (file.type !== 'image' && file.type !== 'video')) return [];
      return [{ ...file, itemId, url, kind: file.type }];
    });
    const index = images.findIndex(file => file.id === att.id);
    if (index >= 0) onOpenLightbox(images, index);
  };

  return (
    <>
      <div ref={stripRef} data-testid="attachment-strip" role="group" aria-label="Вложения"
        className={`flex min-w-0 gap-1.5 ${showAll ? 'flex-wrap' : ''}`}>
        {visible.map((att, index) => (
          <div key={att.id} className="relative w-14 shrink-0">
            <AttachmentTile att={att} src={attachmentSrc(srcs, att)} unavailable={missing.has(att.id)}
              audioExpanded={audioId === att.id} compact onOpen={() => open(att)} />
            <MenuDropdown className="absolute! bottom-0.5 right-0.5" dropdownClassName="w-40" align="start"
              isOpen={menuId === att.id} onOpenChange={next => onMenuChange(next ? att.id : null)}
              trigger={<button type="button" aria-label={`Действия: ${att.name}`} aria-expanded={menuId === att.id}
                className="grid size-6 cursor-pointer place-items-center rounded-md bg-scrim-80 text-fg-primary hover:bg-scrim-95 focus-visible:ring-1 focus-visible:ring-fg-primary">
                <Icon name="action.moreHorizontal" size="sm" />
              </button>}>
              <button type="button" className={menuItem} onClick={() => {
                onMenuChange(null);
                onInsertMarkdown(attachments.some(file => file.id !== att.id && file.name.toLowerCase() === att.name.toLowerCase())
                  ? `${att.id}|${att.name}` : att.name);
              }}>Вставить в текст</button>
              <button type="button" className={menuItem} disabled={index === 0} onClick={() => {
                onMenuChange(null);
                onMoveAttachment(index, 'up');
              }}>Сдвинуть влево</button>
              <button type="button" className={menuItem} disabled={index === attachments.length - 1} onClick={() => {
                onMenuChange(null);
                onMoveAttachment(index, 'down');
              }}>Сдвинуть вправо</button>
              <button type="button" className={`${menuItem} text-rose-400`} onClick={() => {
                onMenuChange(null);
                onRemoveAttachment(att.id);
              }}>Удалить</button>
            </MenuDropdown>
          </div>
        ))}
        {attachments.length > slots && (
          <button type="button" aria-expanded={showAll} aria-label={showAll ? 'Свернуть вложения' : `Показать ещё ${hidden}`}
            className="grid size-14 shrink-0 cursor-pointer place-items-center rounded-md bg-tint-4 text-xs text-fg-secondary hover:bg-tint-8 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg-secondary"
            onClick={() => setShowAll(!showAll)}>
            {showAll ? <Icon name="nav.down" size="sm" className="rotate-180" /> : `+${hidden}`}
          </button>
        )}
      </div>
      {audio?.type === 'audio' && <AudioPlayer key={audio.id} src={attachmentSrc(srcs, audio)} name={audio.name}
        duration={audio.duration} waveform={audio.waveform} transcript={audio.extractedText} />}
    </>
  );
}
