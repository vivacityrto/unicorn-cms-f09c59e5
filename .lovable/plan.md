## Plan: Add "Sync Contact Details" dropdown + Australia default

**File:** `src/components/client/ClientProfileForm.tsx`

### 1. Imports
- Add `RefreshCw` from `lucide-react`.
- Add `Button` from `@/components/ui/button`.
- Add `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem` from `@/components/ui/dropdown-menu`.
- Add `useToast` from `@/hooks/use-toast`.

### 2. Australia default (line 91-96 useEffect)
Change:
```ts
if (profile) {
  setFormData({ ...profile, country: profile.country || 'Australia' });
  setHasChanges(false);
}
```
No dirty flag — only user edits trigger `handleChange`.

### 3. Sync handler
Add `syncing` state and `handleSyncContact(role: 'primary' | 'secondary')`:
- Guard: bail if no `formData.tenant_id`.
- Set `syncing = true`.
- Query `tenant_users`:
  - Primary: `.eq('tenant_id', tid).eq('relationship_role','primary_contact').order('created_at').limit(1).maybeSingle()`
  - Secondary: `.eq('tenant_id', tid).eq('secondary_contact', true).limit(1).maybeSingle()`
- If no row / no `user_id`, toast: `"No {Primary|Secondary} Contact assigned to this client yet."` and return.
- Fetch `users` row by `user_uuid` (select `first_name, last_name, email, phone, mobile_phone`).
- `setFormData(prev => ({ ...prev, primary_contact_name: \`${first} ${last}\`.trim(), primary_contact_email: email, primary_contact_phone: phone || mobile_phone }))` and `setHasChanges(true)`.
- Finally `setSyncing(false)`.

### 4. CardHeader UI (Contact & Profile card, line 329-331)
Convert to a flex row with title on the left and DropdownMenu trigger on the right:
```tsx
<CardHeader className="flex flex-row items-center justify-between space-y-0">
  <CardTitle className="text-lg">Contact & Profile</CardTitle>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" disabled={syncing || loading || !formData.tenant_id}>
        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
        Sync Contact Details
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="bg-background">
      <DropdownMenuItem onClick={() => handleSyncContact('primary')}>Sync from Primary Contact</DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleSyncContact('secondary')}>Sync from Secondary Contact</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</CardHeader>
```

### Non-changes
- Contact & Profile fields untouched.
- Organisation Details card untouched.
- No auto-save.