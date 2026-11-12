// The slash-command palette: trigger, aliases, icon and what each command inserts.
import React from 'react';
import {
  CheckSquare,
  StickyNote,
  FileText,
  Calendar,
  Clock,
  Sparkles,
  Mic,
  Video,
  Trash2,
  Flame,
  Zap,
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  command: string;
  title: string;
  description: string;
  category: 'type' | 'date' | 'priority' | 'ai' | 'media' | 'util';
  aliases: string[];
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Тип записи
  {
    id: 'task',
    command: '/task',
    title: 'Задача',
    description: 'Переключить режим на задачу с чекбоксом',
    category: 'type',
    aliases: ['таска', 'задача', 't', 'task', 'чек'],
    badge: 'T',
    icon: CheckSquare,
  },
  {
    id: 'note',
    command: '/note',
    title: 'Заметка',
    description: 'Обычная текстовая мысль или сниппет',
    category: 'type',
    aliases: ['заметка', 'мысль', 'note', 'n', 'текст'],
    badge: 'N',
    icon: StickyNote,
  },
  {
    id: 'article',
    command: '/article',
    title: 'Статья',
    description: 'Лонгрид с заголовком и структурой',
    category: 'type',
    aliases: ['статья', 'лонгрид', 'article', 'a', 'пост'],
    badge: 'A',
    icon: FileText,
  },

  // Даты и дедлайны
  {
    id: 'today',
    command: '/today',
    title: 'Срок: Сегодня',
    description: 'Установить дедлайн задачи на сегодня',
    category: 'date',
    aliases: ['сегодня', 'today', 'day', 'срок'],
    badge: 'Today',
    icon: Calendar,
  },
  {
    id: 'tomorrow',
    command: '/tomorrow',
    title: 'Срок: Завтра',
    description: 'Установить дедлайн задачи на завтра',
    category: 'date',
    aliases: ['завтра', 'tomorrow', 'tmrw'],
    badge: 'Tmrw',
    icon: Clock,
  },

  // Приоритеты
  {
    id: 'urgent',
    command: '/urgent',
    title: 'Приоритет: Urgent (P1)',
    description: 'Критический приоритет задачи',
    category: 'priority',
    aliases: ['urgent', 'p1', 'срочно', 'критично', 'fire'],
    badge: 'P1',
    icon: Flame,
  },
  {
    id: 'high',
    command: '/high',
    title: 'Приоритет: High (P2)',
    description: 'Повышенный приоритет',
    category: 'priority',
    aliases: ['high', 'p2', 'важно', 'высокий'],
    badge: 'P2',
    icon: Zap,
  },
  {
    id: 'medium',
    command: '/medium',
    title: 'Приоритет: Medium (P3)',
    description: 'Обычный рабочий приоритет',
    category: 'priority',
    aliases: ['medium', 'med', 'p3', 'средний', 'норма'],
    badge: 'P3',
    icon: Zap,
  },
  {
    id: 'low',
    command: '/low',
    title: 'Приоритет: Low (P4)',
    description: 'Низкий фоновый приоритет',
    category: 'priority',
    aliases: ['low', 'p4', 'низкий'],
    badge: 'P4',
    icon: Zap,
  },

  // ИИ и категоризация
  {
    id: 'ai',
    command: '/ai',
    title: 'Автокатегоризация (+AI)',
    description: 'Определить подходящую папку и теги по тексту',
    category: 'ai',
    aliases: ['ai', 'ии', 'теги', 'папка', 'smart', 'автотеги'],
    badge: '+AI',
    icon: Sparkles,
  },

  // Медиа
  {
    id: 'audio',
    command: '/audio',
    title: 'Голосовое сообщение',
    description: 'Начать запись аудиопотока',
    category: 'media',
    aliases: ['голос', 'аудио', 'войс', 'audio', 'voice', 'mic'],
    badge: 'Voice',
    icon: Mic,
  },
  {
    id: 'video',
    command: '/video',
    title: 'Видео-кружок',
    description: 'Записать круглое видеосообщение',
    category: 'media',
    aliases: ['видео', 'кружок', 'video', 'cam'],
    badge: 'Video',
    icon: Video,
  },

  // Утилиты
  {
    id: 'clear',
    command: '/clear',
    title: 'Очистить черновик',
    description: 'Сбросить весь набранный текст, теги и вложения',
    category: 'util',
    aliases: ['очистить', 'сброс', 'стереть', 'clear', 'reset'],
    badge: 'Esc',
    icon: Trash2,
  },
];

export const CATEGORY_LABELS: Record<SlashCommand['category'], string> = {
  type: 'Тип записи',
  date: 'Сроки и даты',
  priority: 'Приоритет задачи',
  ai: 'Искусственный интеллект',
  media: 'Медиа',
  util: 'Утилиты',
};
