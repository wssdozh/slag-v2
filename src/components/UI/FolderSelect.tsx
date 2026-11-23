// The folder picker shared by the fullscreen editor and the desktop feed.
import { Select, type SelectProps } from './Select';

type FolderSelectProps = Pick<SelectProps, 'value' | 'onChange' | 'options' | 'aria-label'>;

export function FolderSelect(props: FolderSelectProps) {
  return <Select {...props} size="sm" variant="ghost" className="max-w-[220px] md:max-w-[280px] h-7 text-xs font-mono" />;
}
