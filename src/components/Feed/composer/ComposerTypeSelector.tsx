// The note / task / article switch at the bottom of the composer.
import React from 'react';
import { CheckSquare, FileText, StickyNote } from 'lucide-react';
import { ResponsiveSegmented, type SegmentedOption } from '../../UI/ResponsiveSegmented';
import type { SlagItemType } from '../../../types';

/** Note, task, article — the three shapes a record can take. */
const TYPE_OPTIONS: SegmentedOption<SlagItemType>[] = [
  {
    value: 'note',
    label: 'Заметка',
    showLabelInTrigger: true,
    icon: <StickyNote className="w-4 h-4" />,
    title: 'Заметка',
    ariaLabel: 'Заметка',
  },
  {
    value: 'task',
    label: 'Таска',
    showLabelInTrigger: true,
    icon: <CheckSquare className="w-4 h-4" />,
    title: 'Таска',
    ariaLabel: 'Таска',
  },
  {
    value: 'article',
    label: 'Статья',
    showLabelInTrigger: true,
    icon: <FileText className="w-4 h-4" />,
    title: 'Статья',
    ariaLabel: 'Статья',
  },
];

export interface ComposerTypeSelectorProps {
  value: SlagItemType;
  onChange: (type: SlagItemType) => void;
}

/** Record type selector: a ghost droplist (icon + label + chevron) with a larger touch target. */
export const ComposerTypeSelector: React.FC<ComposerTypeSelectorProps> = ({ value, onChange }) => (
  <ResponsiveSegmented<SlagItemType>
    value={value}
    onChange={onChange}
    options={TYPE_OPTIONS}
    triggerClassName="composer-toolbar-control composer-record-type"
    compact={true}
    size="md"
    direction="up"
    ariaLabel="Сменить тип записи"
  />
);
