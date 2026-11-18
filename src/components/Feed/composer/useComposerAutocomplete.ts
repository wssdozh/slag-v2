// The composer's suggestions: which trigger is open, what it matches, and applying a row.
import { useState, useMemo } from 'react';
import type { SlagItem, FolderMeta } from '../../../types';
import type { TagMeta } from '../TagSuggestionMenu';
import { SLASH_COMMANDS } from '../../../types/slashCommands';
import { folderTreeRows, type FolderTreeRow } from '../../../lib/vault/folderTree';
import type { ComposerFieldHandle } from './field';

/** The bit of a keyboard event the suggestions need, shared by the textarea and CM surfaces. */
export interface ComposerKeyEvent {
  key: string;
  preventDefault: () => void;
}

export interface UseComposerAutocompleteOptions {
  content: string;
  items: SlagItem[];
  folders: FolderMeta[];
  field: ComposerFieldHandle;
  addToast: (message: string, type: 'info' | 'success' | 'error') => void;
  setTargetFolder: (path: string | null) => void;
}

export const useComposerAutocomplete = ({
  content,
  items,
  folders,
  field,
  addToast,
  setTargetFolder,
}: UseComposerAutocompleteOptions) => {
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [wikiSelectedIndex, setWikiSelectedIndex] = useState(0);

  const [folderQuery, setFolderQuery] = useState<string | null>(null);
  const [folderSelectedIndex, setFolderSelectedIndex] = useState(0);

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  const [tagQuery, setTagQuery] = useState<string | null>(null);
  const [tagSelectedIndex, setTagSelectedIndex] = useState(0);

  // All unique tags in vault with usage counts, sorted by frequency
  const allVaultTags = useMemo<TagMeta[]>(() => {
    const counts = new Map<string, number>();
    items.forEach(it => {
      it.tags?.forEach(t => {
        const clean = t && t.trim();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
  }, [items]);

  // Tags matching current # autocomplete query
  const matchingAutocompleteTags = useMemo(() => {
    if (tagQuery === null) return [];
    const q = tagQuery.toLowerCase().trim();
    if (!q) return allVaultTags;
    return allVaultTags.filter(t => t.tag.toLowerCase().includes(q));
  }, [tagQuery, allVaultTags]);

  // WikiLink items matching current query
  const matchingWikiItems = wikiQuery !== null
    ? items
        .filter(i => (i.title || '').toLowerCase().includes(wikiQuery.toLowerCase()))
        .slice(0, 5)
    : [];

  // Slash commands matching current query
  const matchingSlashCommands = slashQuery !== null
    ? SLASH_COMMANDS.filter((cmd) => {
        const q = slashQuery.toLowerCase().trim();
        if (!q) return true;
        if (cmd.command.toLowerCase().includes(q)) return true;
        if (cmd.title.toLowerCase().includes(q)) return true;
        if (cmd.description.toLowerCase().includes(q)) return true;
        return cmd.aliases.some((alias) => alias.toLowerCase().includes(q));
      })
    : [];

  // Folders matching current @ query, drawn as the branches they are: a nested folder keeps its
  // parent in the list so the lines make sense, but only the folders themselves can be picked.
  const matchingFolders = useMemo<FolderTreeRow[]>(() => {
    if (folderQuery === null) return [];
    const q = folderQuery.toLowerCase().trim();
    const filtered = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      : folders;
    return folderTreeRows(filtered);
  }, [folderQuery, folders]);

  const selectableFolders = useMemo(() => matchingFolders.filter((row) => row.meta), [matchingFolders]);

  // Transition caches for smooth exit animations
  const [lastFolderQuery, setLastFolderQuery] = useState('');
  const [lastMatchingFolders, setLastMatchingFolders] = useState<FolderTreeRow[]>([]);
  if (folderQuery !== null) {
    if (folderQuery !== lastFolderQuery) setLastFolderQuery(folderQuery);
    if (matchingFolders !== lastMatchingFolders) setLastMatchingFolders(matchingFolders);
  }

  const [lastSlashQuery, setLastSlashQuery] = useState('');
  if (slashQuery !== null && slashQuery !== lastSlashQuery) {
    setLastSlashQuery(slashQuery);
  }

  const [lastTagQuery, setLastTagQuery] = useState('');
  const [lastMatchingTags, setLastMatchingTags] = useState<TagMeta[]>([]);
  if (tagQuery !== null) {
    if (tagQuery !== lastTagQuery) setLastTagQuery(tagQuery);
    if (matchingAutocompleteTags !== lastMatchingTags) setLastMatchingTags(matchingAutocompleteTags);
  }

  const [lastMatchingWikiItems, setLastMatchingWikiItems] = useState<SlagItem[]>([]);
  if (wikiQuery !== null && matchingWikiItems.length > 0) {
    if (matchingWikiItems !== lastMatchingWikiItems) setLastMatchingWikiItems(matchingWikiItems);
  }

  const insertTag = (selectedTag: string) => {
    const { from: cursorPos } = field.getSelection();
    const value = field.getValue() || content;
    const textBefore = value.slice(0, cursorPos);
    const hashIndex = textBefore.lastIndexOf('#');
    if (hashIndex !== -1) {
      const inserted = `#${selectedTag} `;
      field.replaceRange(hashIndex, cursorPos, inserted, hashIndex + inserted.length);
      setTagQuery(null);
      return;
    }
    const globalHashIndex = value.lastIndexOf('#');
    if (globalHashIndex !== -1) {
      const inserted = `#${selectedTag} `;
      field.replaceRange(globalHashIndex, value.length, inserted, globalHashIndex + inserted.length);
      setTagQuery(null);
    }
  };

  const insertWikiLink = (targetItem: SlagItem) => {
    const { from: cursorPos } = field.getSelection();
    const value = field.getValue() || content;
    const textBefore = value.slice(0, cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);
    if (match && match.index !== undefined) {
      const cleanTitle = targetItem.title || targetItem.id;
      const inserted = `[[${cleanTitle}]] `;
      field.replaceRange(match.index, cursorPos, inserted, match.index + inserted.length);
      setWikiQuery(null);
    }
  };

  const selectFolder = (row: FolderTreeRow) => {
    const { from: cursorPos } = field.getSelection();
    const value = field.getValue() || content;
    const textBefore = value.slice(0, cursorPos);
    const atMatch = textBefore.match(/(?:^|\s)@([a-zA-Zа-яА-ЯёЁ0-9_/-]*)$/);
    const inserted = `@${row.name} `;

    if (atMatch && atMatch.index !== undefined) {
      const isStartOfLine = atMatch[0].startsWith('@');
      const replaceStart = isStartOfLine ? atMatch.index : atMatch.index + 1;
      field.replaceRange(replaceStart, cursorPos, inserted, replaceStart + inserted.length);
    } else {
      const joiner = value && !/\s$/.test(value) ? ' ' : '';
      const appended = joiner + inserted;
      field.replaceRange(value.length, value.length, appended, value.length + appended.length);
    }
    field.focus();

    setTargetFolder(row.path);
    setFolderQuery(null);
    addToast(`Папка «${row.name}» выбрана`, 'info');
  };

  const updateAutocompleteQueries = (text: string, cursorPos: number) => {
    const textBefore = text.slice(0, cursorPos);
    const wikiMatch = textBefore.match(/\[\[([^\]\n]*)$/);
    if (wikiMatch) {
      setWikiQuery(wikiMatch[1]);
      setWikiSelectedIndex(0);
      setFolderQuery(null);
      setSlashQuery(null);
      setTagQuery(null);
      return;
    }

    setWikiQuery(null);
    const folderMatch = textBefore.match(/(?:^|\s)@([a-zA-Zа-яА-ЯёЁ0-9_/-]*)$/);
    if (folderMatch) {
      setFolderQuery(folderMatch[1]);
      setFolderSelectedIndex(0);
      setSlashQuery(null);
      setTagQuery(null);
      return;
    }

    setFolderQuery(null);
    const slashMatch = textBefore.match(/(?:^|\s)\/([a-zA-Zа-яА-ЯёЁ0-9_-]*)$/);
    if (slashMatch) {
      setSlashQuery(slashMatch[1]);
      setSlashSelectedIndex(0);
      setTagQuery(null);
      return;
    }

    setSlashQuery(null);
    const tagMatch = textBefore.match(/(?:^|\s)#([a-zA-Zа-яА-ЯёЁ0-9_-]*)$/);
    if (tagMatch) {
      setTagQuery(tagMatch[1]);
      setTagSelectedIndex(0);
    } else {
      setTagQuery(null);
    }
  };

  const clearQueries = () => {
    setFolderQuery(null);
    setSlashQuery(null);
    setTagQuery(null);
    setWikiQuery(null);
  };

  const handleAutocompleteKeyDown = (e: ComposerKeyEvent): boolean => {
    // Folder autocomplete keyboard controls
    if (folderQuery !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFolderQuery(null);
        return true;
      }
      if (selectableFolders.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFolderSelectedIndex(prev => (prev < selectableFolders.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFolderSelectedIndex(prev => (prev > 0 ? prev - 1 : selectableFolders.length - 1));
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const row = selectableFolders[Math.min(folderSelectedIndex, selectableFolders.length - 1)];
          if (row) selectFolder(row);
          return true;
        }
      }
    }

    // Wiki autocomplete keyboard controls
    if (wikiQuery !== null && matchingWikiItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev < matchingWikiItems.length - 1 ? prev + 1 : prev));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertWikiLink(matchingWikiItems[wikiSelectedIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setWikiQuery(null);
        return true;
      }
    }

    // Tag autocomplete keyboard controls
    if (tagQuery !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTagQuery(null);
        return true;
      }
      if (matchingAutocompleteTags.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTagSelectedIndex(prev => (prev < matchingAutocompleteTags.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTagSelectedIndex(prev => (prev > 0 ? prev - 1 : matchingAutocompleteTags.length - 1));
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (
            e.key === 'Enter' &&
            tagQuery &&
            matchingAutocompleteTags[tagSelectedIndex].tag.toLowerCase() === tagQuery.toLowerCase()
          ) {
            // Fall through to send
            return false;
          } else {
            e.preventDefault();
            insertTag(matchingAutocompleteTags[tagSelectedIndex].tag);
            return true;
          }
        }
      }
    }

    return false;
  };


  return {
    wikiQuery,
    setWikiQuery,
    wikiSelectedIndex,
    setWikiSelectedIndex,
    folderQuery,
    setFolderQuery,
    folderSelectedIndex,
    setFolderSelectedIndex,
    slashQuery,
    setSlashQuery,
    slashSelectedIndex,
    setSlashSelectedIndex,
    tagQuery,
    setTagQuery,
    tagSelectedIndex,
    setTagSelectedIndex,
    allVaultTags,
    matchingAutocompleteTags,
    matchingWikiItems,
    matchingSlashCommands,
    matchingFolders,
    lastFolderQuery,
    lastMatchingFolders,
    lastSlashQuery,
    lastTagQuery,
    lastMatchingTags,
    lastMatchingWikiItems,
    insertTag,
    insertWikiLink,
    selectFolder,
    updateAutocompleteQueries,
    clearQueries,
    handleAutocompleteKeyDown,
  };
};

