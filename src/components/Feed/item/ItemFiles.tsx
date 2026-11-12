import React, { memo } from 'react';
import { Download, FileText } from 'lucide-react';
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
            : 'flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-colors group/file select-none cursor-pointer w-full'
        }
      >
        {/* Pure File Icon without podlozhka */}
        <FileText className="w-5 h-5 text-zinc-400 group-hover/file:text-zinc-200 transition-colors shrink-0" />

        {/* Filename & Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span
            className="text-sm font-medium text-zinc-200 group-hover/file:text-white truncate font-sans"
            title={file.name}
          >
            {file.name}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-sans truncate">
            <span className="font-mono text-zinc-400">{formatBytes(file.size)}</span>
            {file.summary && (
              <>
                <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                <span className="truncate text-zinc-400" title={file.summary}>
                  {file.summary}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Action: Timestamp + Download for pure file, or Download icon */}
        <div className="flex items-center gap-2 shrink-0 ml-1">
          {isFileBubble && (
            <span className="text-2xs font-mono text-zinc-500 select-none leading-none">
              {formattedTime}
            </span>
          )}
          <div
            className="w-7 h-7 rounded-lg text-zinc-400 group-hover/file:text-white group-hover/file:bg-white/[0.08] flex items-center justify-center transition-colors"
            title="Скачать файл"
          >
            <Download className="w-4 h-4" />
          </div>
        </div>
      </a>
    ))}
    </div>
  );
};

export const ItemFiles = memo(ItemFilesComponent);
