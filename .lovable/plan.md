

## Fix: Topbar obscuring content + remove redundant preview text

### Problem 1 -- Content hidden behind topbar
The impersonation banner is fixed at the top (48px tall). The topbar is sticky at `top: 48px`. However, the page content in `<main>` starts immediately after the topbar with no offset, so the first ~112px of content is hidden behind the two bars.

**Fix**: Add top padding to the main content wrapper in `ClientLayout.tsx` to account for the impersonation banner (48px) + topbar (56px) when in preview mode, or just the topbar when not in preview.

Specifically in `ClientLayout.tsx`, the `<main>` element (line 50) needs conditional top padding:
- Preview mode: `pt-[104px]` (48px banner + 56px topbar)  
- Normal mode: `pt-14` (56px topbar only)

Alternatively (and more robustly), make the topbar non-sticky or use a spacer div approach so the content naturally flows below both bars.

### Problem 2 -- Redundant preview text
In `ClientPreview.tsx` (lines 32-37), the heading "Welcome to {tenant}" and description "This is a preview of the client portal experience" duplicate what the impersonation banner already communicates.

**Fix**: Remove lines 32-37 from `ClientPreview.tsx` so the page renders `<ClientHomePage />` directly without the extra wrapper text.

### Files to change

1. **`src/components/layout/ClientLayout.tsx`** -- Add top padding to main content area that accounts for sticky topbar height (and banner height when `isPreview` is true). Change the main element's classes to include appropriate padding-top.

2. **`src/pages/ClientPreview.tsx`** -- Remove the `<div className="space-y-2 mb-6">` block containing the "Welcome to" heading and preview description text, leaving only `<ClientHomePage />` inside `<ClientLayout>`.

### Technical detail

For the layout fix, the cleanest approach is to make the impersonation banner not `fixed` but instead part of the normal document flow at the top of `ClientLayout`, with the topbar sticky below it. This way content naturally flows beneath both elements without manual padding calculations. If the banner must remain fixed (for scroll persistence), then a matching-height spacer div will be inserted before the topbar.

