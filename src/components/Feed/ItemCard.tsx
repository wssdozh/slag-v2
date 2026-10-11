import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import {
  CheckCircle2,
  Circle,
  Maximize2,
  Trash2,
  MoreVertical,
  Paperclip,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';

interface ItemCardProps {
  item: SlagItem;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  const {
    toggleTaskComplete,
    deleteItem,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setActiveTagFilter,
    folders,
    moveItem
  } = useApp();

  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);

  const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isTask = item.type === 'task';
  const isArticle = item.type === 'article';

  const audioAttachments = item.attachments.filter(a => a.type === 'audio');
  const imageAttachments = item.attachments.filter(a => a.type === 'image');
  const fileAttachments = item.attachments.filter(a => a.type === 'file');

  const completedSubtasksCount = item.subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasksCount = item.subtasks?.length || 0;

  const handleOpenArticle = () => {
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
  };

  return (
    <div className="group relative flex flex-col gap-1.5 max-w-2xl w-full mx-auto p-3.5 rounded-xl bg-[#141417]/80 hover:bg-[#161619] border border-white/[0.05] transition-all">
      {/* Top Header / Metadata Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          {/* Item Type Badge */}
          {isTask && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300">
              Таска
            </span>
          )}
          {isArticle && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-300">
              Статья {item.readingTimeMinutes ? `• ${item.readingTimeMinutes} мин` : ''}
            </span>
          )}

          {/* Folder pill if not in inbox */}
          {item.folder !== 'Входящие' && (
            <span className="text-[11px] text-zinc-400 font-mono">
              {item.folder}
            </span>
          )}

          {/* Task Priority */}
          {isTask && item.priority && item.priority !== 'none' && (
            <span
              className={`text-[10px] uppercase font-mono px-1 rounded ${
                item.priority === 'high'
                  ? 'text-rose-400 bg-rose-500/10'
                  : item.priority === 'medium'
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-zinc-400 bg-zinc-800'
              }`}
            >
              {item.priority}
            </span>
          )}

          {/* Task Due Date */}
          {isTask && item.dueDate && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
              <Calendar className="w-3 h-3" />
              {item.dueDate}
            </span>
          )}
        </div>

        {/* Message Actions & Timestamp */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500">{formattedTime}</span>

          {/* Context Menu Trigger */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-all"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-[#1a1a1e] border border-white/[0.08] shadow-2xl p-1 z-30 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  onClick={() => {
                    handleOpenArticle();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Редактировать в фокусе</span>
                </button>

                <button
                  onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
                  className="flex items-center justify-between px-2 py-1.5 rounded text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <span>Переместить в папку</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>

                {isMoveMenuOpen && (
                  <div className="pl-3 py-1 flex flex-col gap-0.5 border-l border-white/10 my-0.5">
                    {folders.map(f => (
                      <button
                        key={f.path}
                        onClick={() => {
                          moveItem(item.id, f.path);
                          setIsMenuOpen(false);
                          setIsMoveMenuOpen(false);
                        }}
                        className={`text-left text-[11px] px-1.5 py-1 rounded truncate transition-colors ${
                          f.path === item.folder ? 'text-white font-medium bg-white/10' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="my-1 border-t border-white/[0.06]" />

                <button
                  onClick={() => {
                    deleteItem(item.id);
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить запись</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isTask ? (
        /* Task Variant */
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => toggleTaskComplete(item.id)}
              className="mt-0.5 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              {item.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/10" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-medium leading-snug tracking-tight ${
                  item.status === 'done'
                    ? 'line-through text-zinc-500'
                    : 'text-zinc-100'
                }`}
              >
                {item.title}
              </h3>

              {item.content && (
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap font-normal">
                  {item.content}
                </p>
              )}
            </div>
          </div>

          {/* Subtasks Section if exists */}
          {item.subtasks && item.subtasks.length > 0 && (
            <div className="mt-1 pl-6 flex flex-col gap-1 border-l border-white/[0.06]">
              <div
                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                className="flex items-center justify-between text-[11px] text-zinc-500 cursor-pointer hover:text-zinc-300 select-none py-0.5"
              >
                <span>
                  Подзадачи: {completedSubtasksCount} из {totalSubtasksCount}
                </span>
                {isSubtasksExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </div>

              {isSubtasksExpanded && (
                <div className="flex flex-col gap-1 pt-1">
                  {item.subtasks.map(st => (
                    <div
                      key={st.id}
                      onClick={() => toggleTaskComplete(item.id, st.id)}
                      className="flex items-center gap-2 cursor-pointer text-xs group/sub"
                    >
                      <button className="text-zinc-500 group-hover/sub:text-zinc-300 transition-colors shrink-0">
                        {st.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span
                        className={`text-xs ${
                          st.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : isArticle ? (
        /* Article Variant */
        <div
          onClick={handleOpenArticle}
          className="flex flex-col gap-1.5 cursor-pointer rounded-lg p-2.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{item.title}</span>
            </h3>
            <Maximize2 className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </div>

          <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed font-normal">
            {item.summary || item.content.slice(0, 180)}
          </p>

          <span className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            Нажмите, чтобы открыть статью целиком →
          </span>
        </div>
      ) : (
        /* Note Variant */
        <div className="flex flex-col gap-2">
          {item.title && item.title !== item.content.slice(0, 40) && (
            <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
              {item.title}
            </h3>
          )}

          {item.content && (
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-normal">
              {item.content}
            </div>
          )}
        </div>
      )}

      {/* Audio Notes Player (if any) */}
      {audioAttachments.map(att => (
        <div key={att.id} className="pt-1">
          <AudioPlayer src={att.dataUrl || ''} />
        </div>
      ))}

      {/* Image Attachments Gallery */}
      {imageAttachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1 max-w-md">
          {imageAttachments.map(img => (
            <div
              key={img.id}
              className="rounded-lg overflow-hidden border border-white/[0.06] bg-black/40 aspect-video flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => {
                const w = window.open('');
                w?.document.write(`<body style="margin:0;background:#09090b;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${img.dataUrl}" style="max-width:95%;max-height:95%;border-radius:8px;" /></body>`);
              }}
            >
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* File Attachments Pills */}
      {fileAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {fileAttachments.map(file => (
            <a
              key={file.id}
              href={file.dataUrl}
              download={file.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-xs text-zinc-300 border border-white/[0.06] transition-colors"
            >
              <Paperclip className="w-3 h-3 text-zinc-400" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {Math.round(file.size / 1024)} KB
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Tags List */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 items-center">
          {item.tags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTagFilter(tag)}
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
