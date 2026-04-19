
The user wants RON to respond faster in conversation. Currently there are two latency sources:

1. **Chat streaming** (`ron-chat`) — already streams tokens, but uses whatever model is configured. Need to check.
2. **TTS playback** — the bigger issue. Currently `playTTS` waits for the **entire** assistant message to finish streaming before sending it to ElevenLabs (or browser TTS), then waits for the full audio blob before playing. That means ~2–4s of dead air after RON "finishes thinking."

Let me check the ron-chat function for the model used.

Plan:

## Speed up RON conversation responses

### Problem
Two sources of perceived slowness:
1. **TTS waits for full message** — `playTTS` only fires after the entire stream completes, then waits for the full audio blob to download before playing. ~2–4s gap.
2. **Browser TTS default rate is slow** — already at 1.05, could go higher.
3. **Model latency** — if ron-chat uses a heavier reasoning model, swapping to `google/gemini-3-flash-preview` shaves seconds.

### Changes

**1. `src/pages/RonPopout.tsx` — sentence-level streaming TTS**
- Buffer streamed tokens and flush to TTS at sentence boundaries (`.`, `!`, `?`, `\n`) so RON starts speaking the first sentence while later sentences are still being generated.
- Queue audio playback so sentences play back-to-back without overlap.
- Bump browser TTS `rate` from 1.05 → 1.15 (still natural, noticeably snappier).
- Bump ElevenLabs playback rate via `audio.playbackRate = 1.1`.

**2. `supabase/functions/ron-tts/index.ts`**
- Reduce ElevenLabs `stability` slightly and ensure `optimize_streaming_latency: 4` (max) is set on the request — first audio bytes return ~50% faster.
- Keep the graceful 200-with-fallback behavior already in place.

**3. `supabase/functions/ron-chat/index.ts`**
- Confirm model is `google/gemini-3-flash-preview` (fastest) and reasoning is off. If a heavier model is set, switch it.
- Trim the system prompt instruction to encourage shorter, punchier replies (e.g. "Keep responses under 3 sentences unless asked for detail.").

### Flow (after change)
```text
User asks question
  → tokens stream in
  → first sentence detected → fire TTS request immediately
  → audio plays while sentence 2 streams
  → sentence 2 TTS queued, plays after sentence 1
  → ...
```
Perceived response time drops from ~3–5s to <1s to first audio.

### Files
- `src/pages/RonPopout.tsx` (sentence buffering + audio queue + faster playback rate)
- `supabase/functions/ron-tts/index.ts` (max streaming latency flag)
- `supabase/functions/ron-chat/index.ts` (verify fast model + concise prompt)

No DB changes, no new dependencies.
