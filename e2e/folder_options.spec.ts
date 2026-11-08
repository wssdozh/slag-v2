import { test, expect } from '@playwright/test';
import { buildFolderOptions } from '../src/lib/vault/folderOptions';
import type { FolderMeta } from '../src/types';

const foldersOf = (...paths: string[]) => paths.map((path) => ({ path })) as unknown as FolderMeta[];

test.describe('Folder picker list', () => {
  test('nested folders render as a tree branch instead of a repeated path', () => {
    const options = buildFolderOptions(
      foldersOf('Род', 'Род/доч1', 'Род/доч1/внук', 'Род/доч2', 'Карьера', 'Карьера/Поиск работы')
    );

    expect(options.map((option) => option.label)).toEqual([
      'Входящие',
      'Карьера',
      '╰── Поиск работы',
      'Род',
      '├── доч1',
      '│   ╰── внук',
      '╰── доч2',
    ]);
  });

  test('values stay full paths so selection keeps working', () => {
    const options = buildFolderOptions(foldersOf('Род', 'Род/доч1/внук'));
    const nested = options.find((option) => option.label.includes('внук'));

    expect(nested?.value).toBe('Род/доч1/внук');
  });

  test('inbox is always first and no label repeats a slash', () => {
    const options = buildFolderOptions(foldersOf('А', 'А/Б', 'В/Г/Д'));

    expect(options[0]).toEqual({ value: 'Входящие', label: 'Входящие' });
    expect(options.filter((option) => option.label.includes('/'))).toEqual([]);
  });

  test('a root opens a new group, its children do not', () => {
    const options = buildFolderOptions(foldersOf('Род', 'Род/доч1', 'Карьера'));
    const withDivider = options.filter((option) => option.dividerBefore).map((option) => option.label);

    expect(withDivider).toEqual(['Карьера', 'Род']);
  });
});
