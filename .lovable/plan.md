

## Make Tenant Logo Placeholder Visible on Gradient Header

### File: `src/components/tenant/TenantLogoUpload.tsx`

**Changes:**
1. Increase avatar from `h-12 w-12` to `h-16 w-16`
2. Change border to `border-2 border-white/40` for visibility on gradient
3. Add dashed border style for empty state: `border-dashed` when no logo
4. Change fallback background to `bg-white/20` with `text-white/60` icon
5. Update buttons to use white text: `text-white/80 hover:text-white hover:bg-white/10`
6. Add "Logo" label in white text

This is a single-file change to `TenantLogoUpload.tsx` only -- the component is already correctly placed in `TenantDetail.tsx`.

