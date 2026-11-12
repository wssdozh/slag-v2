import React, { memo } from 'react';
import { AudioPlayer } from '../../UI/AudioPlayer';
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { SlagAttachment } from '../../../types';
import { attachmentSrc } from './itemAttachments';

export interface ItemAudioNotesProps {
  attachments: SlagAttachment[];
  srcs: AttachmentSrcs;
  /** A card that is nothing but its voice note hugs the player and borrows the timestamp. */
  isVoiceBubble: boolean;
  /** Time of the note itself; the bubble has no footer left to keep it in. */
  formattedTime: string;
  onEnrich: (attachment: SlagAttachment) => void;
}

/** Audio notes of one card, a player each: waveform, transcript and the way to recognise it. */
const ItemAudioNotesComponent: React.FC<ItemAudioNotesProps> = ({
  attachments,
  srcs,
  isVoiceBubble,
  formattedTime,
  onEnrich,
}) => (
  <>
    {attachments.map((att) => (
      <div key={att.id} className={isVoiceBubble ? 'w-full' : 'w-full pt-1'}>
        <AudioPlayer
          src={attachmentSrc(srcs, att) ?? ''}
          name={att.name}
          duration={att.duration}
          waveform={att.waveform}
          timeContext={isVoiceBubble ? formattedTime : undefined}
          transcript={att.extractedText}
          summary={att.summary}
          enrichmentStatus={att.enrichmentStatus}
          onEnrich={() => onEnrich(att)}
        />
      </div>
    ))}
  </>
);

export const ItemAudioNotes = memo(ItemAudioNotesComponent);
