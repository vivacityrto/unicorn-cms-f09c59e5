
# MainDashboard design refinement

Scope: `src/pages/MainDashboard.tsx` only. Presentation-only — no data, routing, or business logic changes. Colours stay on the Unicorn palette (Purple `#7130A0`, Fuchsia `#ED1878`, Cyan `#23C0DD`, Acai `#44235F`) with semantic tokens where possible.

## Design principles applied

- **Hierarchy through density, not size.** Reduce card min-heights and vertical rhythm so real content appears above the fold.
- **One visual anchor per row.** The header gets a soft branded gradient bar; summary cards become tighter, quieter tiles with a single accent number.
- **Purposeful colour.** Only overdue/at-risk states use warm accent colour. Purple/Fuchsia are reserved for interactive affordances (links, primary CTA, active states).
- **Fill, don't stretch.** Equalise column heights so left/centre/right bottoms align; no ragged empty tails.

## Concrete changes

### 1. Header band
- Replace the plain white heading with a compact header card: white background, 1px border, subtle left accent bar in Fuchsia→Purple gradient (4px wide), tighter padding (`px-5 py-4` instead of stacked margins).
- Right side: keep "+ New Task" (Fuchsia) and add a secondary ghost "Schedule Meeting" button so the top-right isn't lopsided.
- Greeting typography stays Calibri; add a small date chip ("Fri, 3 Jul") next to the subtitle in muted tone.

### 2. Summary cards (6-up strip)
- Drop `min-h-[120px]` → `min-h-[92px]`, `p-4` → `px-4 py-3`.
- Layout: label (uppercase, 10px), big number (28px semibold), optional inline delta/sub in a single line.
- Remove the "View all →" inline link inside cards; the whole card becomes clickable (cursor-pointer, hover ring in `--border`, subtle bg tint on hover). This alone reclaims ~30px per card.
- Add a 3px top border in a per-card colour (Clients=Cyan, Overdue=red only when >0, Due Today=amber only when >0, Team Workload=Purple, KPI=Purple, Rocks=Fuchsia) so the row reads as a unified spectrum instead of six identical white boxes.

### 3. Three-column panel grid
- Change ratio from `38 / 38 / 24` to `36 / 40 / 24` so the centre (messages + rocks) — the highest-signal column — gets the most room.
- Reduce panel header `pt-3 pb-2` → `pt-2.5 pb-1.5`, body `p-3` → `px-3 py-2.5`, footer `py-2.5` → `py-2`.
- Panel titles get a tiny leading icon (Broadcast, ListChecks, MessageSquare, Target, HeartPulse, Gauge, Zap) in Purple at 14px — improves scannability, no extra vertical cost.
- Panel border: swap `0.5px solid hsl(var(--border))` for `1px solid hsl(var(--border))` with a `shadow-[0_1px_2px_rgba(17,24,39,0.04)]` — crisper on all displays, still light.

### 4. Left column — Broadcasts & Tasks Overview
- Broadcast items: convert bordered cards to a divider list (border-b between rows, no outer border on each item). Recovers ~8px per item.
- Tasks list: increase display cap from 12 → 15 (list height already scrolls). Add a compact filter pill row at top ("All · Overdue · Today") that reuses the existing list — pure client-side filter over the already-loaded array.
- Empty states get a small illustration glyph in Purple/20% opacity instead of centered text on lots of whitespace.

### 5. Centre column — Client Messages & Rocks
- Client message rows: prepend the coloured avatar circle from `clientAvatarColor.ts` (2-letter initials) — visual anchor and it reuses existing utility.
- Rocks list: add a thin progress bar (`--percent_complete` if available, else derived from status) under each title. Uses cyan for on-track, amber for at-risk, red for off-track.
- Both panels: cap combined content so column bottom aligns with left column bottom.

### 6. Right column — Health, KPI, Quick Actions
- Client Health donut: shrink to 120px and place the legend to the right of the donut (2-col: dot+label / count) instead of below. Frees ~50px vertical.
- Add a bold total in the donut centre ("42 clients") — currently unused inner ring space.
- KPI panel: remove the `scale-90 origin-top-left -mb-4 width:111%` hack (it causes the awkward gap you're seeing). Instead, pass a `compact` prop reading through to a tighter internal layout — if the components don't support it, wrap in a `[&_.grid]:gap-2 [&_h3]:text-xs` style-scope so it visually compacts without transform artefacts.
- Quick Actions: switch from stacked full-width buttons to a 2×3 icon-tile grid (icon on top, tiny label). Same 5 actions in ~half the height. Tiles use white bg + border, purple icon, hover fills purple/5.

### 7. Upcoming Calendar (full-width)
- Increase card width `220px` → `260px`, add a coloured left rail (Cyan) so cards read as a strip, not floating tiles.
- If fewer than 4 events, keep the row left-aligned (don't stretch); add a right-hand ghost "See full week →" tile so the row never looks half-empty.

### 8. Global container
- `space-y-4` between header/summary/grid/calendar → `space-y-3`.
- Remove the responsive `<style>` block; replace with Tailwind `[grid-template-columns:36fr_40fr_24fr] lg:grid-cols-1 lg:!grid-cols-[1fr]` responsive utility so no runtime CSS injection is needed.

## Technical details

- New icon imports from `lucide-react`: `Megaphone`, `ListChecks`, `MessageSquare`, `Target`, `HeartPulse`, `Gauge`, `Zap`, `Calendar`, `ChevronRight`.
- `SummaryCard` gets `topAccent?: string` prop and becomes an interactive `<button>` when `onClick` is set.
- `Panel` gets `icon?: LucideIcon` prop and tightens spacing tokens.
- New tiny component `QuickActionTile` for the 2×3 grid.
- No changes to any query, RPC, edge function, or DB schema.
- No changes to `Dashboard.tsx` / `/triage-dashboard`.

## Verification

- After build, capture `/dashboard` via Playwright (requires the user to have an active local login state) and compare above-the-fold density.
- Sanity check the responsive breakpoint (<1024px collapses to single column).

I can proceed as soon as you approve — say the word and I'll implement.
