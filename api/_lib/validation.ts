import type { OnboardingState } from './stateMachine.js';
import { QUESTIONS } from './questions.js';

export interface ValidationResult {
  ok: boolean;
  hint?: string;
  matchedValue?: string;
}

type SessionType = 'voice' | 'chat';

const VOICE_LENIENT_STATES = new Set<OnboardingState>([
  'pd_eircode',
  'pd_mobile',
  'pd_dob',
  'pd_email',
]);

export function validateAnswer(
  state: OnboardingState,
  answer: string,
  sessionType: SessionType = 'chat'
): ValidationResult {
  const meta = QUESTIONS[state];
  const v = meta?.validator;
  const trimmed = answer.trim();

  if (!v) return { ok: true, matchedValue: trimmed };

  if (sessionType === 'voice' && VOICE_LENIENT_STATES.has(state)) {
    return trimmed.length >= 1
      ? { ok: true, matchedValue: trimmed }
      : { ok: false, hint: 'I didn’t catch that — could you say it again?' };
  }

  switch (v.type) {
    case 'minLength':
      return trimmed.length >= v.min
        ? { ok: true, matchedValue: trimmed }
        : { ok: false, hint: 'Could you tell me a bit more?' };

    case 'regex':
      return v.pattern.test(trimmed)
        ? { ok: true, matchedValue: trimmed }
        : { ok: false, hint: `Try something like: ${v.example}` };

    case 'oneOf': {
      const match = v.allowed.find(
        (a) => a.toLowerCase() === trimmed.toLowerCase()
      );
      return match
        ? { ok: true, matchedValue: match }
        : {
            ok: false,
            hint: `Please choose one of: ${v.allowed.join(', ')}`,
          };
    }

    default:
      return { ok: true, matchedValue: trimmed };
  }
}
