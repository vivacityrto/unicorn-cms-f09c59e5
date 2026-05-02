## Goal

Make the seven official Vivacity brand colors the single source of truth, so every future change uses them automatically without me having to be reminded.

## The palette (with role + HSL for tokens)

| Role | Name | Hex | HSL |
|------|------|-----|-----|
| Headings | Purple | `#7130A0` | `271 54% 41%` |
| Headings & Icons | Fuchsia | `#ED1878` | `330 86% 51%` |
| Buttons (primary) | Cyan | `#23C0DD` | `190 74% 50%` |
| Backgrounds (light) | Light Cyan | `#A6F1FF` | `190 100% 83%` |
| Body text | Acai | `#44235F` | `273 47% 25%` |
| Backgrounds (light) | Light Purple | `#DFD8E8` | `265 25% 88%` |
| Highlights | Macaron Yellow | `#F9CB0C` | `49 95% 51%` |

## What will change

1. **Update memory** `mem://style/brand-color-and-ui-standards` — replace the current cyan-only note with the full official palette, role assignments, and HSL values, so every future prompt enforces these. Keep existing rules: cyan-only buttons, dark backdrops on floating panels, Academy keeps its purple/fuchsia gradient identity.

2. **Add brand color tokens to `src/index.css`** — introduce semantic CSS variables alongside existing ones (HSL only, per design system rule):
   - `--brand-purple: 271 54% 41%`
   - `--brand-fuchsia: 330 86% 51%`
   - `--brand-cyan: 190 74% 50%` (already the `--primary`)
   - `--brand-cyan-light: 190 100% 83%`
   - `--brand-acai: 273 47% 25%`
   - `--brand-purple-light: 265 25% 88%`
   - `--brand-macaron: 49 95% 51%`
   - Map `--foreground` (light mode body text) to `--brand-acai`.

3. **Expose tokens in `tailwind.config.ts`** — add a `brand` color scale so classes like `text-brand-purple`, `bg-brand-cyan-light`, `text-brand-acai`, `bg-brand-macaron` work everywhere.

## What will NOT change (to avoid breakage)

- No mass refactor of existing components — current cyan primary and shadcn semantic tokens stay intact.
- Academy module keeps its purple/fuchsia gradient identity.
- No hex values introduced into components — everything flows through HSL tokens.

## Files touched

- `mem://style/brand-color-and-ui-standards` (memory update)
- `src/index.css` (add brand tokens, remap `--foreground` to acai)
- `tailwind.config.ts` (expose `brand.*` scale)

Approve and I'll apply it.