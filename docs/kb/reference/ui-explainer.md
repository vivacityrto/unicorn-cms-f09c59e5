# UI Explainer

> **Last updated:** 2026-04-27 · **Reconsider by:** 2026-10-28 · **Confidence:** medium — sidebars extracted directly from source; module/purpose mapping derived from `codebase-state/module-status.md` and `pinned/orientation.md`. Items flagged "purpose unclear" or "stub" need Carl input.
>
> **Reflects commit:** `<codebase>@cf8d1314` (2026-04-25)

A self-contained interactive HTML walkthrough of Unicorn's two main UI surfaces — the staff (Vivacity Team) sidebar and the client portal sidebar. Click a nav item to see what it does, why it exists, build status, and the key files behind it. Built so a new dev (or pre-login onboarder) can understand the app without ever logging in.

Open: [ui-explainer.html](ui-explainer.html)

## Regeneration

Same pattern as `codebase-state/*` — regenerate when the sidebars meaningfully change, or after any Lovable remix. The data is inline JS in the HTML file (the `DATA = { staff: ..., client: ... }` object). Source-of-truth files to re-read:

- `<codebase>/src/components/DashboardLayout.tsx` — staff sidebar
- `<codebase>/src/components/client/ClientSidebar.tsx` — client sidebar
- `<codebase>/src/App.tsx` — route table
- `unicorn-kb/codebase-state/module-status.md` — module build status
- `unicorn-kb/pinned/orientation.md` — product purposes

Update the `Reflects commit` SHA above to match `<codebase>` HEAD when you regenerate.
