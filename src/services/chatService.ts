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
  capturedValue?: string;
}

export const START_SENTINEL = '__start__';

function headersFor(sessionId: string, voice = false): HeadersInit {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-session-id': sessionId,
  };
  if (voice) base['x-session-type'] = 'voice';
  return base;
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
  sessionId: string,
  message: string,
  file?: FileMeta
): Promise<SendResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: headersFor(sessionId),
    body: JSON.stringify(file ? { message, file } : { message }),
  });
  return parseJsonOrThrow<SendResult>(res);
}

export async function getHistory(sessionId: string): Promise<{
  conversation: ConversationSnapshot;
  messages: ChatMessage[];
}> {
  const res = await fetch('/api/history', {
    method: 'GET',
    headers: headersFor(sessionId),
  });
  return parseJsonOrThrow<{
    conversation: ConversationSnapshot;
    messages: ChatMessage[];
  }>(res);
}

export async function sendVoiceMessage(
  sessionId: string,
  message: string,
  file?: FileMeta
): Promise<SendResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: headersFor(sessionId, true),
    body: JSON.stringify(file ? { message, file } : { message }),
  });
  return parseJsonOrThrow<SendResult>(res);
}

export async function getVoiceHistory(sessionId: string): Promise<{
  conversation: ConversationSnapshot;
  messages: ChatMessage[];
}> {
  const res = await fetch('/api/history', {
    method: 'GET',
    headers: headersFor(sessionId, true),
  });
  return parseJsonOrThrow<{
    conversation: ConversationSnapshot;
    messages: ChatMessage[];
  }>(res);
}
