const SESSION_KEY = 'fin.sessionId';
const VOICE_SESSION_KEY = 'fin.voiceSessionId';

function getOrCreateSessionIdFor(key: string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function getOrCreateSessionId(): string {
  return getOrCreateSessionIdFor(SESSION_KEY);
}

function getOrCreateVoiceSessionId(): string {
  return getOrCreateSessionIdFor(VOICE_SESSION_KEY);
}

export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  file?: FileMeta;
}

export interface ConversationSnapshot {
  sessionId: string;
  state: string;
  collectedData: Record<string, unknown>;
  isCompleted: boolean;
  totalTokensUsed: number;
  startedAt: string;
  completedAt?: string;
}

export interface SendResult {
  replies: string[];
  suggestions: string[];
  state: string;
  collectedData: Record<string, unknown>;
  isCompleted: boolean;
  reset?: boolean;
}

export const START_SENTINEL = '__start__';

function headersFor(sessionId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-session-id': sessionId,
  };
}

function authHeaders(): HeadersInit {
  return headersFor(getOrCreateSessionId());
}

function voiceHeaders(): HeadersInit {
  return {
    ...headersFor(getOrCreateVoiceSessionId()),
    'x-session-type': 'voice',
  };
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `API indisponível (status ${res.status}). As serverless functions não estão respondendo — rode \`vercel dev\` para testar localmente, ou faça deploy na Vercel.`
    );
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function sendMessage(
  message: string,
  file?: FileMeta
): Promise<SendResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(file ? { message, file } : { message }),
  });
  return parseJsonOrThrow<SendResult>(res);
}

export async function getHistory(): Promise<{
  conversation: ConversationSnapshot;
  messages: ChatMessage[];
}> {
  const res = await fetch('/api/history', {
    method: 'GET',
    headers: authHeaders(),
  });
  return parseJsonOrThrow<{
    conversation: ConversationSnapshot;
    messages: ChatMessage[];
  }>(res);
}

export function resetSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function sendVoiceMessage(
  message: string,
  file?: FileMeta
): Promise<SendResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: voiceHeaders(),
    body: JSON.stringify(file ? { message, file } : { message }),
  });
  return parseJsonOrThrow<SendResult>(res);
}

export async function getVoiceHistory(): Promise<{
  conversation: ConversationSnapshot;
  messages: ChatMessage[];
}> {
  const res = await fetch('/api/history', {
    method: 'GET',
    headers: voiceHeaders(),
  });
  return parseJsonOrThrow<{
    conversation: ConversationSnapshot;
    messages: ChatMessage[];
  }>(res);
}

export function resetVoiceSession(): void {
  localStorage.removeItem(VOICE_SESSION_KEY);
}
