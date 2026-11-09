export const AI_ENDPOINTS = {
  DEFAULT_KIE_BASE_URL: 'https://api.kie.ai',
  DEFAULT_GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
  DEFAULT_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
} as const;

export const DEFAULT_AI_MODELS = {
  // KIE serves chat models through the OpenAI Responses protocol; the subscription
  // gateway pins every tier to the one model we actually pay for.
  SUBSCRIPTION_TIERS: {
    fast: 'deepseek-v4-1-flash',
    smart: 'deepseek-v4-1-flash',
    deep: 'deepseek-v4-1-flash',
  },
  GROQ_DEFAULT: 'openai/gpt-oss-120b',
  KIE_DEFAULT: 'deepseek-v4-1-flash',
  GEMINI_DEFAULT: 'gemini-2.0-flash',
  WHISPER_DEFAULT: 'whisper-large-v3-turbo',
  // The one image model this Groq organisation actually serves. `qwen-3.8-27b` without the
  // vendor prefix used to sit here as a "fallback" and answered 404 on every picture.
  GROQ_VISION_CANDIDATES: ['qwen/qwen3.8-27b'] as const,
} as const;

export const SUBSCRIPTION_TIER_EFFORT = {
  fast: 'none',
  smart: 'low',
  deep: 'high',
} as const;

export const AI_LIMITS = {
  MAX_TOOL_ROUNDS: 3,
  SEARCH_RESULTS_DEFAULT: 5,
  SEARCH_RESULTS_MAX: 15,
  TEXT_SNIPPET_LENGTH: 140,
  ATTACHMENT_SNIPPET_LENGTH: 100,
  FOCAL_CONTEXT_MAX_CHARS: 160,
  IMAGE_DOWNSCALE_MAX_DIM: 1024,
  IMAGE_MAX_PAYLOAD_BYTES: 400000,
  IMAGE_JPEG_QUALITY: 0.85,
  FILE_SAMPLE_MAX_BYTES: 4096,
  FILE_SAMPLE_SLICE_CHARS: 2500,
  SUMMARY_FALLBACK_CHARS: 100,
} as const;

export const AI_STOP_TAGS = new Set([
  'заметка',
  'заметки',
  'note',
  'notes',
  'таска',
  'таски',
  'задача',
  'задачи',
  'task',
  'tasks',
  'статья',
  'статьи',
  'article',
  'articles',
  'аудио',
  'audio',
  'голос',
  'голосовая-заметка',
  'голосовая заметка',
  'фото',
  'изображение',
  'картинка',
  'image',
  'файл',
  'file',
]);

export const AI_CATEGORY_KEYWORDS: Record<string, string[]> = {
  разработка: ['разработ', 'код', 'code', 'программ', 'дев', 'dev', 'спецификац', 'архитектур'],
  геймдев: ['геймдев', 'game', 'игра', 'геймдизайн', 'unity', 'unreal', 'godot'],
  архитектура: ['архитектур', 'модул', 'рефактор', 'паттерн', 'solid'],
  frontend: ['фронтенд', 'frontend', 'react', 'vite', 'tailwind', 'css', 'ui'],
  backend: ['бэкенд', 'backend', 'api', 'node', 'server', 'база данных', 'sql'],
  задачи: ['задач', 'таск', 'дедлайн', 'план', 'сделать'],
  идеи: ['идея', 'мысль', 'инсайт', 'концепт', 'гипотеза'],
  фильмы: ['фильм', 'кино', 'movie', 'cinema', 'режиссер'],
  сериалы: ['сериал', 'эпизод', 'сезон', 'series'],
  книги: ['книг', 'book', 'автор', 'роман', 'повест'],
  музыка: ['музык', 'трек', 'альбом', 'song', 'music', 'плейлист'],
};
