## Goal

Align `supabase/functions/send-invitation-email/index.ts` with live version 501 of the edge function. The live version removes a `v:NAME` form-param loop that causes Mailgun to perform a double substitution pass — doubling every variable in rendered emails and breaking all click-through links (including invite acceptance URLs).

This bug has regressed twice. A permanent CAPS warning comment is required so future syncs do not re-introduce the loop "for safety."

## Current state (repo)

`supabase/functions/send-invitation-email/index.ts` lines 137–141:

```ts
formData.append("h:X-Mailgun-Variables", JSON.stringify(variables));
// Also pass as t:variables for template engine
for (const [k, v] of Object.entries(variables)) {
  formData.append(`v:${k}`, String(v));
}
```

The `for` loop is the regression. It must be deleted, and the existing single-line comment above it replaced with a load-bearing CAPS warning block.

## Change

Replace lines 137–141 of `supabase/functions/send-invitation-email/index.ts` with a CAPS warning block followed by only the single `h:X-Mailgun-Variables` append (matches live v501):

```ts
// ============================================================================
// DO NOT ADD A `v:NAME` LOOP HERE. DO NOT "ALSO PASS AS t:VARIABLES".
// Mailgun reads template variables from the h:X-Mailgun-Variables header ONLY.
// Appending v:<name> form params in addition to the header causes Mailgun to
// run substitution TWICE, doubling every variable in the rendered email and
// breaking every click-through link (including the invite acceptance URL).
// This bug has regressed twice. Live v501 is the canonical fix.
// If a future sync wants to re-add the loop "for safety" — it is not safety,
// it is the bug. Leave this block as-is.
// ============================================================================
formData.append("h:X-Mailgun-Variables", JSON.stringify(variables));
```

No other changes to this file. No edits to the comment wording.

## Deploy

After the file edit, redeploy the function so the running version matches the repo:

- `supabase--deploy_edge_functions(["send-invitation-email"])`

This is a no-op against live v501 behaviour but guarantees repo and deployed code are identical, eliminating the regression risk on next sync.

## Out of scope

- No changes to `cancel-invite`, `accept_invitation_v2`, or `AcceptInvitation.tsx` (already aligned in prior turns).
- No template, variable, or recipient logic changes.
- No "cleanup" of the comment block.

## Verification

After deploy, sending a test invite should produce an email where `{{invite_url}}`, `{{first_name}}`, etc. render once (not doubled like `https://unicorn-cms.au/accept-invitation?token=XXXhttps://unicorn-cms.au/accept-invitation?token=XXX`).
