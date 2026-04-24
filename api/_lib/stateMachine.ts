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
  | 'pd_address'
  | 'pd_eircode'
  | 'pd_mobile'
  | 'pd_dob'
  | 'pd_email'
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
  'pd_address',
  'pd_document',
  'pd_eircode',
  'pd_mobile',
  'pd_dob',
  'pd_email',
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

export function advanceState(
  current: OnboardingState,
  userMessage: string,
  collected: CollectedData
): { nextState: OnboardingState; collected: CollectedData } {
  const c: CollectedData = { ...collected };
  const msg = userMessage.trim();

  if (current === 'summary_confirmation') {
    const confirmed = /^(yes|yeah|yep|correct|right|confirm|ok|sure|that'?s right)/i.test(msg);
    return {
      nextState: confirmed ? 'pd_name' : 'summary_confirmation',
      collected: c,
    };
  }

  const dataKey = DATA_KEY_BY_STATE[current];
  if (dataKey && msg.length > 0) {
    c[dataKey] = msg;
  }

  const idx = ORDER.indexOf(current);
  const next = idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : current;
  return { nextState: next, collected: c };
}

export function nextStateAfter(state: OnboardingState): OnboardingState {
  const idx = ORDER.indexOf(state);
  return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : state;
}
