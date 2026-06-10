Scope: src/pages/superadmin/AcademyCertificatesPage.tsx only. No other files.

Current behaviour: the Download PDF dropdown item opens `c.public_url` directly, bypassing the edge function. This yields a stale signed URL without an embedded download filename.

New behaviour: always call the `generate-certificate-pdf` edge function on every download click. The edge function re-signs the URL with the correct filename; no PDF is regenerated if one already exists.

Changes:
1. Add `const [downloadingId, setDownloadingId] = useState<number | null>(null);` near the other `useState` declarations.
2. Add a `handleDownload` async function before the `return` statement. It invokes the edge function with `{ certificate_id: cert.id }`, opens the returned `public_url` in a new tab, and manages `downloadingId` state with loading / error toasts.
3. Replace the Download PDF `<DropdownMenuItem>` block (currently lines 353–356) with one that calls `handleDownload(c)`, disables while generating, and shows "Generating…" or "Download PDF".

No database or edge-function changes required.