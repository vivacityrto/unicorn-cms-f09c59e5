# Audit: 2026-05-07 — Client home Message button routed to CSC tab

**Author:** Khian (Brian)  
**Trigger:** ad-hoc — Message button on client home page opened wrong help center tab  
**Scope:** `src/components/client/ClientHomePage.tsx` — frontend only  
**Codebase verified at:** `unicorn-cms-f09c59e5@4bb51821` (post-fix state confirmed via grep after pull)

---

## Context

The "Message" button on the CSC card and the "Message CSC" quick action tile on the client home page both called `openHelpCenter("chatbot")`, opening the help center on the Chatbot tab. The intended behaviour is to open on the CSC tab — the section for direct CSC communication — since both entry points are explicitly for messaging the client's assigned CSC.

All relevant files were read before the fix was designed. Root cause confirmed from source before any Lovable prompt was written.

---

## Finding — Two `openHelpCenter` calls used the wrong tab argument

**File:** `src/components/client/ClientHomePage.tsx`

`HelpCenterContext` exposes `openHelpCenter(tab?: HelpCenterTab)` where `HelpCenterTab = "chatbot" | "csc" | "support"`. Both the CSC card `onMessage` prop (line 395) and the "Message CSC" quick action `onClick` (line 360) passed `"chatbot"` instead of `"csc"`.

**Root cause:** The argument was hardcoded to `"chatbot"` in both places, likely a copy-paste from the "Ask the Chatbot" tile which correctly uses `"chatbot"`.

**Fix:** Two string literal swaps in `ClientHomePage.tsx`:

| Line | Before | After |
|------|--------|-------|
| 360 | `onClick: () => openHelpCenter("chatbot")` | `onClick: () => openHelpCenter("csc")` |
| 395 | `onMessage={() => openHelpCenter("chatbot")}` | `onMessage={() => openHelpCenter("csc")}` |

The "Ask the Chatbot" tile (line 372) and the quick links footer "Ask Chatbot" button (line 455) were correctly left on `"chatbot"`.

---

## Verification

Post-pull grep on `ClientHomePage.tsx` confirmed:

- Line 360: `openHelpCenter("csc")` ✓
- Line 372: `openHelpCenter("chatbot")` ✓ (untouched)
- Line 395: `openHelpCenter("csc")` ✓
- Line 455: `openHelpCenter("chatbot")` ✓ (untouched)

Scope: frontend only. No DB tables, no migrations, no RLS policies, no edge functions changed.

---

## KB changes shipped

None this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@4bb51821` — post-fix HEAD; `ClientHomePage.tsx` confirmed correct after pull.

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

None.

---

## Tag

`audit-2026-05-07-client-home-message-csc-tab-fix`
