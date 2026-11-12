import { useCallback, useEffect, useState } from 'react';
import type { AiSettings, ChatMessage, FolderMeta, SlagItem } from '../../types';
import { AI_ENDPOINTS, DEFAULT_AI_MODELS, STORAGE_KEYS } from '../../config';
import { storage } from '../../lib/storage';
import { sendAssistantChat } from '../../lib/ai/aiService';

const AI_SETTINGS_KEY = STORAGE_KEYS.AI_SETTINGS;

const DEFAULT_AI_SETTINGS: AiSettings = {
  sourceMode: 'subscription',
  subscriptionModel: 'fast',
  provider: 'groq',
  groqApiKey: '',
  kieApiKey: '',
  kieBaseUrl: AI_ENDPOINTS.DEFAULT_KIE_BASE_URL,
  geminiApiKey: '',
  model: DEFAULT_AI_MODELS.GROQ_DEFAULT,
  reasoningEffort: 'low',
  autoTagging: true,
  autoTriage: true,
  webSearchEnabled: false,
  maxTagsPerNote: 3,
  allowNewTags: true,
  tagCaseStyle: 'lowercase',
};

/**
 * The assistant session: the transcript, the model it talks to, and one send.
 *
 * One reason to change — the chat protocol. It reads the vault (folder, folders,
 * records) only to hand it to the model, and it never writes a note itself: when
 * the model proposes an action, that comes back as a card for the caller to run.
 */
export function useAssistant(
  currentFolder: string,
  folders: FolderMeta[],
  items: SlagItem[],
  applyAiFilter: (itemIds: string[], queryLabel: string) => void,
) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => storage.getAssistantHistory());
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      const saved = localStorage.getItem(AI_SETTINGS_KEY);
      return saved ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) } : DEFAULT_AI_SETTINGS;
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  });

  // The transcript is vault state, not component state: it survives a reload.
  useEffect(() => {
    storage.saveAssistantHistory(chatMessages);
  }, [chatMessages]);

  const sendChatMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: userText.trim(),
      createdAt: Date.now(),
    };

    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setIsChatLoading(true);

    try {
      const response = await sendAssistantChat({
        messages: newHistory.map((m) => {
          let content = m.content || '';
          const actionItems = m.suggestedActions || (m.suggestedAction ? [m.suggestedAction] : []);
          if (!content.trim() || content.startsWith('[Подготовлен черновик')) {
            if (actionItems.length > 0) {
              content = actionItems.map((sa) => `[Подготовлено действие: «${sa.title}»]`).join('\n');
            }
          }
          return { role: m.role, content: content.trim() || '[Сообщение]' };
        }),
        currentFolder,
        settings: aiSettings,
        folders,
        allItems: items,
      });

      if (response.feedFilter) {
        applyAiFilter(response.feedFilter.itemIds, response.feedFilter.queryLabel);
      }

      let resolvedContent = response.content;
      if (!resolvedContent.trim() && response.suggestedAction) {
        resolvedContent = `[Подготовлен черновик ${response.suggestedAction.itemType || 'note'}: «${response.suggestedAction.title}»:\n${response.suggestedAction.content || ''}]`;
      }

      const assistantMsg: ChatMessage = {
        id: 'msg_res_' + Date.now(),
        role: 'assistant',
        content: resolvedContent,
        createdAt: Date.now(),
        reasoning: response.reasoning,
        reasoningTimeMs: response.reasoningTimeMs,
        toolCalls: response.toolCalls,
        suggestedAction: response.suggestedAction,
        suggestedActions: response.suggestedActions,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        content: `Ошибка обращения к ИИ: ${err.message || 'Сбой сети'}`,
        createdAt: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatMessages, currentFolder, aiSettings, folders, items, applyAiFilter]);

  const clearChatMessages = useCallback(() => {
    storage.clearAssistantHistory();
    setChatMessages([]);
  }, []);

  return {
    chatMessages,
    setChatMessages,
    isChatLoading,
    aiSettings,
    setAiSettings,
    sendChatMessage,
    clearChatMessages,
  };
}
