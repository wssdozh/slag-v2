// Shares ephemeral filter state across Dockview's stable panel components.
import { createContext, useContext } from 'react';
import type { TaskQuickFilter, TaskQuickFilterId } from '../../lib/tasks/taskQuickFilter';

export const WorkspaceTaskFilterContext = createContext<{
  panelId?: string;
  filter?: TaskQuickFilter;
  toggleFilter?: (id: TaskQuickFilterId) => void;
}>({});

export function useWorkspaceTaskFilterContext() {
  return useContext(WorkspaceTaskFilterContext);
}
