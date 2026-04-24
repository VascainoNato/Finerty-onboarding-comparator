import type { OnboardingState } from './stateMachine';
import { QUESTIONS } from './questions';

export interface ValidationResult {
  ok: boolean;
  hint?: string;
  matchedValue?: string;
}

export function validateAnswer(state: OnboardingState, answer: string): ValidationResult {
  const meta = QUESTIONS[state];
  const v = meta?.validator;
  const trimmed = answer.trim();

  if (!v) return { ok: true, matchedValue: trimmed };

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
