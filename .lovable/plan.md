### Goal
Apply three targeted performance and UX improvements to `src/pages/ClientDetail.tsx`.

### Changes
1. **Parallelise `fetchTenantBasic`**
   - Run `tenants` and `tenant_profile` queries concurrently via `Promise.all`.
   - Maintain existing error handling (`if (error) throw error`) and state updates.

2. **Parallelise `fetchPrimaryContact`**
   - First `Promise.all` to fetch both `primary_contact` and `secondary_contact` `tenant_users` rows in parallel.
   - Second `Promise.all` to fetch the corresponding `users` detail rows in parallel.
   - Maintain existing state updates and fallback to empty string for missing secondary contact.

3. **Replace loading skeleton**
   - Swap the current generic skeleton block with one that mirrors the real page layout: header section with back button placeholder, logo circle, title/subtitle lines, tab row, and two content-area skeleton blocks.

### Scope
- Only `src/pages/ClientDetail.tsx` is modified.
- No logic, state, or component structure changes beyond the three items above.