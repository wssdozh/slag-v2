// Shared props, options and dropdown state for the editor toolbar halves.
import type { SlagAttachment, SlagItem, SlagItemType } from '../../types';
import type { SegmentedOption } from '../UI/ResponsiveSegmented';
import { StickyNote, FileText, CheckSquare } from 'lucide-react';

export const ITEM_TYPE_OPTIONS: SegmentedOption<SlagItemType>[] = [
  { value: 'note', label: 'Заметка', icon: <StickyNote className="w-4 h-4" />, showLabelInTrigger: true, title: 'Заметка', ariaLabel: 'Заметка' },
  { value: 'task', label: 'Таска', icon: <CheckSquare className="w-4 h-4" />, showLabelInTrigger: true, title: 'Таска', ariaLabel: 'Таска' },
  { value: 'article', label: 'Статья', icon: <FileText className="w-4 h-4" />, showLabelInTrigger: true, title: 'Статья', ariaLabel: 'Статья' },
];

export type MarkdownDropdown = 'style' | 'list';

export interface EditorToolbarProps {
  item: SlagItem;
  folder: string;
  onFolderChange: (folder: string) => void;
  folderOptions: Array<{ value: string; label: string; dividerBefore?: boolean }>;
  type: SlagItemType;
  onTypeChange: (type: SlagItemType) => void;
  selectedAttachment: SlagAttachment | undefined;
  onSelectAttachment: (id: string | null) => void;
  onRemoveAttachment: (id: string) => void;
  onInsertAttachmentMarkdown: (name: string) => void;
  onOpenLightbox: (attachments: Array<{
    id: string;
    name: string;
    url: string;
    itemId?: string;
  }>, index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onInsertMarkdown: (prefix: string, suffix?: string) => void;
  onInsertTable: () => void;
  onAttachClick: () => void;
  onAiDecompose: () => void;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  isFullWidth?: boolean;
  /** Phone only: the sheet detent. Desktop has no width toggle. */
  onToggleFullWidth?: () => void;
  saveStatus: 'idle' | 'saving' | 'saved';
  onSave: () => void;
  onClose: () => void;
  /** Sheet mode: the toolbar sits inside the panel, not under the status bar. */
  isCompact?: boolean;
  /** Desktop detents: the note sits in its pane until expanded to the whole window. */
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export type EditorTopBarProps = Pick<
  EditorToolbarProps,
  'folder' | 'onFolderChange' | 'folderOptions' | 'type' | 'onTypeChange' | 'onClose'
>;

export type MarkdownPaletteProps = Pick<
  EditorToolbarProps,
  | 'selectedAttachment'
  | 'onSelectAttachment'
  | 'onRemoveAttachment'
  | 'onInsertAttachmentMarkdown'
  | 'onOpenLightbox'
  | 'onUndo'
  | 'onRedo'
  | 'onInsertMarkdown'
  | 'onInsertTable'
  | 'onAttachClick'
  | 'onAiDecompose'
> & {
  itemId: string;
  activeDropdown: MarkdownDropdown | null;
  onActiveDropdownChange: (next: MarkdownDropdown | null) => void;
};
