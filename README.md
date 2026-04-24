# Fin — Finerty AI Onboarding

A research playground that showcases three different ways to onboard a new user for the
**Finerty** platform, all powered by the same backend:

1. **Onboarding with IA — Messages** — a conversational text chat with Fin, Finerty's AI
   assistant. State-machine driven, with LLM-generated acknowledgements, content
   moderation, off-topic detection, and optional document upload.
2. **Onboarding with IA — Voice** — a hands-free spoken version of the same flow. Voice
   activity detection + Azure Speech-to-Text for the user, Web Speech API
   (`speechSynthesis`) for Fin speaking back.
3. **Traditional Onboarding** — a two-phase stepwise form for users who prefer the classic
   wizard experience. No AI, same questions.

All three produce a **session** that is persisted on disk and can be reviewed in
**Saved Informations** (full transcript + captured data) and **IA Cost** (tokens and
approximate cost per session).

The project is a deliberately small, self-contained app built to compare onboarding
modalities side by side on top of a shared state machine.

---

## Tech stack

| Layer | Tech |
|------|------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Backend | Vercel Serverless Functions (local dev via Express) |
| AI (text) | OpenAI `gpt-4o-mini` — chat completions + `omni-moderation-latest` |
| Speech-to-Text | Azure Speech Services (Real-time REST, F0 tier) |
| Text-to-Speech | Browser native `window.speechSynthesis` |
| Storage | In-memory `Map` for conversations, JSON file on disk for the session registry |
| Tooling | `tsx`, `concurrently`, `dotenv-cli`, `@vercel/node` |

There is **no database server to run**. The session registry persists to
`server/data/sessions.json` (auto-created on first write). Good enough for local testing
and the MVP. For production on Vercel, swap the JSON store for Upstash Redis or Vercel
Postgres — the internal API in [api/_lib/sessionStore.ts](api/_lib/sessionStore.ts) is
intentionally narrow to make the swap trivial.

---

## Project structure

```
project/
├── api/                            Serverless functions (Vercel-style handlers)
│   ├── _lib/
│   │   ├── prompts/                Fin persona + modular system prompts
│   │   │   ├── persona.ts
│   │   │   ├── contextoOnboarding.ts
│   │   │   └── formatoResposta.ts
│   │   ├── openai.ts               OpenAI client + moderation + ack/summary helpers
│   │   ├── storage.ts              In-memory conversations/messages store
│   │   ├── sessionStore.ts         JSON-file-backed session registry
│   │   ├── stateMachine.ts         Onboarding state transitions and data shape
│   │   ├── questions.ts            Hardcoded questions + suggestions + validators
│   │   ├── validation.ts           Per-state answer validation (regex, oneOf, length)
│   │   └── session.ts              Header parsing for x-session-id
│   ├── chat.ts                     POST /api/chat — text + voice conversational turns
│   ├── history.ts                  GET  /api/history — restores an ongoing conversation
│   ├── transcribe.ts               POST /api/transcribe — Azure Real-time REST wrapper
│   ├── traditional.ts              CRUD /api/traditional — form-based onboarding data
│   └── sessions.ts                 GET/PATCH/DELETE /api/sessions — registry queries
│
├── server/
│   ├── dev.ts                      Express dev server that wraps the handlers
│   └── data/                       JSON persistence (gitignored)
│       └── sessions.json           Created on first write
│
├── src/                            React frontend
│   ├── assets/                     Fin SVGs (animated + static), Finerty logo, icons
│   ├── components/
│   │   ├── App.tsx, Dashboard.tsx, SideMenu.tsx, Header.tsx, Footer.tsx
│   │   ├── AboutProject.tsx        Default landing view
│   │   ├── Chat.tsx                Conversational onboarding UI
│   │   ├── VoiceOnboarding.tsx     Full-screen hands-free voice modal
│   │   ├── TraditionalOnboarding.tsx   Two-phase wizard with horizontal stepper
│   │   ├── IACost.tsx              Cost dashboard (per session + by type + totals)
│   │   ├── SavedInformation.tsx    Completed-session cards + details modal
│   │   ├── SessionPills.tsx        Floating top-left chips for active sessions
│   │   ├── StartButton.tsx         Shared Start button
│   │   └── ReactConfetti.tsx       Full-viewport confetti on completion
│   └── services/                   Thin API clients (fetch wrappers)
│       ├── chatService.ts          /api/chat + /api/history (chat + voice variants)
│       ├── audioService.ts         WebM→WAV conversion, transcribe, TTS, beep
│       ├── traditionalService.ts   /api/traditional client
│       └── sessionsService.ts      /api/sessions client + active-session helpers
│
├── .env                            Local secrets (gitignored)
├── .env.example                    Template for .env
├── package.json
├── tsconfig.{json,app.json,node.json}
├── api/tsconfig.json               Dedicated config for the serverless functions
└── vite.config.ts                  Vite + Tailwind + dev proxy for /api → :3001
```

---

## Running locally

### Requirements

- Node.js 20 LTS (or newer)
- npm
- An OpenAI API key
- Optional: an Azure Speech Services key (voice input only)

### Setup

```bash
cd project
npm install
cp .env.example .env
# then edit .env and fill in the keys
```

### `.env` variables

```bash
# OpenAI (required for Messages and Voice)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.5
OPENAI_MAX_TOKENS=800
OPENAI_HISTORY_LIMIT=20

# Azure Speech to Text (required only for Voice user input)
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=brazilsouth
```

### Starting the app

```bash
npm run dev
```

This runs **both** processes in parallel via `concurrently`:

- `dev:web` — Vite on `http://localhost:5173`
- `dev:api` — Express wrapper (`tsx watch server/dev.ts`) on `http://localhost:3001`,
  loaded through `dotenv -e .env`. Vite proxies `/api/*` to the Express process.

Open <http://localhost:5173>.

---

## Architecture

### Shared pipeline for all three flows

Each onboarding flow produces a **session**. Sessions share the same registry and the same
core state machine, even though the UI is different:

| Flow | Frontend entry | Backend endpoint | Session type |
|------|---------------|------------------|--------------|
| Messages | [Chat.tsx](src/components/Chat.tsx) | `POST /api/chat` | `chat` |
| Voice    | [VoiceOnboarding.tsx](src/components/VoiceOnboarding.tsx) | `POST /api/chat` (with `x-session-type: voice`) + `POST /api/transcribe` | `voice` |
| Traditional | [TraditionalOnboarding.tsx](src/components/TraditionalOnboarding.tsx) | `POST /api/traditional` | `traditional` |

### Session registry

[api/_lib/sessionStore.ts](api/_lib/sessionStore.ts) owns a single source of truth for
every session's metadata and cost:

```ts
interface SessionRecord {
  id: string            // UUID that the client sends via x-session-id
  label: string         // "Session N" assigned sequentially
  type: 'chat' | 'voice' | 'traditional'
  status: 'active' | 'completed' | 'abandoned'
  createdAt, updatedAt, completedAt
  cost: { tokensUsed, model, inputRatePerMillion, outputRatePerMillion, costUsd }
  snapshot?: { collectedData, messages? }   // sealed copy at completion time
}
```

Every OpenAI call feeds tokens into `addTokens()`; completion triggers
`completeSession()` which seals the snapshot (collected data + full transcript) into the
JSON file. Abandoning a session flips its status without destroying data.

### State machine

[api/_lib/stateMachine.ts](api/_lib/stateMachine.ts) drives the conversation through:

```
greeting
  → q1_relax → q2_hobbies → q3_dream → q4_dream_plan → q5_morning
  → q6_change → q7_consequences
  → summary_confirmation
  → pd_name → pd_address → pd_document (optional)
             → pd_eircode → pd_mobile → pd_dob → pd_email → pd_civil_status
  → completed
```

Plus two escape states: `stuck_offer_help` (after two off-topic answers in a row) and
`specialist_handoff` (terminal).

### Moderation and validation

Every user message goes through `omni-moderation-latest` before anything else. Flagged
categories (violence, self-harm, sexual, hate, harassment, illicit) trigger a scripted
redirect and repeat the question — the LLM never sees harmful content.

After moderation, [api/_lib/validation.ts](api/_lib/validation.ts) applies a per-state
validator (`minLength`, `regex`, `oneOf`). Two off-topic answers on the same state take
the user to `stuck_offer_help`, which offers **Start over** or **Talk to a specialist**.

### Voice specifics

- **TTS**: browser native `speechSynthesis` at `rate: 0.9` for a more natural pace.
- **VAD**: an `AnalyserNode` polled via `requestAnimationFrame` computes RMS and stops
  recording automatically when silence exceeds 1.6 s after actual speech.
- **Beep**: a soft 880 Hz / 180 ms cue plays when the mic opens, using a single shared
  `AudioContext` that is unlocked inside the initial user click gesture (required by
  Chrome/Safari autoplay policy).
- **Fallback**: if VAD misses the user, tapping the Fin avatar force-stops the
  recording.

### Cost model

Cost is an approximation using the blended midpoint of GPT-4o-mini's input/output prices:

```
blendedRate = (0.15 + 0.60) / 2   // USD per 1M tokens
costUsd = (tokensUsed / 1_000_000) * blendedRate
```

Displayed side by side in [IACost.tsx](src/components/IACost.tsx) with per-session,
per-type and global aggregates. Azure Speech usage (F0 tier is free up to 5 h/month) is
not included.

### UI layer

[Dashboard.tsx](src/components/Dashboard.tsx) is the orchestrator: it holds the active
view, opens/closes the voice modal, mounts [SessionPills.tsx](src/components/SessionPills.tsx)
top-left, and uses `key`-based remounts on `Chat` / `TraditionalOnboarding` to force a
clean state when the user resumes a different session from the pills.

---

## Deployment

The backend is already shaped for Vercel: every file under `api/` is a serverless
function with `export default async function handler(req, res)`. Vercel picks them up
automatically; Vite handles the static build.

Before deploying:

1. Swap `api/_lib/sessionStore.ts` from JSON-file persistence to Upstash Redis or
   Vercel Postgres (Vercel's serverless filesystem is read-only). The store only needs
   to implement `listSessions` / `getSession` / `ensureSession` / `addTokens` /
   `completeSession` / `abandonSession`.
2. Push the environment variables (`OPENAI_*`, `AZURE_SPEECH_*`, and whichever storage
   credentials you chose) to the Vercel project settings.

The frontend code is already agnostic to deployment target — it calls same-origin
`/api/*` routes.

---

## Scripts

```bash
npm run dev           # concurrently: Vite (5173) + Express wrapper (3001)
npm run dev:web       # Vite only
npm run dev:api       # Express wrapper only
npm run build         # tsc --build + vite build
npm run preview       # Vite preview of the built bundle
npm run lint          # ESLint
```

---

## Credits

Built as part of a comparative study of AI-driven vs. form-based onboarding. Designed
and implemented by Rafael Pereira Satyro for Finerty.
