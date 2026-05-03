## Fix: Portal FloatingChatbot to document.body

**Problem:** `FloatingChatbot` renders inside `ClientLayout`'s main content `<div>` which has `transition-all duration-300` and `overflow-x-hidden`. These create a containing block / clipping context that breaks `position: fixed`, causing the button to shift or clip during sidebar animation.

**Fix:** Render the existing `<div className="fixed ...">` via `createPortal(..., document.body)` so it mounts directly on `document.body`, outside any transformed/overflow ancestor.

### Change

File: `src/components/help-center/FloatingChatbot.tsx`

- Add `import { createPortal } from "react-dom";`
- Keep the `if (isOpen) return null;` guard.
- Replace `return (<div className="fixed ...">...</div>);` with `return createPortal(<div className="fixed ...">...</div>, document.body);`
- No markup, classes, styling, or behavior changes.

### Out of scope

- `AskVivFloatingLauncher.tsx` — staff-only, not modified.
- `ClientLayout.tsx` — no changes.
