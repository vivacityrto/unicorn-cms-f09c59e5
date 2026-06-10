## Scope
Edit exactly two files — no DB or edge-function config changes.

### 1. `supabase/functions/generate-membership-certificate/index.ts`
- Update the tenants query (line 125) from `.select("name")` to `.select("name, rto_name")`.
- After the tenant lookup (after line 131), compute the download filename:
  - Use `rto_name`, falling back to `name`, then `"Vivacity"`.
  - Sanitise by stripping `[/\\?%*:|"<>]`.
  - Result: `<SafeName>-SuperHero-Membership-Certificate.pdf`.
- Replace the hardcoded `Content-Disposition` header (line 198) with the dynamic filename.

### 2. `src/pages/client/MembershipCertificatePage.tsx`
- In `handleDownload`, inside the `res.ok && contentType.includes("application/pdf")` branch, extract the filename from the response `Content-Disposition` header.
- Parse `filename="…"` with a regex; fall back to `"SuperHero-Membership-Certificate.pdf"`.
- Replace the hardcoded `a.download = "vivacity-membership-certificate.pdf"` with the parsed filename.

No other files or logic are changed.