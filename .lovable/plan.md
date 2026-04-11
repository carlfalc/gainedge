

## Build "Talk to RON" — Full Conversational AI Assistant

### What's Changed from Previous Plan
Based on your feedback, RON will **not** be limited to pattern insights. He is a full expert trading assistant who can answer any question — market analysis, strategy, risk management, general trading education — for as long as the user wants to keep the conversation going. The modal includes a clear "End Conversation" icon/button.

### Architecture

```text
User clicks "Ask RON" (floating button, every page)
       ↓
Modal opens with animated glowing orb
       ↓
User taps mic → ElevenLabs STT transcribes speech
       ↓
Transcript + full conversation history sent to edge function
       ↓
Edge function calls Lovable AI with RON system prompt + context
       ↓
AI response sent to ElevenLabs TTS → RON speaks back, orb pulses
       ↓
Conversation continues until user clicks "End Conversation" ✕
```

### Key Design Decisions

1. **Full conversation memory** — the modal keeps a running `messages[]` array. Every exchange (user + RON) is sent back to the AI so RON has full context of the ongoing conversation. No single-question limitation.

2. **Context-aware but not context-limited** — RON receives the current page, active instrument, pattern data, and stats as system prompt context. But the user can ask about anything: "What's a head and shoulders?", "Should I risk 2% per trade?", "Explain the London session." RON answers it all.

3. **End Conversation button** — a visible phone-hang-up style icon in the modal header (red, always visible) that ends the session, clears conversation history, and closes the modal. Separate from the X close button which also ends the session.

4. **Text fallback** — small text input at the bottom so users can type instead of speak.

### Setup Step

**Link ElevenLabs connector** — the connection already exists in the workspace (`std_01kdvs2csveprapekkjcks6z99`). We just need to link it to this project, making `ELEVENLABS_API_KEY` available to edge functions.

### Files to Create

**`supabase/functions/ron-chat/index.ts`**
- Accepts `{ messages, context }` — full conversation history + current dashboard context
- Calls Lovable AI gateway with RON system prompt: expert trader persona, confident tone, uses context when relevant but answers any trading question
- Streams response back via SSE for real-time text display
- Handles 429/402 errors

**`supabase/functions/ron-tts/index.ts`**
- Accepts `{ text }`, calls ElevenLabs TTS API with a confident male voice
- Returns audio binary for playback
- Uses `ELEVENLABS_API_KEY` from the linked connector

**`supabase/functions/ron-stt-token/index.ts`**
- Generates single-use ElevenLabs realtime scribe token
- Client uses this for live mic transcription via `@elevenlabs/react` `useScribe` hook

**`src/components/dashboard/AskRonButton.tsx`**
- Floating action button, bottom-right corner, visible on all dashboard pages
- Brain + mic icon with cyan glow (`#00CFA5`)
- Label: "Ask RON"

**`src/components/dashboard/AskRonModal.tsx`**
- Fullscreen dark overlay with centered animated orb
- **Orb**: CSS radial gradient (cyan → blue), scales with audio output frequency data, pulses when RON speaks, dims when listening
- **Mic button**: Large, tap to record. Uses `useScribe` for realtime STT
- **Text input**: Type fallback at bottom
- **Conversation display**: Scrollable chat bubbles showing user questions and RON's responses (with markdown rendering)
- **End Conversation**: Red phone/stop icon in the header — clears messages, stops audio, closes modal
- **Close (X)**: Also ends session
- **Status indicators**: "Listening...", "RON is thinking...", "RON is speaking..."
- Conversation persists across mic presses until explicitly ended

### Files to Modify

**`src/components/dashboard/DashboardLayout.tsx`**
- Add `<AskRonButton />` and `<AskRonModal />` after `<Outlet />`
- Pass current route path so RON knows which page the user is on

**`package.json`**
- Add `@elevenlabs/react` dependency

### RON's System Prompt (in ron-chat edge function)

RON is an expert AI trading assistant. He receives context about the user's current instrument, active patterns, and stats — but he can answer **any** trading question confidently. He maintains conversation continuity across multiple exchanges. He speaks with authority, uses clear language, and references the user's live data when relevant.

### Cost
- ElevenLabs free tier: ~10,000 chars/month TTS + STT
- Lovable AI: included credits
- Per interaction: ~1-3 cents

