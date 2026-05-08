## Academy Typography Revert — Inter Throughout

### Phase 1 — Audit findings

**1.1 CSS files defining Anton / Binate / Montserrat**
- `src/index.css` lines 848–857:
  ```css
  .academy-scope .viv-font-anton {
    font-family: 'Anton', 'Montserrat', system-ui, sans-serif;
    letter-spacing: 0.01em;
  }
  /* TODO(brand): swap Montserrat fallback for Binate when licensed */
  .academy-scope .viv-font-binate {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  ```
  No `@font-face` blocks; no `@import` for these fonts. No `Binate` literal anywhere — the class was named after Binate but currently maps to Montserrat as a placeholder.

**1.2 `viv-font-anton` / `viv-font-binate` class usages in TSX**
- `src/components/layout/AcademyTopBar.tsx:123, 144` (anton — "Academy" label, page title)
- `src/components/layout/AcademyLayout.tsx:127` (binate — small caption), `:165` (anton — "Vivacity" wordmark)
- `src/components/layout/AcademyFooter.tsx:40` (anton)
- `src/pages/client/AcademyDashboardPage.tsx:97` (anton — h2), `:114` (anton — stat number), `:116` (binate — stat label)
- `src/components/academy/AcademyPageWrapper.tsx:42` (anton — page h1)

**1.3 `index.html` Google Fonts links**
- `index.html:30`:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
  ```
  (preconnect lines 28–29 are generic to fonts.googleapis.com and stay.)

**1.4 Inter / base font stack**
No explicit Inter declaration found in `tailwind.config.ts` or `src/index.css`. The rest of Unicorn renders with Tailwind's default `font-sans` stack (system-ui / Apple system fonts) inherited via the body. Reverting Academy to "the same stack as the rest of Unicorn" therefore means **inheriting the global stack** — no new font import needed.

**Note — out-of-scope inline-Anton sites discovered (not part of `.academy-scope`)**
- `src/components/academy/admin/VideoThumbnail.tsx:38` — inline `style={{ fontFamily: "'Anton', sans-serif" }}` on a video thumbnail letter badge.
- `src/pages/admin/BulkInvite.tsx:400` — inline `style={{ fontFamily: "Anton, sans-serif" }}` on the BulkInvite admin h1.

These two also reference Anton and would break visually (fall back to the next stack member) once the Google Fonts link is removed. The Prompt is scoped to `.academy-scope` typography revert, but `VideoThumbnail` is an Academy admin component, and removing the Google Fonts link without addressing them leaves them silently degraded. **Recommendation: strip the inline `fontFamily` from both as well so they inherit the global stack** — confirm in the open question below.

---

### Phase 2 — Strip display fonts

- `src/index.css`: delete the `.viv-font-anton` and `.viv-font-binate` rule blocks (lines 848–857) and the TODO comment. Leave the `.academy-scope` colour-token block (838–847) intact.
- `index.html`: delete line 30 (the Anton+Montserrat `<link>`). Keep the two `preconnect` lines — they're harmless and may be reused by other Google Fonts loads.
- No `@font-face` to remove (none exist).
- No Calibri body declaration to revert — none exists in the codebase. Phase 4 of the prompt is therefore a no-op; will be noted in the report.

### Phase 3 — Replace class usages in TSX

For each site listed in 1.2, remove the `viv-font-anton` / `viv-font-binate` token from the `className` string and leave all sibling classes (sizes, colours, weights, tracking) intact. No element unwrapping. Files touched:
- `src/components/layout/AcademyTopBar.tsx`
- `src/components/layout/AcademyLayout.tsx`
- `src/components/layout/AcademyFooter.tsx`
- `src/components/academy/AcademyPageWrapper.tsx`
- `src/pages/client/AcademyDashboardPage.tsx`

### Phase 4 — Body font

No `.academy-scope { font-family: Calibri }` rule exists. Body text already inherits the global Unicorn stack. No edit required; will be called out explicitly in the deliverable report.

### Phase 5 — Verification (post-edit)

- `rg -n -i "anton|binate|montserrat" src/ public/ index.html` → expect zero matches (modulo the open-question files below if we leave them).
- `rg -n "viv-font-anton|viv-font-binate" src/` → zero matches.
- Visual smoke: `/academy/dashboard`, `/academy/courses`, all five hub pages, lesson viewer — typography matches `/dashboard` and `/client/home`.
- Confirm `--viv-purple/--viv-fuchsia/--viv-cyan/--viv-acai/--viv-gold` tokens, gradients, and stat-card coloured bars unchanged.
- Confirm no diff outside `.academy-scope` consumers and the two HTML/CSS lines.

---

### Open question (one decision needed before I implement)

How should I handle the two **inline-Anton** sites that are technically outside `.academy-scope` but will degrade silently once the Google Fonts link is gone?

1. **Strip both** (recommended) — remove `fontFamily` from `VideoThumbnail.tsx:38` and `BulkInvite.tsx:400` so they inherit the global Inter/system stack. Cleanest end state, zero Anton references remain.
2. **Strip only `VideoThumbnail.tsx`** — it's an Academy admin component; leave `BulkInvite.tsx` alone since it's not Academy-scoped.
3. **Leave both as-is** — they'll fall back to `sans-serif`. Strict reading of the prompt (".academy-scope only").

I'll proceed with option 1 unless told otherwise.