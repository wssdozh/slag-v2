// The +AI button: asks the model for folder and tags, spinning while the call runs.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import { ToolbarButton } from '../../UI/ToolbarButton';

export interface ComposerAiButtonProps {
  isGenerating: boolean;
  onClick: () => void;
}

/** +AI: asks the model which folder and tags the draft belongs to. Icon only. */
export const ComposerAiButton: React.FC<ComposerAiButtonProps> = ({ isGenerating, onClick }) => (
  <ToolbarButton
    size="md"
    className="composer-toolbar-control composer-toolbar-icon"
    onClick={onClick}
    disabled={isGenerating}
    title="ИИ классификация: папка и теги (+AI)"
    aria-label="ИИ классификация: папка и теги (+AI)"
    icon={
      isGenerating ? (
        <Icon name="status.loading" size="md" tone="inherit" className="animate-spin" />
      ) : (
        <Icon name="system.ai" size="md" tone="inherit" />
      )
    }
  >
    <span className="sr-only">+AI</span>
  </ToolbarButton>
);
