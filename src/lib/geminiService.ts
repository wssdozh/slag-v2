import type { SlagItem, FolderMeta, AiSettings } from '../types';
import { storage } from './storage';

/**
 * Intelligent AI tagging service with tag taxonomy indexing.
 */
export async function generateSmartTags(content: string, settings: AiSettings): Promise<string[]> {
  const existingTags = storage.getAllExistingTags();

  // If Gemini API Key is available, use Gemini Flash for sub-second accurate tagging
  if (settings.geminiApiKey) {
    try {
      const model = settings.model || 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;

      const prompt = `
Ты — ИИ-модуль тегирования для персональной базы знаний и заметок.
Твоя задача — подобрать от 1 до 4 точных тегов на русском или английском языке для текста заметки.

ВАЖНЫЕ ПРАВИЛА ТАКСОНОМИИ:
1. Вот список уже существующих тегов в хранилище пользователя:
[${existingTags.join(', ')}]
2. В ПЕРВУЮ ОЧЕРЕДЬ выбери релевантные теги из существующего списка, чтобы не создавать синонимы и дубликаты.
3. Если в тексте есть новая уникальная тема, которой нет в списке существующих, добавь 1 точный новый тег.
4. Ответь ИСКЛЮЧИТЕЛЬНО валидным JSON-массивом строк без markdown-форматирования и без символа '#'. Пример: ["дизайн", "архитектура"]

Текст заметки:
${content.slice(0, 1500)}
`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return parsed.map(t => String(t).toLowerCase().replace(/^#/, '').trim()).filter(Boolean);
          }
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, using heuristic tagger:', err);
    }
  }

  // Fallback Local Heuristic Tagger (when offline or without API key)
  const lowerContent = content.toLowerCase();
  const matchedExisting = existingTags.filter(t => {
    return lowerContent.includes(t.toLowerCase());
  });

  if (matchedExisting.length > 0) {
    return matchedExisting.slice(0, 3);
  }

  // Common heuristics
  const heuristicTags: string[] = [];
  if (lowerContent.includes('купить') || lowerContent.includes('магазин') || lowerContent.includes('руб')) {
    heuristicTags.push('покупки');
  }
  if (lowerContent.includes('код') || lowerContent.includes('api') || lowerContent.includes('react') || lowerContent.includes('bug')) {
    heuristicTags.push('разработка');
  }
  if (lowerContent.includes('идея') || lowerContent.includes('стартап') || lowerContent.includes('фича')) {
    heuristicTags.push('идеи');
  }
  if (lowerContent.includes('сделать') || lowerContent.includes('задача') || lowerContent.includes('дедлайн')) {
    heuristicTags.push('задачи');
  }

  return heuristicTags.length > 0 ? heuristicTags : ['заметка'];
}

export interface TriageSuggestion {
  itemId: string;
  itemTitle: string;
  targetFolder: string;
  reason: string;
}

/**
 * Intelligent Inbox Triage: inspects notes in "Входящие" and matches them to folders by folder descriptions.
 */
export async function triageInboxItems(
  inboxItems: SlagItem[],
  folders: FolderMeta[],
  settings: AiSettings
): Promise<TriageSuggestion[]> {
  const eligibleFolders = folders.filter(f => f.path !== 'Входящие');
  if (inboxItems.length === 0 || eligibleFolders.length === 0) {
    return [];
  }

  if (settings.geminiApiKey) {
    try {
      const model = settings.model || 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;

      const foldersContext = eligibleFolders.map(f => ({
        path: f.path,
        name: f.name,
        description: f.description || 'Общие заметки этой темы',
      }));

      const itemsContext = inboxItems.map(it => ({
        id: it.id,
        title: it.title,
        content: it.content.slice(0, 300),
        tags: it.tags,
        type: it.type,
      }));

      const prompt = `
Ты — интеллектуальный диспетчер сортировки заметок (AI Triage).
Твоя задача — проанализировать неразобранные заметки из папки "Входящие" и определить, в какую из существующих папок их переместить, основываясь на описаниях папок.

СПИСОК ДОСТУПНЫХ ПАПОК И ИХ ОПИСАНИЙ:
${JSON.stringify(foldersContext, null, 2)}

НЕРАЗОБРАННЫЕ ЗАМЕТКИ:
${JSON.stringify(itemsContext, null, 2)}

ПРАВИЛА:
1. Выбери для каждой заметки наиболее подходящую папку по смыслу (targetFolder должен в точности совпадать с полем path одной из доступных папок).
2. Напиши краткую причину на русском языке (поле reason, 5-8 слов).
3. Верни ТОЛЬКО JSON-массив объектов: [{ "itemId": "...", "targetFolder": "...", "reason": "..." }]
`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const suggestions: TriageSuggestion[] = JSON.parse(text);
          return suggestions.map(s => {
            const item = inboxItems.find(i => i.id === s.itemId);
            return {
              ...s,
              itemTitle: item?.title || 'Без названия',
            };
          });
        }
      }
    } catch (err) {
      console.warn('Gemini Triage API failed, fallback to local matching:', err);
    }
  }

  // Fallback Local Matcher based on folder keywords in title/content/tags
  return inboxItems.map(item => {
    let bestFolder = eligibleFolders[0];
    let bestScore = 0;
    const textToMatch = `${item.title} ${item.content} ${item.tags.join(' ')}`.toLowerCase();

    eligibleFolders.forEach(folder => {
      let score = 0;
      const folderTerms = `${folder.name} ${folder.description}`.toLowerCase().split(/\s+/);
      folderTerms.forEach(term => {
        if (term.length > 3 && textToMatch.includes(term)) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        bestFolder = folder;
      }
    });

    return {
      itemId: item.id,
      itemTitle: item.title,
      targetFolder: bestFolder.path,
      reason: bestScore > 0 ? `Совпадение по ключевым словам папки «${bestFolder.name}»` : `Предложено в «${bestFolder.name}»`,
    };
  });
}
