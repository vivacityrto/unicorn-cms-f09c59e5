## Change

File: `src/pages/academy/AcademyCertificatesPage.tsx`

In the `handleDownload` function, remove the 4-line short-circuit that opens `cert.public_url` directly (lines 89–92). After the change, every download click will always invoke the `generate-certificate-pdf` edge function, which handles re-signing efficiently via its fast path and embeds the correct `download` filename.

The rest of `handleDownload` (error handling, `generatingId` state, query cache update, etc.) stays exactly the same.