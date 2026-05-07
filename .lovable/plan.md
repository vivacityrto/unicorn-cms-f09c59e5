# Plan: Per-question dictation on audit form

## 1. New component: `src/components/audit/DictateButton.tsx`

Self-contained button using the browser's Web Speech API. No new dependencies.

**Props (strict TS):**
```ts
interface DictateButtonProps {
  onTranscript: (text: string) => void;
  appendMode?: boolean; // default true (currently informational; final chunks always emitted)
  lang?: string;        // default 'en-AU'
}
```

**Internal types** (declared locally to avoid `any`):
- Minimal `SpeechRecognition` / `SpeechRecognitionEvent` / `SpeechRecognitionErrorEvent` interfaces.
- `const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: ...; webkitSpeechRecognition?: ... }).SpeechRecognition ?? ...webkitSpeechRecognition;`

**State:**
- `isRecording: boolean`
- `interim: string` (live preview text shown beneath the textarea via a portal-less sibling — see wiring note below; component will expose interim via a render-prop OR keep it self-contained by rendering a small absolute-positioned strip below itself). Decision: keep DictateButton self-contained — render the interim preview inside the button's own wrapper `<div>` so the host card needs no extra plumbing.
- `elapsedSec: number` for the timer label `m:ss`.
- `supported: boolean` set on mount.

**Behaviour:**
- On mount: detect support; if missing, render disabled ghost icon button wrapped in `Tooltip` with content "Dictation requires Chrome, Edge, or Safari".
- On click (start):
  - Instantiate recogniser, set `continuous = true`, `interimResults = true`, `lang = props.lang ?? 'en-AU'`.
  - `onresult`: iterate `event.results` from `event.resultIndex`; accumulate finalised transcripts into a buffer; when a result `isFinal`, call `onTranscript(trimmed)` and clear buffer; otherwise update `interim` for live preview.
  - `onerror`: if `error === 'not-allowed'` toast `"Microphone access denied. Enable it in browser settings to use dictation."`; for other errors toast a generic "Dictation error". Always stop.
  - `onend`: clear interim, stop timer, reset state. Auto-restart NOT done.
- Silence auto-stop: maintain a `silenceTimeoutRef` reset on every `onresult`; after 30s with no results call `recognition.stop()`.
- Timer: `setInterval` 1s while recording; format `Math.floor(s/60)`:`String(s%60).padStart(2,'0')`.
- On click (stop): call `recognition.stop()`.
- Cleanup on unmount: stop recogniser, clear interval & silence timer.

**UI:**
- Wrapper `<div className="inline-flex flex-col items-end gap-1">`
  - Row: `<Button size="icon" variant="ghost">` with `Mic` (idle) or `MicOff` (recording, `text-red-600 animate-pulse`). When recording, sibling `<span className="text-xs tabular-nums text-red-600">0:42</span>`.
  - When recording and `interim` non-empty: `<p className="text-xs text-muted-foreground italic max-w-xs truncate">{interim}</p>` rendered below.
- `aria-label`/`title`: "Start dictation" / "Stop dictation".
- Disabled state tooltip wraps the button via shadcn `Tooltip`.

## 2. Wire into `src/components/audit/workspace/QuestionCard.tsx`

Two textareas (one for conversation phases at line ~358, one for auditor_assessment at line ~438). Add the dictate button next to the label for both.

Change the label row to a flex container:
```tsx
<div className="flex items-center justify-between">
  <label className="text-xs font-medium text-muted-foreground">{notesLabel}</label>
  <DictateButton
    onTranscript={(t) => setNotes(notes ? `${notes} ${t}` : t)}
  />
</div>
```

Because `setNotes` is the existing `useDebouncedAutosave` setter, dictated text flows through the same debounced autosave to `client_audit_responses.notes` — no save-pipeline changes.

Note: capture current `notes` via the existing closure; using `notes ? \`${notes} ${t}\` : t` matches the spec's "leading space if non-empty". (If we observe stale-closure issues during testing we'll switch to a `setNotes((prev) => ...)` overload — current `useDebouncedAutosave` exposes only direct `setValue`, so we'll keep the closure form unless an issue surfaces.)

Add import: `import { DictateButton } from '@/components/audit/DictateButton';`

## 3. Out of scope (untouched)
- DB schema, RLS, save pipeline, EOS, Scorecards, Academy.
- No changes to `useDebouncedAutosave`.
- Australian English copy throughout ("Start dictation", "Microphone access denied…", "Dictation requires Chrome, Edge, or Safari").

## 4. Acceptance verification (manual)
1. Open Altaira Mock Audit → opening meeting question → click mic → speak → click stop → text appears in textarea, autosaves; reload persists.
2. Chrome desktop + Safari iPad supported; Firefox shows disabled button + tooltip.
