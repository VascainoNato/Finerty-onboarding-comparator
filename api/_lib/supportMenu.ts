export interface MenuSuggestion {
  label: string
  nodeKey?: string
  prompt?: string
}

export interface MenuNode {
  message: string
  suggestions: MenuSuggestion[]
}

export const SUPPORT_MENU: Record<string, MenuNode> = {
  root: {
    message:
      "Hi! I'm Fin, here to help you get the most out of Finerty. Pick a topic to get a tour, or just type a question.",
    suggestions: [
      { label: 'Traditional Onboarding', nodeKey: 'traditional' },
      { label: 'Onboarding with IA - Messages', nodeKey: 'messages' },
      { label: 'Onboarding with IA - Voice', nodeKey: 'voice' },
      { label: 'IA Cost', nodeKey: 'cost' },
      { label: 'Saved Informations', nodeKey: 'saved' },
      { label: 'Sessions (top-left pills)', nodeKey: 'sessions' },
    ],
  },

  traditional: {
    message:
      "Traditional Onboarding is a two-phase form — no AI involved. Phase 1 covers seven open questions about you; Phase 2 collects your personal details. A stepper at the top shows your progress. What would you like to know?",
    suggestions: [
      {
        label: 'How do I start?',
        prompt: 'How do I start the Traditional Onboarding?',
      },
      {
        label: 'What questions are asked?',
        prompt: 'What questions are asked in the Traditional Onboarding?',
      },
      {
        label: 'Can I upload a document?',
        prompt:
          'Can I upload a document in the Traditional Onboarding and is it required?',
      },
      {
        label: 'What happens when I finish?',
        prompt: 'What happens when I finish the Traditional Onboarding?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },

  messages: {
    message:
      "Onboarding with IA - Messages is a text chat with me. I walk you through the same questions, but I also acknowledge your answers and you can use clickable suggestions, attach files when asked, or even record voice replies. What do you want to know?",
    suggestions: [
      {
        label: 'How do I start?',
        prompt: 'How do I start the AI Messages onboarding?',
      },
      {
        label: 'Can I use the microphone?',
        prompt: 'Can I answer with voice in the AI Messages flow, and how?',
      },
      {
        label: 'What does the paperclip do?',
        prompt: 'What does the paperclip (attach) button do in AI Messages?',
      },
      {
        label: 'What if I go off-topic?',
        prompt:
          'What happens if I answer off-topic or send something inappropriate in AI Messages?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },

  voice: {
    message:
      "Onboarding with IA - Voice is the hands-free version — same flow, but I speak and you speak back. Click Start once and we're off. A soft beep tells you when it's your turn. Ask away.",
    suggestions: [
      {
        label: 'How do I start?',
        prompt: 'How do I start the AI Voice onboarding?',
      },
      {
        label: 'How does listening work?',
        prompt:
          'How does the voice detection work in the Voice onboarding? Does it auto-stop?',
      },
      {
        label: 'What if it does not hear me?',
        prompt:
          'What can I do if the Voice onboarding is not detecting my speech?',
      },
      {
        label: 'How do I close it?',
        prompt: 'How do I close the Voice onboarding modal?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },

  cost: {
    message:
      "IA Cost is the dashboard that tells you how many tokens each session used and the approximate USD cost. You get totals at the top, a breakdown by onboarding type, and a table of every session. Pick a question below.",
    suggestions: [
      {
        label: 'How is cost calculated?',
        prompt: 'How is the IA cost calculated in the dashboard?',
      },
      {
        label: 'Why is voice cost low?',
        prompt:
          'Why does the Voice onboarding seem to cost less? Is transcription counted?',
      },
      {
        label: 'Can I export my costs?',
        prompt: 'Can I export or download the IA Cost data?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },

  saved: {
    message:
      "Saved Informations keeps every completed session. You'll see a grid of cards — click one to open a modal with the full picture: timestamps, cost, collected answers and the whole transcript when it applies. What would you like to know?",
    suggestions: [
      {
        label: 'Where do saved sessions come from?',
        prompt:
          'Which sessions show up in Saved Informations and when do they appear?',
      },
      {
        label: 'Can I delete a saved session?',
        prompt: 'Can I delete a saved session from Saved Informations?',
      },
      {
        label: 'What info is kept?',
        prompt:
          'What information is saved for each completed session in Saved Informations?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },

  sessions: {
    message:
      "Sessions appear as small pills floating in the top-left of the screen whenever you have one going. Each pill shows the session label and type. Click it to resume, or click the X to abandon it. Ask away.",
    suggestions: [
      {
        label: 'How do I resume a session?',
        prompt: 'How do I resume an active session using the pills?',
      },
      {
        label: 'What does abandon mean?',
        prompt:
          'What happens when I abandon a session from the pill? Is the data lost?',
      },
      {
        label: 'Can I have many at once?',
        prompt: 'Can I have multiple sessions active at the same time?',
      },
      { label: 'Back to topics', nodeKey: 'root' },
    ],
  },
}
