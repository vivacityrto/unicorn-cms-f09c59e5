
## Add Voice-to-Text to Add Note and Log Consult Dialogs

### Overview

Using the browser's built-in Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), a microphone button will be added next to the notes textarea in both the **Add Note** dialog and the **Log Consultation Hours** notes field. No API keys, no backend changes, no extra cost.

---

### How It Works

```text
User clicks mic button
        │
        ▼
Browser requests microphone permission (once, browser handles this)
        │
        ▼
SpeechRecognition starts capturing audio from device mic
        │
        ▼
Interim transcription appears in textarea in real time (greyed out style)
        │
        ▼
User stops speaking → final transcript appended to existing note text
        │
        ▼
User clicks mic again (or it auto-stops) → recording ends
```

---

### New File: `src/hooks/useSpeechToText.ts`

A reusable custom hook that encapsulates the Web Speech API:

- `isRecording` — boolean, true while mic is active
- `isSupported` — boolean, false if the browser does not support the API (hides the button gracefully)
- `transcript` — interim text being captured right now
- `startRecording(onResult: (text: string) => void)` — starts listening; calls `onResult` with the final text when speech ends
- `stopRecording()` — stops listening manually
- Configured for `lang: 'en-AU'` (Australian English) and `continuous: false` (single utterance per press)
- Handles errors gracefully (permission denied, not supported, etc.) with a toast notification

---

### Changes to `src/components/membership/MembershipDialogs.tsx`

**Add Note dialog — notes textarea:**

The textarea label row gets a mic button on the right side:

```
Note                              [🎤 Speak]
┌─────────────────────────────────────────┐
│ Enter your note...                      │
│                                         │
└─────────────────────────────────────────┘
```

- While recording, the button shows a pulsing red mic icon (`🔴 Recording...`) with a stop action
- Final transcript is **appended** to any existing text in the field (does not overwrite)
- If the browser does not support speech recognition, the button is hidden — no disruption to existing UX

**Log Consultation Hours dialog — notes textarea:**

Same mic button treatment applied to the "Notes (optional)" field.

---

### Technical Details

- `SpeechRecognition` is a browser API — no network call, works offline
- `interimResults: true` gives live preview as the user speaks
- `lang: 'en-AU'` sets Australian English for best accent matching
- The hook cleans up automatically when the dialog closes (calls `stopRecording` in a `useEffect` cleanup)
- Graceful degradation: if `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both undefined (e.g., Firefox), `isSupported` is `false` and the mic button does not render at all
- No changes to the submit logic, no changes to RLS, no database changes

---

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useSpeechToText.ts` | New — reusable Web Speech API hook |
| `src/components/membership/MembershipDialogs.tsx` | Add mic button + hook to Add Note and Log Consult notes fields |

No backend, no migration, no secrets required.
