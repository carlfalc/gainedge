

## Embed Auto-Playing Video on Whisky & Cigar Lounge Page

### What We'll Do
Copy the uploaded video into the project's `public/` folder and update the Whisky & Cigar Lounge page to auto-play it as a full-width background video beneath the title header. The video will:
- Auto-play on page load with audio enabled
- Show no controls, no play button, no title overlays
- Fill the full width in widescreen format
- Play once and stop (no loop)

### Changes

**1. Copy the video file**
- Copy `user-uploads://hf_...mp4` → `public/videos/lounge-intro.mp4`

**2. Update `src/pages/dashboard/WhiskyCigarLoungePage.tsx`**
- Remove the "Coming soon" placeholder text
- Add a `<video>` element below the header with:
  - `autoPlay`, `muted={false}` (browsers may block unmuted autoplay — we'll start muted and unmute via JS as fallback)
  - `playsInline`, no `controls` attribute, no `loop`
  - `style` to fill full width with `width: 100%`, `objectFit: cover`
  - Hide the video's default poster/UI with a black background
- Use a `ref` + `useEffect` to attempt unmuted autoplay first; if blocked by browser policy, fall back to muted autoplay (browsers require user interaction for unmuted autoplay)
- On video end, optionally show a subtle overlay or just hold on the last frame

### Technical Note on Audio
Browsers block unmuted autoplay by default. The code will try to play with audio first. If that fails, it will start muted and show a small "Click to unmute" icon so the user can enable sound with one click. This is the standard approach used by all major video platforms.

