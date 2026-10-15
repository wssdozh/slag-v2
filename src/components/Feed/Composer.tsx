import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItemType, SlagAttachment } from '../../types';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { generateSmartTags } from '../../lib/geminiService';
import {
  Send,
  Trash2,
  Paperclip,
  Mic,
  Video,
  Sparkles,
  Bold,
  Heading2,
  CheckSquare,
  Table,
  Link2,
  Image as ImageIcon,
  Code2,
  Smile,
  X,
  Loader2,
  ChevronDown,
  Maximize2,
  CornerUpLeft,
  FileText,
  StickyNote
} from 'lucide-react';

export const Composer: React.FC = () => {
  const {
    saveItem,
    currentFolder,
    aiSettings,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    replyTarget,
    setReplyTarget,
    items,
    addToast
  } = useApp();

  const [content, setContent] = useState('');
  const [itemType, setItemType] = useState<SlagItemType>('note');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>('none');
  const [dueDate, setDueDate] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<SlagAttachment[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  // WikiLink [[ autocomplete state
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [wikiSelectedIndex, setWikiSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Focus textarea when replying
  useEffect(() => {
    if (replyTarget && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTarget]);

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  }, [content]);

  // WikiLink items matching current query
  const matchingWikiItems = wikiQuery !== null
    ? items
        .filter(i => (i.title || '').toLowerCase().includes(wikiQuery.toLowerCase()))
        .slice(0, 5)
    : [];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);

    const cursorPos = e.target.selectionStart || text.length;
    const textBefore = text.slice(0, cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);
    if (match) {
      setWikiQuery(match[1]);
      setWikiSelectedIndex(0);
    } else {
      setWikiQuery(null);
    }
  };

  const insertWikiLink = (targetItem: (typeof items)[0]) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart || content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);
    if (match && match.index !== undefined) {
      const startIdx = match.index;
      const cleanTitle = targetItem.title || targetItem.id;
      const newText = textBefore.slice(0, startIdx) + `[[${cleanTitle}]] ` + textAfter;
      setContent(newText);
      setWikiQuery(null);
      setTimeout(() => {
        el.focus();
        const newCursor = startIdx + cleanTitle.length + 5;
        el.setSelectionRange(newCursor, newCursor);
      }, 10);
    }
  };

  // Insert markdown helpers
  const insertFormatting = (prefix: string, suffix: string = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = `${prefix}${selected || 'текст'}${suffix}`;
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 5));
    }, 10);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
        const attachment: SlagAttachment = {
          id,
          name: file.name,
          type: type === 'image' || file.type.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          relativePath: `.attachments/${id}_${file.name}`,
          dataUrl: reader.result as string,
        };
        setAttachments(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSmartAiTags = async () => {
    if (!content.trim() && attachments.length === 0) {
      addToast('Введите текст заметки для ИИ', 'info');
      return;
    }

    setIsGeneratingAiTags(true);
    try {
      const suggestedTags = await generateSmartTags(content, aiSettings);
      if (suggestedTags.length > 0) {
        const merged = Array.from(new Set([...tags, ...suggestedTags]));
        setTags(merged);
        addToast(`Теги: ${suggestedTags.map(t => '#' + t).join(' ')}`, 'success');
      } else {
        addToast('ИИ не нашел подходящих тегов', 'info');
      }
    } catch {
      addToast('Ошибка запроса к Gemini', 'error');
    } finally {
      setIsGeneratingAiTags(false);
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const handleSend = () => {
    if (!content.trim() && attachments.length === 0) return;

    let title = '';
    const lines = content.trim().split('\n');
    const firstLine = lines[0].replace(/^#+\s*/, '').trim();

    if (itemType === 'article') {
      title = firstLine || 'Новая статья';
    } else if (itemType === 'task') {
      title = firstLine || 'Новая задача';
    } else {
      title = firstLine.slice(0, 50) || 'Заметка';
    }

    const inlineTags = Array.from(content.matchAll(/#([a-zA-Zа-яА-Я0-9_-]+)/g)).map(m => m[1]);
    const finalTags = Array.from(new Set([...tags, ...inlineTags]));

    let subtasks: Array<{ id: string; title: string; completed: boolean }> = [];
    if (itemType === 'task') {
      const checkboxLines = lines.filter(l => /^\s*-\s*\[([ xX])\]\s+(.+)$/.test(l));
      if (checkboxLines.length > 0) {
        subtasks = checkboxLines.map((l, idx) => {
          const match = l.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
          return {
            id: 'st_' + idx,
            title: match ? match[2].trim() : l,
            completed: match ? match[1].toLowerCase() === 'x' : false,
          };
        });
      }
    }

    saveItem({
      type: itemType,
      title,
      content: content.trim(),
      folder: currentFolder,
      tags: finalTags,
      attachments,
      replyToId: replyTarget?.id,
      priority: itemType === 'task' ? priority : undefined,
      dueDate: itemType === 'task' && dueDate ? dueDate : undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });

    setContent('');
    setTags([]);
    setAttachments([]);
    setPriority('none');
    setDueDate('');
    setReplyTarget(null);
    setWikiQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Expand into Fullscreen Focus Mode directly from composer
  const handleExpandToFullscreen = () => {
    const lines = content.trim().split('\n');
    const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() || (itemType === 'article' ? 'Новая статья' : 'Черновик');
    const tempItem = saveItem({
      type: itemType,
      title: firstLine,
      content: content.trim(),
      folder: currentFolder,
      tags,
      attachments,
      replyToId: replyTarget?.id,
      priority: itemType === 'task' ? priority : undefined,
      dueDate: itemType === 'task' && dueDate ? dueDate : undefined,
    });

    setContent('');
    setAttachments([]);
    setTags([]);
    setReplyTarget(null);
    setWikiQuery(null);
    setSelectedItem(tempItem);
    setIsFullscreenEditorOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Wiki autocomplete keyboard controls
    if (wikiQuery !== null && matchingWikiItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev < matchingWikiItems.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertWikiLink(matchingWikiItems[wikiSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setWikiQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickEmojis = ['💡', '🔥', '📌', '⚡', '✅', '🚀', '🧠', '☕'];

  return (
    <div className="p-3 bg-[#0c0c0e] border-t border-white/[0.06] flex flex-col gap-2 select-none shrink-0 max-w-3xl w-full mx-auto">
      {/* Top Telegram-style Formatting Bar */}
      <div className="flex items-center gap-1 text-zinc-400 border-b border-white/[0.04] pb-1.5 px-1">
        <button
          onClick={() => insertFormatting('## ', '')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Заголовок"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('**', '**')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Жирный"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('- [ ] ', '')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Чеклист"
        >
          <CheckSquare className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('\n| Колонки 1 | Колонки 2 |\n|---|---|\n| Текст 1 | Текст 2 |\n')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Таблица"
        >
          <Table className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('[', '](https://)')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Ссылка"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => imageInputRef.current?.click()}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Изображение"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('```\n', '\n```')}
          className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Блок кода"
        >
          <Code2 className="w-4 h-4" />
        </button>

        {/* Emoji popover */}
        <div className="relative">
          <button
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Эмодзи"
          >
            <Smile className="w-4 h-4" />
          </button>

          {isEmojiPickerOpen && (
            <div className="absolute left-0 bottom-full mb-1 flex items-center gap-1.5 p-1.5 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl z-30 animate-in fade-in">
              {quickEmojis.map(emo => (
                <button
                  key={emo}
                  onClick={() => {
                    setContent(prev => prev + emo);
                    setIsEmojiPickerOpen(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-sm transition-colors"
                >
                  {emo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reply Banner */}
      {replyTarget && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.04] border-l-2 border-blue-400 text-xs text-zinc-300 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[11px] font-mono text-blue-400/90 shrink-0">
              {replyTarget.type === 'task' ? 'Ответ на таску:' : replyTarget.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
            </span>
            <span className="truncate text-zinc-200 font-medium text-xs">
              {replyTarget.title || replyTarget.content.slice(0, 45)}
            </span>
          </div>
          <button
            onClick={() => setReplyTarget(null)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
            title="Отменить ответ"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachments Preview Strip */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 py-1">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 relative group"
            >
              {att.type === 'image' && (
                <img src={att.dataUrl} alt={att.name} className="w-8 h-8 object-cover rounded-md" />
              )}
              {att.type === 'video' && (
                <span className="text-[10px] font-mono text-zinc-400">⏹ Видео-квадратик</span>
              )}
              {att.type === 'audio' && (
                <span className="text-[10px] font-mono text-zinc-400">🎙 Войс</span>
              )}
              {att.type === 'file' && (
                <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[100px]">{att.name}</span>
              )}
              <button
                onClick={() => removeAttachment(att.id)}
                className="p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Tags Preview */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 text-[10px] font-mono"
            >
              #{tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:text-rose-400 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Media Recorders Active Banners */}
      {isRecordingAudio && (
        <AudioRecorder
          onRecorded={(att) => {
            setAttachments(prev => [...prev, att]);
            setIsRecordingAudio(false);
          }}
          onCancel={() => setIsRecordingAudio(false)}
        />
      )}

      {isRecordingVideo && (
        <VideoRecorder
          onRecorded={(att) => {
            setAttachments(prev => [...prev, att]);
            setIsRecordingVideo(false);
          }}
          onCancel={() => setIsRecordingVideo(false)}
        />
      )}

      {/* Hidden File / Image inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'file')}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'image')}
      />

      {/* Textarea Input Container with WikiLink popover */}
      <div className="relative">
        {wikiQuery !== null && matchingWikiItems.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 w-72 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-30 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
              Связать заметку [[...]]
            </div>
            {matchingWikiItems.map((wikiItem, idx) => {
              const isSelected = idx === wikiSelectedIndex;
              return (
                <button
                  key={wikiItem.id}
                  type="button"
                  onClick={() => insertWikiLink(wikiItem)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors truncate ${
                    isSelected ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  {wikiItem.type === 'task' && <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {wikiItem.type === 'article' && <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  {wikiItem.type === 'note' && <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  <span className="truncate">{wikiItem.title || wikiItem.id}</span>
                </button>
              );
            })}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={
            itemType === 'task'
              ? 'Задача... (- [ ] для подзадач, [[ для ссылки)'
              : itemType === 'article'
              ? 'Черновик статьи... (Shift+Enter для новой строки, [[ для ссылки)'
              : 'Мысль, заметка или код... (Enter для отправки, [[ для ссылки)'
          }
          className="w-full bg-transparent text-sm text-[#f4f4f5] placeholder-zinc-500 resize-none overflow-y-auto leading-relaxed py-1 px-1"
        />
      </div>

      {/* Task Extra Controls (Priority & Due Date) */}
      {itemType === 'task' && (
        <div className="flex items-center gap-3 px-1 py-1 text-xs text-zinc-400 border-t border-white/[0.04]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Приоритет:</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="bg-black/40 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-300"
            >
              <option value="none">Обычный</option>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Дедлайн:</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-black/40 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-300"
            />
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-between pt-1">
        {/* Left Side: +Ai Button, Type Selector, Voice Mic, Video Square, Attach */}
        <div className="flex items-center gap-2">
          {/* +Ai Smart Tagging Button */}
          <button
            onClick={handleSmartAiTags}
            disabled={isGeneratingAiTags}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors border border-white/[0.05]"
            title="ИИ тегирование"
          >
            {isGeneratingAiTags ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            )}
            <span>+Ai</span>
          </button>

          {/* Type Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-xs text-zinc-300 transition-colors"
            >
              <span>
                {itemType === 'note' ? 'Заметка' : itemType === 'task' ? 'Таска' : 'Статья'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {isTypeDropdownOpen && (
              <div className="absolute left-0 bottom-full mb-1 w-32 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-30 text-xs flex flex-col gap-0.5 animate-in fade-in">
                <button
                  onClick={() => {
                    setItemType('note');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors ${
                    itemType === 'note' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Заметка
                </button>
                <button
                  onClick={() => {
                    setItemType('task');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors ${
                    itemType === 'task' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Таска
                </button>
                <button
                  onClick={() => {
                    setItemType('article');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors ${
                    itemType === 'article' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Статья
                </button>
              </div>
            )}
          </div>

          {/* Voice Mic Button */}
          <button
            onClick={() => {
              setIsRecordingVideo(false);
              setIsRecordingAudio(!isRecordingAudio);
            }}
            className={`p-1.5 rounded-md transition-colors ${
              isRecordingAudio
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать голосовую заметку (войс)"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Video Square Camera Button */}
          <button
            onClick={() => {
              setIsRecordingAudio(false);
              setIsRecordingVideo(!isRecordingVideo);
            }}
            className={`p-1.5 rounded-md transition-colors ${
              isRecordingVideo
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать видео-квадратик"
          >
            <Video className="w-4 h-4" />
          </button>

          {/* File Attach Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Прикрепить файл"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>

        {/* Right Side: Clear draft, Fullscreen Expand Icon, and Send Button */}
        <div className="flex items-center gap-1.5">
          {(content.trim() || attachments.length > 0) && (
            <button
              onClick={() => {
                setContent('');
                setAttachments([]);
                setTags([]);
              }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors"
              title="Очистить"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Expand to Fullscreen Editor Icon Button */}
          <button
            onClick={handleExpandToFullscreen}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Раскрыть в полноэкранный редактор"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Telegram-style Circular Send Button */}
          <button
            onClick={handleSend}
            disabled={!content.trim() && attachments.length === 0}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all btn-press ${
              content.trim() || attachments.length > 0
                ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb] shadow-lg shadow-blue-500/20'
                : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
            }`}
            title="Отправить (Enter)"
          >
            <Send className="w-4 h-4 ml-0.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
