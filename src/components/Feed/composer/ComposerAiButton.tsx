// The +AI button: asks the model for folder and tags, spinning while the call runs.
import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
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
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )
    }
  >
    <span className="sr-only">+AI</span>
  </ToolbarButton>
);
