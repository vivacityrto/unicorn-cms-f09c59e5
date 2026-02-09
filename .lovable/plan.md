

## Vivacity Branding: White-First UI with Light-Purple Component Surfaces

### Overview

Restyle the application to use white as the dominant background everywhere, with light purple (`#DFD8E8`) reserved strictly for cards, banners, dividers, footer sections, and emphasis panels. Create a brand tokens file and a new client footer with Vivacity legal details.

---

### Part A: Brand Tokens

**New file: `src/styles/brand.ts`**

Export named color constants and a CSS variable map:

```
cyan: "#23c0dd"
cyanLight: "#A6F1FF"
body/acai: "#44235F"
purple: "#7130A0"
purpleLight: "#DFD8E8"
fuchsia: "#ed1878"
macaron: "#f9cb0c"
gradient: "linear-gradient(90deg, #7130A0, #ed1878)"
```

CSS variables are already defined in `index.css` (lines 216-222) and match the spec. No changes needed to CSS variables.

---

### Part B: DashboardLayout Sidebar and TopBar

**Modified: `src/components/DashboardLayout.tsx`**

#### Sidebar (lines 291-477)

Current: purple-to-fuchsia gradient background with white text.
New: white background with brand-colored text.

- Remove `backgroundImage` gradient from aside style
- Background: `bg-white` with `border-r border-[#DFD8E8]`
- Section headings: `text-[#7130A0]` (purple)
- Menu item text: `text-[#44235F]` (acai/body)
- Active item: `bg-[#DFD8E8]/30` (very light purple tint) with left border or icon in fuchsia `text-[#ed1878]`
- Hover: `hover:bg-[#DFD8E8]/20`
- Sidebar header border: `border-[#DFD8E8]`
- Version text, close/menu button icons: `text-[#7130A0]/60`
- Chevron icons: `text-[#7130A0]/50`
- Client View badge: `bg-[#DFD8E8]` with `text-[#7130A0]`

#### TopBar (no file change needed)

Already uses `bg-card` (white) and `border-border`. The border color variable already maps to a purple-tinted border. Current styling matches spec.

---

### Part C: Card and Component Styling

**Modified: `src/index.css`**

Minor CSS variable adjustments:
- Confirm `--card: 0 0% 100%` (white) -- already correct
- Confirm `--border: 270 30% 85%` -- already maps to light purple range, no change needed
- Add a utility class `.card-hover-brand` for `hover:bg-[#DFD8E8]/10` if needed, or rely on inline Tailwind

No structural changes to `card.tsx` component -- styling is applied via CSS variables which are already correct.

---

### Part D: Client Footer

**New file: `src/components/client/ClientFooter.tsx`**

Three-column responsive layout:

| Column 1 -- Vivacity | Column 2 -- Quick Links | Column 3 -- Support |
|---|---|---|
| Vivacity Coaching & Consulting Pty Ltd | Documents | "Need help? Contact your consultant." |
| ABN 40 140 059 016 | Calendar | Optional support hours |
| Phone: 1300 729 455 | Notifications | |
| | Contact Consultant | |

Styling:
- Container: `bg-white` with `border-t border-[#DFD8E8]`
- Headings: `text-[#7130A0]`
- Body text: `text-[#44235F]`
- Links default: `text-[#44235F]`, hover: `text-[#ed1878]`
- Bottom accent: thin 2px horizontal gradient bar `#7130A0` to `#ed1878`
- Copyright: `(c) {currentYear} Vivacity Coaching & Consulting Pty Ltd`
- Responsive: 3 columns on `md:`, stacked on mobile

**Modified: `src/components/DashboardLayout.tsx`**

- Import and render `ClientFooter` in place of (or alongside) `UtilityFooter` when in client view mode (`!showVivacityMenu`)
- Vivacity team members continue to see `UtilityFooter`

---

### Part E: Client Preview Page

**Modified: `src/pages/ClientPreview.tsx`**

- Page background: remains `bg-background` (white) -- already correct
- Preview nav bar background: `bg-white` with `border-b border-[#DFD8E8]`
- Active tab underline: `border-[#ed1878]` (fuchsia)
- Active tab text: `text-[#ed1878]`
- Headings: `text-[#7130A0]`
- Body text: `text-[#44235F]`

**Modified: `src/components/client/ImpersonationBanner.tsx`**

- Background: `bg-[#DFD8E8]` (light purple) instead of `bg-warning`
- Text: `text-[#44235F]`
- Icon accent: fuchsia `text-[#ed1878]`
- "Exit Preview" button: `bg-[#23c0dd] text-white hover:bg-[#23c0dd]/90`

---

### Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/styles/brand.ts` | Create | Central brand token exports |
| `src/components/client/ClientFooter.tsx` | Create | Three-column client footer with Vivacity legal details |
| `src/components/DashboardLayout.tsx` | Modify | White sidebar, client footer integration |
| `src/pages/ClientPreview.tsx` | Modify | Brand-aligned preview nav and content |
| `src/components/client/ImpersonationBanner.tsx` | Modify | Light purple banner with fuchsia accents |

### No Changes To

- `src/index.css` -- CSS variables already match brand spec
- `src/components/ui/card.tsx` -- inherits from CSS variables
- `tailwind.config.ts` -- brand colors already configured
- No legacy tables, no routing changes

