## Goal
Add a "ComplyHub" external-link menu item to the client portal sidebar (`src/components/client/ClientSidebar.tsx`), directly below the existing "Vivacity Academy" external-link block. The item links to the tenant’s configured ComplyHub URL (or a default fallback) and opens in a new tab.

## Changes

### 1. Import additions
- Add `Shield` to the `lucide-react` import block.
- Add `useQuery` from `@tanstack/react-query`.
- Add `supabase` from `@/integrations/supabase/client`.

### 2. ComplyHub URL query hook
Inside `ClientSidebar`, after the existing `useAuth` / `useClientTenant` / `useHelpCenter` hooks, add:

```tsx
const { data: complyhubData } = useQuery({
  queryKey: ["client-sidebar-complyhub-url", activeTenantId],
  queryFn: async () => {
    const { data } = await supabase
      .from("tenants")
      .select("complyhub_url")
      .eq("id", activeTenantId)
      .single();
    return data;
  },
  enabled: !!activeTenantId,
  staleTime: 5 * 60 * 1000,
});

const complyhubUrl = complyhubData?.complyhub_url?.trim() || "https://rto.complyhub.ai/";
```

### 3. Render new menu item
Immediately after the closing `</a>` of the Academy block (after line 195, before the "Items after Academy" comment), insert a new `<a>` element that mirrors the Academy block exactly except:

- No conditional wrapper (always rendered)
- `href={complyhubUrl}`
- Icon: `<Shield className="w-3.5 h-3.5 text-white" />` inside the same gradient icon box
- Label: "ComplyHub"
- Same Tailwind classes, hover states, collapse behaviour, and `<ExternalLink>` trailing icon

### 4. What is NOT changed
- No new routes, no DB migrations, no RLS changes, no modifications to `ComplyHubCard.tsx`, `useClientTenant`, or any other file.
- Staff `TopBar.tsx` untouched.

## Verification
- Tenant with `complyhub_url` set → sidebar shows "ComplyHub", clicking opens that URL in new tab.
- Tenant with `complyhub_url` NULL → sidebar shows "ComplyHub", clicking opens `https://rto.complyhub.ai/`.
- Collapsed sidebar → only Shield icon shows.
- `tenants` SELECT fires once on load (cached by staleTime).
- Console clean, no orphan imports.