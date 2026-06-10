## Objective
Update the `generate-certificate-pdf` edge function so that signed URLs include a `download` option, causing the browser to save the file as `{rto_name}-SuperHero-Membership-Certificate.pdf`.

## Changes

### File: `supabase/functions/generate-certificate-pdf/index.ts`

1. **Tenant lookup (after cert fetch, before step 5)**
   Query the `tenants` table for `rto_name` and `name` using `cert.tenant_id`.
   - If found, use `rto_name || name || "Vivacity"` as the base name.
   - Sanitize the name by stripping `[/\\?%*:|"<>]` and trimming.
   - Construct `downloadFilename = "${safeRtoName}-SuperHero-Membership-Certificate.pdf"`.

2. **Fast path (step 5, lines 94–96)**
   Change:
   ```ts
   .createSignedUrl(cert.storage_path, SIGNED_URL_TTL);
   ```
   To:
   ```ts
   .createSignedUrl(cert.storage_path, SIGNED_URL_TTL, { download: downloadFilename });
   ```

3. **New generation path (step 6f, lines 187–189)**
   Change:
   ```ts
   .createSignedUrl(storagePath, SIGNED_URL_TTL);
   ```
   To:
   ```ts
   .createSignedUrl(storagePath, SIGNED_URL_TTL, { download: downloadFilename });
   ```

No other logic or files are modified.