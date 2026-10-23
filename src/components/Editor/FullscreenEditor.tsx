import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType } from '../../types';
import {
  ArrowLeft,
  Save,
  Trash2,
  CheckCircle2,
  Circle,
  X,
  Tag,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  CheckSquare,
  Code,
  Quote,
  Link2
} from 'lucide-react';

interface FullscreenEditorContentProps {
  item: SlagItem;
}

const FullscreenEditorContent: React.FC<FullscreenEditorContentProps> = ({ item }) => {
  const {
    setIsFullscreenEditorOpen,
    saveItem,
    updateItem,
    deleteItem,
    setSelectedItem,
    folders,
    addToast
  } = useApp();

  const [title, setTitle] = useState(item.title || '');
  const [content, setContent] = useState(item.content || '');
  const [type, setType] = useState<SlagItemType>(item.type || 'article');
  const [folder, setFolder] = useState(item.folder || 'Входящие');
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(item.priority || 'none');
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; completed: boolean }>>(item.subtasks || []);
  const [newSubtaskInput, setNewSubtaskInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  // Auto-resize textarea to prevent nested scrollbars cutting through content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(450, textareaRef.current.scrollHeight)}px`;
    }
  }, [content]);

  const handleSave = useCallback(() => {
    const isNewDraft = item.id.startsWith('draft_');
    const updated: SlagItem = {
      ...item,
      id: isNewDraft ? 'item_' + Date.now() : item.id,
      title: title.trim() || 'Без названия',
      content: content.trim(),
      type,
      folder,
      tags,
      priority: type === 'task' ? priority : undefined,
      dueDate: type === 'task' ? dueDate : undefined,
      subtasks: type === 'task' ? subtasks : undefined,
      readingTimeMinutes: type === 'article' ? readTime : undefined,
      updatedAt: Date.now(),
    };

    if (isNewDraft) {
      saveItem(updated);
      addToast('Запись создана и сохранена', 'success');
    } else {
      updateItem(updated);
      addToast('Изменения сохранены', 'success');
    }
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [item, title, content, type, folder, tags, priority, dueDate, subtasks, readTime, saveItem, updateItem, addToast, setIsFullscreenEditorOpen, setSelectedItem]);

  const handleClose = useCallback(() => {
    // Pure back / cancel: DO NOT save or publish note to feed
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [setIsFullscreenEditorOpen, setSelectedItem]);

  // Keyboard shortcuts: Esc = Cancel / Back, Ctrl/Cmd+S = Save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const cleaned = newTagInput.trim().replace(/^#/, '');
      if (!tags.includes(cleaned)) {
        setTags([...tags, cleaned]);
      }
      setNewTagInput('');
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskInput.trim()) return;
    setSubtasks([
      ...subtasks,
      { id: 'st_' + Date.now(), title: newSubtaskInput.trim(), completed: false },
    ]);
    setNewSubtaskInput('');
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map(s => (s.id === id ? { ...s, completed: !s.completed } : s)));
  };

  const deleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('fullscreen-textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = content.slice(start, end);
    const rep = `${prefix}${sel || 'текст'}${suffix}`;
    const nextContent = content.slice(0, start) + rep + content.slice(end);
    setContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (sel ? sel.length : 5));
    }, 10);
  };

  return (
    <div className="fixed inset-0 z-50 z-[100] bg-[#09090b] flex flex-col animate-in fade-in duration-150 text-[#f4f4f5]">
      {/* Top Floating Control Bar - Centered to match content width */}
      <header
        className="min-h-14 border-b border-white/[0.06] bg-[#0c0c0e] shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="max-w-4xl mx-auto w-full h-full flex flex-wrap md:flex-nowrap items-center justify-between px-4 md:px-6 py-2 md:py-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>

            <span className="text-zinc-600 hidden md:inline">/</span>

            {/* Folder Selector */}
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1 text-xs text-zinc-300 outline-none cursor-pointer max-w-[130px] md:max-w-none truncate"
            >
              {folders.map(f => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>

            {/* Item Type Switcher */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06]">
              {(['note', 'task', 'article'] as SlagItemType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-2 md:px-2.5 py-1 rounded-md text-[11px] capitalize transition-colors cursor-pointer ${
                    type === t ? 'bg-white/10 text-white font-medium shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t === 'note' ? 'Заметка' : t === 'task' ? 'Таска' : 'Статья'}
                </button>
              ))}
            </div>
          </div>

          {/* Stats & Actions */}
          <div className="flex items-center gap-2 md:gap-3 text-xs text-zinc-500 ml-auto">
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px]">
              <span>{wordCount} слов</span>
              <span>•</span>
              <span>~{readTime} мин</span>
            </div>

            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm shadow-blue-500/20 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить</span>
            </button>

            <button
              onClick={() => {
                deleteItem(item.id);
                setIsFullscreenEditorOpen(false);
                setSelectedItem(null);
              }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Удалить запись"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto py-4 md:py-8">
        <div className="max-w-4xl mx-auto w-full px-4 md:px-6 flex flex-col gap-5 md:gap-6">
          {/* Title Input */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок..."
            className="w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight text-white placeholder-zinc-600 border-none px-0 outline-none"
          />

          {/* Formatting Shortcut Toolbar */}
          <div className="flex items-center gap-1 py-1.5 border-y border-white/[0.04] text-zinc-400 overflow-x-auto scrollbar-none">
            <button
              onClick={() => insertMarkdown('# ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Заголовок 1"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('## ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Заголовок 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('**', '**')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Жирный"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('*', '*')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Курсив"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('- ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Список"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('- [ ] ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Чекбокс"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('> ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Цитата"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('```\n', '\n```')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Блок кода"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('[[', ']]')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Ссылка [[заметка]]"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          {/* Task-Specific Metadata Options */}
          {type === 'task' && (
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Приоритет:</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="bg-black/50 border border-white/[0.08] rounded px-2 py-1 text-zinc-300"
                  >
                    <option value="none">Обычный</option>
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Дедлайн:</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="bg-black/50 border border-white/[0.08] rounded px-2 py-1 text-zinc-300"
                  />
                </div>
              </div>

              {/* Subtasks List & Add */}
              <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.04]">
                <span className="text-xs font-medium text-zinc-400">Подзадачи:</span>
                <div className="flex flex-col gap-1.5">
                  {subtasks.map(st => (
                    <div key={st.id} className="flex items-center justify-between text-xs group">
                      <div
                        onClick={() => toggleSubtask(st.id)}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        {st.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
                        )}
                        <span className={st.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}>
                          {st.title}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteSubtask(st.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddSubtask} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newSubtaskInput}
                    onChange={(e) => setNewSubtaskInput(e.target.value)}
                    placeholder="Добавить подзадачу..."
                    className="flex-1 bg-black/40 border border-white/[0.08] rounded px-2.5 py-1 text-xs text-white placeholder-zinc-600"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium cursor-pointer"
                  >
                    Добавить
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Main Markdown Textarea - Auto-resizing font-mono, no double scrollbar */}
          <textarea
            ref={textareaRef}
            id="fullscreen-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Пишите здесь... Поддерживается полный синтаксис Markdown (#, **, -, [ ], таблицы, ссылки)"
            className="w-full bg-transparent font-mono text-[13px] text-[#f4f4f5] placeholder-zinc-600 resize-none leading-relaxed border-none focus:outline-none overflow-hidden"
          />

          {/* Tags Section */}
          <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-white/[0.06]">
            <Tag className="w-3.5 h-3.5 text-zinc-500" />
            {tags.map(t => (
              <span
                key={t}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] text-xs font-mono text-zinc-300"
              >
                #{t}
                <button
                  onClick={() => setTags(tags.filter(tag => tag !== t))}
                  className="hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ тег (Enter)"
              className="bg-transparent text-xs font-mono text-white placeholder-zinc-600 w-28 px-1 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const FullscreenEditor: React.FC = () => {
  const { isFullscreenEditorOpen, selectedItem } = useApp();

  if (!isFullscreenEditorOpen || !selectedItem) return null;

  return <FullscreenEditorContent key={selectedItem.id} item={selectedItem} />;
};
