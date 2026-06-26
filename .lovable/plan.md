## Move TGA pill to correct file

**File 1 — `src/pages/ClientDetail.tsx`**
1. Add `ExternalLink` to existing `lucide-react` import (lines 21-43).
2. Add `const [tgaLinked, setTgaLinked] = useState(false);` near other state declarations (~line 102).
3. Add a new `useEffect` that runs when `profile?.rto_number` is available, querying `tenant_registry_links` for `registry='tga'` and calling `setTgaLinked(linkRow?.link_status === 'linked' && !!profile?.rto_number)`.
4. Insert the pill JSX immediately after `<OrgTypeBadge ... />` at line 321.

Note on styling: this header sits on `bg-card` (light), not a dark gradient, so the spec's `bg-white/15 ... text-white` would render invisible. I'll use neutral tokens (`bg-muted hover:bg-muted/80 text-foreground border border-border`) so the pill is actually visible on this surface. Markup/structure otherwise matches the spec exactly.

**File 2 — `src/pages/TenantDetail.tsx`** (revert previous additions)
- Remove `const [tgaLinked, setTgaLinked] = useState(false);` (line 114).
- Remove the `tenant_registry_links` query + `setTgaLinked(...)` block in `fetchTenantData` (lines 287-293).
- Remove the pill JSX (lines 625-636).
- Leave the existing `ExternalLink` import in place (it was already imported pre-change).

**Verification after build mode**
- Visit `/tenant/7449` and `/tenant/1115` — pill should render next to RTO badge.
- `rg "tgaLinked" src/pages/TenantDetail.tsx` → no matches.

Approve to switch to build mode and apply.
