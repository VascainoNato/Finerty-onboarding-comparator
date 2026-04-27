export type OnboardingState =
  | 'greeting'
  | 'q1_relax'
  | 'q2_hobbies'
  | 'q3_dream'
  | 'q4_dream_plan'
  | 'q5_morning'
  | 'q6_change'
  | 'q7_consequences'
  | 'summary_confirmation'
  | 'pd_name'
  | 'pd_name_confirm'
  | 'pd_address'
  | 'pd_address_confirm'
  | 'pd_eircode'
  | 'pd_eircode_confirm'
  | 'pd_mobile'
  | 'pd_mobile_confirm'
  | 'pd_dob'
  | 'pd_dob_confirm'
  | 'pd_email'
  | 'pd_email_confirm'
  | 'pd_civil_status'
  | 'pd_document'
  | 'stuck_offer_help'
  | 'specialist_handoff'
  | 'completed';

export interface CollectedData {
  // life Qs
  relax?: string;
  hobbies?: string;
  dream?: string;
  dreamPlan?: string;
  morning?: string;
  change?: string;
  consequences?: string;
  // personal details
  name?: string;
  address?: string;
  eircode?: string;
  mobile?: string;
  dob?: string;
  email?: string;
  civilStatus?: string;
  document?: string;
}

type SessionType = 'voice' | 'chat';

const ORDER: OnboardingState[] = [
  'greeting',
  'q1_relax',
  'q2_hobbies',
  'q3_dream',
  'q4_dream_plan',
  'q5_morning',
  'q6_change',
  'q7_consequences',
  'summary_confirmation',
  'pd_name',
  'pd_name_confirm',
  'pd_address',
  'pd_address_confirm',
  'pd_document',
  'pd_eircode',
  'pd_eircode_confirm',
  'pd_mobile',
  'pd_mobile_confirm',
  'pd_dob',
  'pd_dob_confirm',
  'pd_email',
  'pd_email_confirm',
  'pd_civil_status',
  'completed',
];

const DATA_KEY_BY_STATE: Partial<Record<OnboardingState, keyof CollectedData>> = {
  q1_relax: 'relax',
  q2_hobbies: 'hobbies',
  q3_dream: 'dream',
  q4_dream_plan: 'dreamPlan',
  q5_morning: 'morning',
  q6_change: 'change',
  q7_consequences: 'consequences',
  pd_name: 'name',
  pd_address: 'address',
  pd_eircode: 'eircode',
  pd_mobile: 'mobile',
  pd_dob: 'dob',
  pd_email: 'email',
  pd_civil_status: 'civilStatus',
};

const CONFIRM_TO_CAPTURE: Partial<Record<OnboardingState, OnboardingState>> = {
  pd_name_confirm: 'pd_name',
  pd_address_confirm: 'pd_address',
  pd_eircode_confirm: 'pd_eircode',
  pd_mobile_confirm: 'pd_mobile',
  pd_dob_confirm: 'pd_dob',
  pd_email_confirm: 'pd_email',
};

const AFFIRMATIVE_RE = /^(yes|yeah|yep|yup|correct|right|confirm|ok(ay)?|sure|that'?s right)\b/i;
const REJECT_RE = /^(no|nope|edit|change|wrong|fix|incorrect)\b/i;

export function isConfirmState(state: OnboardingState): boolean {
  return state in CONFIRM_TO_CAPTURE;
}

export function captureStateForConfirm(state: OnboardingState): OnboardingState | undefined {
  return CONFIRM_TO_CAPTURE[state];
}

export function normalizeForStorage(
  state: OnboardingState,
  value: string,
  sessionType: SessionType
): string {
  const trimmed = value.trim();
  if (sessionType !== 'voice') return trimmed;

  switch (state) {
    case 'pd_eircode': {
      const compact = trimmed.replace(/\s+/g, '').toUpperCase();
      if (compact.length === 7) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
      return compact;
    }
    case 'pd_mobile': {
      const hasPlus = trimmed.startsWith('+');
      const digits = trimmed.replace(/\D/g, '');
      return (hasPlus ? '+' : '') + digits;
    }
    case 'pd_dob': {
      return trimmed
        .replace(/\b(of|de)\b/gi, '/')
        .replace(/[.\-]/g, '/')
        .replace(/\s+/g, '');
    }
    case 'pd_email': {
      return trimmed.replace(/\s+/g, '').toLowerCase();
    }
    default:
      return trimmed;
  }
}

function nextNonSkippedFrom(idx: number, sessionType: SessionType): OnboardingState {
  for (let i = idx + 1; i < ORDER.length; i++) {
    const s = ORDER[i];
    if (sessionType !== 'voice' && isConfirmState(s)) continue;
    return s;
  }
  return ORDER[ORDER.length - 1];
}

export function advanceState(
  current: OnboardingState,
  userMessage: string,
  collected: CollectedData,
  sessionType: SessionType = 'chat'
): { nextState: OnboardingState; collected: CollectedData; capturedValue?: string } {
  const c: CollectedData = { ...collected };
  const msg = userMessage.trim();

  if (current === 'summary_confirmation') {
    const confirmed = /^(yes|yeah|yep|correct|right|confirm|ok|sure|that'?s right)/i.test(msg);
    return {
      nextState: confirmed ? 'pd_name' : 'summary_confirmation',
      collected: c,
    };
  }

  const sourceState = CONFIRM_TO_CAPTURE[current];
  if (sourceState) {
    const dataKey = DATA_KEY_BY_STATE[sourceState];

    if (AFFIRMATIVE_RE.test(msg)) {
      const idx = ORDER.indexOf(current);
      const next = idx >= 0 ? nextNonSkippedFrom(idx, sessionType) : current;
      return {
        nextState: next,
        collected: c,
        capturedValue: dataKey ? c[dataKey] : undefined,
      };
    }

    if (REJECT_RE.test(msg)) {
      if (dataKey) c[dataKey] = undefined;
      return { nextState: sourceState, collected: c };
    }

    if (dataKey && msg.length > 0) {
      c[dataKey] = normalizeForStorage(sourceState, msg, sessionType);
    }
    return {
      nextState: current,
      collected: c,
      capturedValue: dataKey ? c[dataKey] : undefined,
    };
  }

  const dataKey = DATA_KEY_BY_STATE[current];
  let captured: string | undefined;
  if (dataKey && msg.length > 0) {
    const normalized = normalizeForStorage(current, msg, sessionType);
    c[dataKey] = normalized;
    captured = normalized;
  }

  const idx = ORDER.indexOf(current);
  const next = idx >= 0 ? nextNonSkippedFrom(idx, sessionType) : current;
  return { nextState: next, collected: c, capturedValue: captured };
}

export function nextStateAfter(
  state: OnboardingState,
  sessionType: SessionType = 'chat'
): OnboardingState {
  const idx = ORDER.indexOf(state);
  return idx >= 0 ? nextNonSkippedFrom(idx, sessionType) : state;
}
