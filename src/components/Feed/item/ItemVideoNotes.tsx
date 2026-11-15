// Video circle notes on a card: plays in place, the corner opens the full viewer.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
import { VideoCirclePlayer } from '../../UI/VideoCirclePlayer';
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { SlagAttachment } from '../../../types';
import { attachmentSrc } from './itemAttachments';

export interface ItemVideoNotesProps {
  attachments: SlagAttachment[];
  srcs: AttachmentSrcs;
  /** Opens the clip in the deck of the whole note. */
  onOpen: (attachment: SlagAttachment) => void;
}

/** Video circle notes, Telegram style: the clip plays in place, the corner is the way out of it. */
const ItemVideoNotesComponent: React.FC<ItemVideoNotesProps> = ({
  attachments,
  srcs,
  onOpen,
}) => (
  <>
    {attachments.map((att) => (
      <div key={att.id} className="flex items-center gap-1 pt-1">
        <VideoCirclePlayer src={attachmentSrc(srcs, att) ?? ''} />
        {/* The circle plays in place; this is the way out of the card and into the viewer. */}
        <button
          type="button"
          onClick={() => onOpen(att)}
          aria-label="Открыть видео"
          title="Открыть видео"
          className="cursor-pointer rounded-md p-1.5 text-fg-dim transition-colors hover:bg-surface-hover hover:text-fg-primary"
        >
          <Icon name="action.expand" size="sm" tone="inherit" />
        </button>
      </div>
    ))}
  </>
);

export const ItemVideoNotes = memo(ItemVideoNotesComponent);
