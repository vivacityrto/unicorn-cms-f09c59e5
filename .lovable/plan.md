Revert three files to their pre-certificate-filename state. No other files touched.

## File 1: supabase/functions/generate-certificate-pdf/index.ts
- Remove the tenant RTO-name lookup block (lines 77-88) including `safeRtoName` and `downloadFilename`.
- In the fast-path `createSignedUrl` call (line 110), remove `{ download: downloadFilename }` so only `.createSignedUrl(cert.storage_path, SIGNED_URL_TTL)` remains.
- In the generation-path `createSignedUrl` call (line 203), same change: remove `{ download: downloadFilename }`.

## File 2: src/pages/academy/AcademyCertificatesPage.tsx
- Restore the short-circuit check at the top of `handleDownload` so `cert.public_url` opens directly in a new tab before falling through to the edge-function generation path.

## File 3: src/pages/superadmin/AcademyCertificatesPage.tsx
- Remove the `downloadingId` state declaration.
- Remove the `handleDownload` async function entirely.
- Restore the original Download PDF dropdown item as a simple `window.open(c.public_url || c.storage_path || "", "_blank")` with no loading state or edge-function invocation.

## Technical notes
- No database changes.
- No edge-function changes other than removing the tenant lookup and download-filename parameter.
- All changes are UI/behaviour reverts.