## Goal

Create `src/components/ask-viv/ClientAskVivPanel.tsx` — a purpose-built Ask Viv panel for client tenant users (Admin / User). It is intentionally NOT a flag-toggled variant of `AskVivPanel.tsx`; that staff panel keeps untouched. It calls the new `compliance-assistant-client` edge function and renders only the strict 6-field client response shape.

## File to add

- **New**: `src/components/ask-viv/ClientAskVivPanel.tsx`
- **Untouched**: `AskVivPanel.tsx` and every other ask-viv component except the small reused bits below.

## Reuses (visual / child components only)

- `AskVivFreshnessChip` (imported as-is — same `FreshnessData` shape).
- Confidence chip styling — recreated locally as a `<ConfidenceChip>` subcomponent matching the staff colour scheme: low → amber, medium → yellow, high → green.
- Records-accessed `Collapsible` structure — recreated locally; **renders the `label` field only**, no `table`/`id` badges (the client response has no IDs).
- Message bubble layout (rounded-2xl, primary for user, muted for assistant) and the loading dots — recreated locally to keep the file self-contained.
- Input + Send button (lucide `Send` / `Loader2`).

## Explicitly NOT reused (per spec)

- `AskVivScopeBanner`, `AskVivFlagButton`, `AskVivExplainPanel`, `AskVivMicroExplain`, `AskVivModeSelector`, `AskVivContextChips`, `AskVivExplainSourcesToggle`, `AskVivScopeSelectorModal`, `AskVivCapabilitiesBanner`.
- `useAskViv()` (only exists inside DashboardLayout, not ClientLayout).
- `useAskVivFeatureFlags`, `useAskVivSessionScope`, `useRBAC`.

## Props & state

```ts
interface ClientAskVivPanelProps { isOpen: boolean; onClose: () => void; }
```

State: `useState` only — `messages`, `inputMessage`, `isLoading`, `error`, `lastQuestion`. Refs for input focus and scroll-into-view. **No** localStorage / Zustand / context.

## Network call

- Endpoint: POST `compliance-assistant-client` (NOT `compliance-assistant`).
- Auth: `supabase.auth.getSession()` from `@/integrations/supabase/client` (the existing client — not a new one). Bearer token in `Authorization`.
- URL: `${supabase.supabaseUrl}/functions/v1/compliance-assistant-client` via raw `fetch` (so we can read the 429 body's `detail` and `retry_after_seconds`).
- Body: exactly `{ question }`. No tenant_id / client_id / package_id / phase_id.

## Response type

```ts
type ClientAskVivResponse = {
  answer_markdown: string;
  records_accessed: { label: string }[];
  confidence: "high" | "medium" | "low";
  gaps: string[];
  freshness: {
    last_activity_at: string | null;
    days_since_activity: number | null;
    status: "fresh" | "aging" | "stale";
    derived_at: string;
  } | null;
  consultant_handoff_suggested: boolean;
};
```

## UI behaviour (per spec)

1. **Handoff banner**: when `consultant_handoff_suggested === true`, render an amber banner ABOVE the assistant message bubble: *"If this doesn't match what you expected, your Vivacity consultant can help — reach out via your usual channel."*
2. **Gaps**: small italic `<ul>` of `gaps` below the answer, only when non-empty.
3. **Records accessed**: collapsible "What we looked at (n)" section showing labels only — no IDs, no table badges, no truncation past first 12 (with `+ N more` hint).
4. **Confidence chip**: low → amber, medium → yellow, high → green.
5. **Freshness chip**: render `<AskVivFreshnessChip />` only when `freshness` is non-null AND `freshness.status` is `"aging"` or `"stale"` (the chip already self-suppresses on `"fresh"`, but the explicit guard documents intent).

## Markdown rendering

`AskVivPanel.tsx` does not use a markdown library — it renders the answer as `<p className="whitespace-pre-wrap">`. Mirror that exactly. (The server already produces structured markdown with `## Answer`, `## What we looked at`, `## What we couldn't find`; rendering as whitespace-preserved text matches the staff panel's behaviour and avoids adding a new dependency.)

## Error handling

- **429 `DAILY_LIMIT_REACHED`**: parse the body `detail` and render an amber notice above the input; disable Send and grey the input placeholder ("Daily limit reached").
- **403**: render `"This feature isn't available on your account."` notice; disable Send.
- **5xx / network**: render `"Something went wrong"` notice with a Retry button that re-issues the last question (and removes the orphaned user bubble first).

## Visual shell

Standalone fixed panel `bottom-6 right-6 w-[420px] h-[600px]` (matches staff panel's compact size). Header uses the cyan `from-primary/10 to-primary/5` gradient (per project Core memory: cyan for the main app). No expand/minimize toggle (out of scope, not in spec). Close button calls `onClose`.

## Why standalone (architectural note)

The V4 restoration story in `handoffs/ask-viv-fix-procedure.md` is the explicit rationale: flag-toggling the staff panel into client mode is brittle because the staff panel hard-depends on the `useAskViv()` context (only in DashboardLayout), session scope, RBAC, mode selector, scope-lock UI, and explain payload — none of which exist or apply on the client side. A second component is the durable fix.

## Verification (after switching to Build mode)

1. TypeScript check passes for the new file.
2. Render the panel inside the client layout, send a smoke question, confirm:
   - Request body is `{"question":"…"}` only.
   - `Authorization: Bearer <session token>` header present.
   - 200 response renders Answer / What we looked at / What we couldn't find sections, confidence chip, and (if applicable) handoff banner + freshness chip.
   - 429 path shows the rate-limit notice and disables Send.
3. Confirm `AskVivPanel.tsx` is byte-identical to its current state.
