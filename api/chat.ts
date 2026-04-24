import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionId } from './_lib/session';
import { advanceState, nextStateAfter, type OnboardingState, type CollectedData } from './_lib/stateMachine';
import {
  getOrCreateConversation,
  updateConversation,
  appendMessage,
  resetConversation,
  getMessages,
  type Conversation,
  type FileMeta,
} from './_lib/storage';
import {
  generateAcknowledgement,
  generateSummary,
  moderateContent,
  type ModerationCategory,
} from './_lib/openai';
import { QUESTIONS, STUCK_HELP_OPTIONS } from './_lib/questions';
import { validateAnswer } from './_lib/validation';
import {
  ensureSession,
  addTokens,
  completeSession,
  updateType,
  type SessionType,
} from './_lib/sessionStore';

const START_SENTINEL = '__start__';

const GREETING_REPLIES: string[] = [
  "Hi! I'm Fin, the AI assistant at Finerty.",
  "Before we get started, I'd love to learn a bit about you. This will only take a couple of minutes.",
];

const STUCK_REPLIES: string[] = [
  "I want to make sure I understand you well, but we've drifted a bit.",
  'Would you like to start over, or talk to a Finerty specialist?',
];

const SPECIALIST_HANDOFF_REPLY =
  'Thanks for letting me know. A Finerty specialist will be in touch with you by email soon. Have a lovely day.';

function moderationRedirect(category: ModerationCategory): string {
  switch (category) {
    case 'violence':
    case 'self-harm':
    case 'illicit':
      return "I hear you, and I have to be honest — that's not something I can engage with or help you pursue. If you're going through something difficult, please reach out to someone you trust or a local support line. Let's take a step back and try again.";
    case 'sexual':
      return "Let's keep this conversation professional so I can really help you. Could we try that question again?";
    case 'hate':
    case 'harassment':
      return "I'd like to keep our chat respectful. I'm going to move past that one and give you another chance to answer.";
    default:
      return "I don't think I can use that as an answer. Let's try again — you can be honest, just without going down that road.";
  }
}

function questionReply(state: OnboardingState): string | null {
  const q = QUESTIONS[state];
  return q && q.question ? q.question : null;
}

function suggestionsFor(state: OnboardingState): string[] {
  return QUESTIONS[state]?.suggestions ?? [];
}

function completionReplies(collected: CollectedData): string[] {
  const name = (collected.name || '').split(/\s+/)[0];
  const greeting = name ? `Perfect, ${name} — that's everything I needed.` : "Perfect — that's everything I needed.";
  const contact = collected.email ? ` We'll keep in touch at ${collected.email}.` : '';
  const doc = collected.document ? " We've received your document for verification." : '';
  return [greeting + contact + doc + ' Your onboarding is complete.'];
}

async function finaliseSession(sessionId: string, conv: Conversation) {
  const messages = await getMessages(sessionId)
  await completeSession(
    sessionId,
    {
      collectedData: conv.collectedData as Record<string, unknown>,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.file ? { file: m.file } : {}),
      })),
    },
    conv.totalTokensUsed
  )
}

function parseFileInput(raw: unknown): FileMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as { name?: unknown; size?: unknown; type?: unknown };
  if (typeof f.name !== 'string' || f.name.length === 0) return null;
  if (typeof f.size !== 'number' || !Number.isFinite(f.size) || f.size < 0) return null;
  if (typeof f.type !== 'string') return null;
  return {
    name: f.name.slice(0, 200),
    size: f.size,
    type: f.type.slice(0, 100),
  };
}

async function persistTurn(
  sessionId: string,
  rawMessage: string,
  stateAtUser: OnboardingState,
  assistantReplies: string[],
  stateAfter: OnboardingState,
  userFile?: FileMeta
) {
  await appendMessage(sessionId, {
    role: 'user',
    content: rawMessage,
    stateAtTime: stateAtUser,
    createdAt: new Date().toISOString(),
    ...(userFile ? { file: userFile } : {}),
  });
  for (const r of assistantReplies) {
    await appendMessage(sessionId, {
      role: 'assistant',
      content: r,
      stateAtTime: stateAfter,
      createdAt: new Date().toISOString(),
    });
  }
}

async function runStartOver(sessionId: string, res: VercelResponse) {
  const fresh = await resetConversation(sessionId);
  const firstQuestion = questionReply('q1_relax');
  const replies = firstQuestion
    ? [...GREETING_REPLIES, firstQuestion]
    : GREETING_REPLIES;

  for (const r of replies) {
    await appendMessage(sessionId, {
      role: 'assistant',
      content: r,
      stateAtTime: 'q1_relax',
      createdAt: new Date().toISOString(),
    });
  }
  fresh.state = 'q1_relax';
  await updateConversation(fresh);

  return res.status(200).json({
    replies,
    suggestions: suggestionsFor('q1_relax'),
    state: 'q1_relax',
    collectedData: fresh.collectedData,
    isCompleted: false,
    reset: true,
  });
}

async function handleStuckInput(
  conv: Conversation,
  rawMessage: string,
  res: VercelResponse
) {
  const validation = validateAnswer('stuck_offer_help', rawMessage);
  const choice = validation.matchedValue;

  if (choice === 'Start over') {
    return runStartOver(conv.sessionId, res);
  }

  if (choice === 'Talk to a specialist') {
    conv.state = 'specialist_handoff';
    conv.isCompleted = true;
    conv.completedAt = new Date().toISOString();
    conv.consecutiveOffTopic = 0;
    conv.offTopicOnState = undefined;

    const replies = [SPECIALIST_HANDOFF_REPLY];
    await persistTurn(conv.sessionId, rawMessage, 'stuck_offer_help', replies, 'specialist_handoff');
    await updateConversation(conv);
    await finaliseSession(conv.sessionId, conv);

    return res.status(200).json({
      replies,
      suggestions: [],
      state: conv.state,
      collectedData: conv.collectedData,
      isCompleted: true,
    });
  }

  // Invalid choice — re-ask with the same options.
  const replies = ['Please pick one of the options below.'];
  await persistTurn(conv.sessionId, rawMessage, 'stuck_offer_help', replies, 'stuck_offer_help');
  await updateConversation(conv);

  return res.status(200).json({
    replies,
    suggestions: STUCK_HELP_OPTIONS,
    state: conv.state,
    collectedData: conv.collectedData,
    isCompleted: false,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({ error: 'x-session-id header missing or invalid' });
  }

  const body = req.body as { message?: unknown; file?: unknown } | undefined;
  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  const rawFile = parseFileInput(body?.file);

  const rawType = req.headers['x-session-type'];
  const typeHeader = Array.isArray(rawType) ? rawType[0] : rawType;
  const sessionType: SessionType = typeHeader === 'voice' ? 'voice' : 'chat';

  if (!rawMessage) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (rawMessage.length > 2000) {
    return res.status(400).json({ error: 'message too long (max 2000 chars)' });
  }

  const isStart = rawMessage === START_SENTINEL;

  try {
    const conv = await getOrCreateConversation(sessionId);
    await ensureSession(sessionId, sessionType);
    if (sessionType === 'voice') {
      await updateType(sessionId, 'voice');
    }

    if (conv.isCompleted) {
      return res.status(200).json({
        replies: ['Your onboarding is already complete. Thank you!'],
        suggestions: [],
        state: conv.state,
        collectedData: conv.collectedData,
        isCompleted: true,
      });
    }

    // --- GREETING ---
    if (conv.state === 'greeting') {
      if (!isStart) {
        await appendMessage(sessionId, {
          role: 'user',
          content: rawMessage,
          stateAtTime: 'greeting',
          createdAt: new Date().toISOString(),
        });
      }

      const firstQuestion = questionReply('q1_relax');
      const replies = firstQuestion
        ? [...GREETING_REPLIES, firstQuestion]
        : GREETING_REPLIES;

      for (const r of replies) {
        await appendMessage(sessionId, {
          role: 'assistant',
          content: r,
          stateAtTime: 'q1_relax',
          createdAt: new Date().toISOString(),
        });
      }

      conv.state = 'q1_relax';
      await updateConversation(conv);

      return res.status(200).json({
        replies,
        suggestions: suggestionsFor('q1_relax'),
        state: conv.state,
        collectedData: conv.collectedData,
        isCompleted: false,
      });
    }

    // --- Moderation gate ---
    const moderation = await moderateContent(rawMessage);
    if (moderation.flagged && moderation.category) {
      const redirect = moderationRedirect(moderation.category);
      const currentQ = questionReply(conv.state);
      const replies = currentQ ? [redirect, currentQ] : [redirect];

      await persistTurn(sessionId, rawMessage, conv.state, replies, conv.state);
      await updateConversation(conv);

      return res.status(200).json({
        replies,
        suggestions: suggestionsFor(conv.state),
        state: conv.state,
        collectedData: conv.collectedData,
        isCompleted: false,
      });
    }

    // --- Stuck state (user choosing start over / specialist) ---
    if (conv.state === 'stuck_offer_help') {
      return handleStuckInput(conv, rawMessage, res);
    }

    // --- Optional document upload branch (pd_document) ---
    if (conv.state === 'pd_document') {
      const acceptedFile = rawFile;
      const isSkip = /^skip$/i.test(rawMessage);

      if (acceptedFile || isSkip) {
        conv.consecutiveOffTopic = 0;
        conv.offTopicOnState = undefined;

        const collected: CollectedData = acceptedFile
          ? { ...conv.collectedData, document: acceptedFile.name }
          : { ...conv.collectedData };

        const { nextState } = advanceState('pd_document', rawMessage, collected);

        const ackText = acceptedFile
          ? `Got it, I've saved ${acceptedFile.name} for verification.`
          : "No problem, we can move on.";

        let replies: string[] = [ackText];
        let pdTokens = 0;

        if (nextState === 'summary_confirmation') {
          const summary = await generateSummary(collected);
          replies.push(summary.text);
          pdTokens += summary.tokensUsed;
        } else if (nextState === 'completed') {
          replies = completionReplies(collected);
        } else {
          const nextQ = questionReply(nextState);
          if (nextQ) replies.push(nextQ);
        }

        await persistTurn(
          sessionId,
          rawMessage,
          'pd_document',
          replies,
          nextState,
          acceptedFile ?? undefined
        );

        conv.state = nextState;
        conv.collectedData = collected;
        conv.totalTokensUsed += pdTokens;
        if (nextState === 'completed') {
          conv.isCompleted = true;
          conv.completedAt = new Date().toISOString();
        }
        await updateConversation(conv);
        if (pdTokens > 0) await addTokens(sessionId, pdTokens);
        if (conv.isCompleted) await finaliseSession(sessionId, conv);

        return res.status(200).json({
          replies,
          suggestions: suggestionsFor(nextState),
          state: nextState,
          collectedData: collected,
          isCompleted: conv.isCompleted,
        });
      }

      // Neither file nor Skip: off-topic on pd_document.
      const nextCounter = conv.consecutiveOffTopic + 1;

      if (nextCounter >= 2) {
        conv.offTopicOnState = 'pd_document';
        conv.state = 'stuck_offer_help';
        conv.consecutiveOffTopic = nextCounter;

        await persistTurn(sessionId, rawMessage, 'pd_document', STUCK_REPLIES, 'stuck_offer_help');
        await updateConversation(conv);

        return res.status(200).json({
          replies: STUCK_REPLIES,
          suggestions: STUCK_HELP_OPTIONS,
          state: conv.state,
          collectedData: conv.collectedData,
          isCompleted: false,
        });
      }

      conv.consecutiveOffTopic = nextCounter;
      conv.offTopicOnState = 'pd_document';

      const currentQ = questionReply('pd_document');
      const replies: string[] = [
        "I didn't quite catch that — let's stay on this one.",
        'Upload a file or tap Skip.',
      ];
      if (currentQ) replies.push(currentQ);

      await persistTurn(sessionId, rawMessage, 'pd_document', replies, 'pd_document');
      await updateConversation(conv);

      return res.status(200).json({
        replies,
        suggestions: suggestionsFor('pd_document'),
        state: 'pd_document',
        collectedData: conv.collectedData,
        isCompleted: false,
      });
    }

    // --- Validation ---
    const validation = validateAnswer(conv.state, rawMessage);
    if (!validation.ok) {
      const nextCounter = conv.consecutiveOffTopic + 1;

      if (nextCounter >= 2) {
        // Transition to stuck_offer_help
        conv.offTopicOnState = conv.state;
        conv.state = 'stuck_offer_help';
        conv.consecutiveOffTopic = nextCounter;

        await persistTurn(sessionId, rawMessage, conv.offTopicOnState, STUCK_REPLIES, 'stuck_offer_help');
        await updateConversation(conv);

        return res.status(200).json({
          replies: STUCK_REPLIES,
          suggestions: STUCK_HELP_OPTIONS,
          state: conv.state,
          collectedData: conv.collectedData,
          isCompleted: false,
        });
      }

      // First off-topic — repeat the question with a nudge
      conv.consecutiveOffTopic = nextCounter;
      conv.offTopicOnState = conv.state;

      const currentQ = questionReply(conv.state);
      const replies: string[] = ["I didn't quite catch that — let's stay on this one."];
      if (validation.hint) replies.push(validation.hint);
      if (currentQ) replies.push(currentQ);

      await persistTurn(sessionId, rawMessage, conv.state, replies, conv.state);
      await updateConversation(conv);

      return res.status(200).json({
        replies,
        suggestions: suggestionsFor(conv.state),
        state: conv.state,
        collectedData: conv.collectedData,
        isCompleted: false,
      });
    }

    // --- Valid answer: reset counter and advance ---
    conv.consecutiveOffTopic = 0;
    conv.offTopicOnState = undefined;

    const normalized = validation.matchedValue || rawMessage;
    let { nextState, collected } = advanceState(conv.state, normalized, conv.collectedData);
    // Voice não tem UI de upload: pula o passo opcional de documento.
    if (sessionType === 'voice' && nextState === 'pd_document') {
      nextState = nextStateAfter('pd_document');
    }

    const stateQuestion = QUESTIONS[conv.state]?.question || 'this question';
    const ack = await generateAcknowledgement(stateQuestion, normalized);

    let replies: string[] = [ack.text];
    let totalTokens = ack.tokensUsed;

    if (nextState === 'summary_confirmation') {
      const summary = await generateSummary(collected);
      replies.push(summary.text);
      totalTokens += summary.tokensUsed;
    } else if (nextState === 'completed') {
      replies = completionReplies(collected);
    } else {
      const nextQ = questionReply(nextState);
      if (nextQ) replies.push(nextQ);
    }

    await persistTurn(sessionId, rawMessage, conv.state, replies, nextState);

    conv.state = nextState;
    conv.collectedData = collected;
    conv.totalTokensUsed += totalTokens;
    if (nextState === 'completed') {
      conv.isCompleted = true;
      conv.completedAt = new Date().toISOString();
    }
    await updateConversation(conv);
    if (totalTokens > 0) await addTokens(sessionId, totalTokens);
    if (conv.isCompleted) await finaliseSession(sessionId, conv);

    return res.status(200).json({
      replies,
      suggestions: suggestionsFor(nextState),
      state: nextState,
      collectedData: collected,
      isCompleted: conv.isCompleted,
    });
  } catch (err) {
    console.error('chat handler error', err);
    return res.status(500).json({ error: 'Error processing message' });
  }
}
