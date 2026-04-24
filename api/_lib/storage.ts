import type { OnboardingState, CollectedData } from './stateMachine';

export interface Conversation {
  sessionId: string;
  state: OnboardingState;
  collectedData: CollectedData;
  isCompleted: boolean;
  totalTokensUsed: number;
  startedAt: string;
  completedAt?: string;
  consecutiveOffTopic: number;
  offTopicOnState?: OnboardingState;
}

export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

export interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  stateAtTime: OnboardingState;
  tokensUsed?: number;
  createdAt: string;
  file?: FileMeta;
}

// In-memory storage. Data is lost when the dev server restarts — fine for local
// testing. Swap for Upstash/Postgres before production.
const conversations = new Map<string, Conversation>();
const messagesBySession = new Map<string, StoredMessage[]>();

export async function getOrCreateConversation(sessionId: string): Promise<Conversation> {
  const existing = conversations.get(sessionId);
  if (existing) return existing;

  const conv: Conversation = {
    sessionId,
    state: 'greeting',
    collectedData: {},
    isCompleted: false,
    totalTokensUsed: 0,
    startedAt: new Date().toISOString(),
    consecutiveOffTopic: 0,
  };
  conversations.set(sessionId, conv);
  return conv;
}

export async function getConversationIfExists(
  sessionId: string
): Promise<Conversation | null> {
  return conversations.get(sessionId) ?? null;
}

export async function resetConversation(sessionId: string): Promise<Conversation> {
  conversations.delete(sessionId);
  messagesBySession.delete(sessionId);
  return getOrCreateConversation(sessionId);
}

export async function updateConversation(conv: Conversation): Promise<void> {
  conversations.set(conv.sessionId, conv);
}

export async function appendMessage(
  sessionId: string,
  message: StoredMessage
): Promise<void> {
  const list = messagesBySession.get(sessionId) ?? [];
  list.push(message);
  messagesBySession.set(sessionId, list);
}

export async function getMessages(
  sessionId: string,
  limit?: number
): Promise<StoredMessage[]> {
  const list = messagesBySession.get(sessionId) ?? [];
  if (limit && list.length > limit) {
    return list.slice(list.length - limit);
  }
  return list;
}
