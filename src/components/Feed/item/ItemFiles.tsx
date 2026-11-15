// File attachments on a card: one download row each, with size and the summary.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
import { formatBytes } from '../../../lib/text/formatBytes';
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { SlagAttachment } from '../../../types';
import { attachmentSrc } from './itemAttachments';

export interface ItemFilesProps {
  attachments: SlagAttachment[];
  srcs: AttachmentSrcs;
  /** A card that is nothing but one file drops the plate and keeps the row. */
  isFileBubble: boolean;
  /** Time of the note itself; the bubble has no footer left to keep it in. */
  formattedTime: string;
}

/** File attachments: one download row each, with size and the summary the enrichment left. */
const ItemFilesComponent: React.FC<ItemFilesProps> = ({
  attachments,
  srcs,
  isFileBubble,
  formattedTime,
}) => {
  if (attachments.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${isFileBubble ? 'w-full' : 'pt-1 w-full'}`}>
    {attachments.map((file) => (
      <a
        key={file.id}
        href={attachmentSrc(srcs, file)}
        download={file.name}
        className={
          isFileBubble
            ? 'flex items-center gap-2.5 sm:gap-3 w-full select-none group/file cursor-pointer'
            : 'flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-tint-3 hover:bg-tint-6 border border-tint-6 hover:border-tint-12 transition-colors group/file select-none cursor-pointer w-full'
        }
      >
        {/* Pure File Icon without podlozhka */}
        <Icon name="entity.article" size="lg" className="group-hover/file:text-fg-soft transition-colors shrink-0" />

        {/* Filename & Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span
            className="text-sm font-medium text-fg-soft group-hover/file:text-white truncate font-sans"
            title={file.name}
          >
            {file.name}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-fg-secondary font-sans truncate">
            <span className="font-mono text-fg-secondary">{formatBytes(file.size)}</span>
            {file.summary && (
              <>
                <span className="w-1 h-1 rounded-full bg-fg-dim shrink-0" />
                <span className="truncate text-fg-secondary" title={file.summary}>
                  {file.summary}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Action: Timestamp + Download for pure file, or Download icon */}
        <div className="flex items-center gap-2 shrink-0 ml-1">
          {isFileBubble && (
            <span className="text-2xs font-mono text-fg-muted select-none leading-none">
              {formattedTime}
            </span>
          )}
          <div
            className="w-7 h-7 rounded-lg text-fg-secondary group-hover/file:text-white group-hover/file:bg-tint-8 flex items-center justify-center transition-colors"
            title="Скачать файл"
          >
            <Icon name="action.download" size="md" tone="inherit" />
          </div>
        </div>
      </a>
    ))}
    </div>
  );
};

export const ItemFiles = memo(ItemFilesComponent);
