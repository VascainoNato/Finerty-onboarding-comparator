import type { OnboardingState } from './stateMachine.js';

export type Validator =
  | { type: 'minLength'; min: number }
  | { type: 'regex'; pattern: RegExp; example: string }
  | { type: 'oneOf'; allowed: string[] };

export interface QuestionMeta {
  question: string;
  suggestions: string[];
  validator?: Validator;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EIRCODE_RE = /^[A-Za-z]\d{2}\s?[A-Za-z0-9]{4}$/;
const MOBILE_RE = /^\+?[\d][\d\s\-()]{6,17}$/;
const DOB_RE = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/;

export const CIVIL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Civil partnership',
  'Divorced',
  'Widowed',
];

export const STUCK_HELP_OPTIONS = ['Start over', 'Talk to a specialist'];

export const QUESTIONS: Partial<Record<OnboardingState, QuestionMeta>> = {
  q1_relax: {
    question: 'What do you like to do to relax and enjoy yourself?',
    suggestions: ['Reading', 'Exercising', 'Listening to music', 'Watching movies'],
    validator: { type: 'minLength', min: 2 },
  },
  q2_hobbies: {
    question: 'What are your favourite hobbies or pastimes?',
    suggestions: ['Photography', 'Cooking', 'Travelling', 'Gaming'],
    validator: { type: 'minLength', min: 2 },
  },
  q3_dream: {
    question:
      'What is your one big dream or goal, and do you realistically want to achieve it?',
    suggestions: [
      'Start my own business',
      'Grow in my career',
      'Travel the world',
      'Find work-life balance',
    ],
    validator: { type: 'minLength', min: 2 },
  },
  q4_dream_plan: {
    question: 'What do you think you need to do to make it a reality?',
    suggestions: [
      'Build a plan',
      'Learn new skills',
      'Save more money',
      'Find a mentor',
    ],
    validator: { type: 'minLength', min: 2 },
  },
  q5_morning: {
    question:
      'What makes you get up in the morning and keep doing what you do?',
    suggestions: ['Family', 'Career growth', 'Passion for my work', 'Personal goals'],
    validator: { type: 'minLength', min: 2 },
  },
  q6_change: {
    question: 'If you could change one thing in your life, what would that be?',
    suggestions: [
      'More free time',
      'Better health habits',
      'A career switch',
      'Living somewhere else',
    ],
    validator: { type: 'minLength', min: 2 },
  },
  q7_consequences: {
    question:
      'What do you need to do to change this one thing, and what consequences might come with it?',
    suggestions: [],
    validator: { type: 'minLength', min: 2 },
  },
  summary_confirmation: {
    question: '',
    suggestions: ['Yes, that’s right', 'Let me clarify'],
  },
  pd_name: {
    question: 'Great, now for your personal details. What is your full name?',
    suggestions: [],
    validator: { type: 'minLength', min: 2 },
  },
  pd_address: {
    question: 'What is your home address?',
    suggestions: [],
    validator: { type: 'minLength', min: 5 },
  },
  pd_eircode: {
    question: 'What is your Eircode? (for example: A65 F4E2)',
    suggestions: [],
    validator: { type: 'regex', pattern: EIRCODE_RE, example: 'A65 F4E2' },
  },
  pd_mobile: {
    question: 'What is your mobile number? (for example: +353 87 123 4567)',
    suggestions: [],
    validator: { type: 'regex', pattern: MOBILE_RE, example: '+353 87 123 4567' },
  },
  pd_dob: {
    question: 'What is your date of birth? (DD/MM/YYYY)',
    suggestions: [],
    validator: { type: 'regex', pattern: DOB_RE, example: '14/03/1990' },
  },
  pd_email: {
    question: 'What email can we reach you at?',
    suggestions: [],
    validator: { type: 'regex', pattern: EMAIL_RE, example: 'you@example.com' },
  },
  pd_civil_status: {
    question: 'What is your civil status?',
    suggestions: CIVIL_STATUS_OPTIONS,
    validator: { type: 'oneOf', allowed: CIVIL_STATUS_OPTIONS },
  },
  pd_name_confirm: {
    question: 'I heard "{value}". Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_address_confirm: {
    question: 'I heard "{value}". Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_eircode_confirm: {
    question: 'I heard "{value}" for your Eircode. Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_mobile_confirm: {
    question: 'I heard "{value}" for your mobile number. Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_dob_confirm: {
    question: 'I heard "{value}" for your date of birth. Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_email_confirm: {
    question: 'I heard "{value}" for your email. Is that right? Say yes, or just say the correction.',
    suggestions: ['Yes', 'Edit'],
  },
  pd_document: {
    question:
      "Great. If you'd like, you can upload a recent proof of address — a utility bill, bank statement, or lease works. Otherwise just tap Skip to continue.",
    suggestions: ['Skip'],
    // No validator — chat handler checks file presence OR Skip match.
  },
  stuck_offer_help: {
    question: 'Would you like to start over, or talk to a Finerty specialist?',
    suggestions: STUCK_HELP_OPTIONS,
    validator: { type: 'oneOf', allowed: STUCK_HELP_OPTIONS },
  },
};
