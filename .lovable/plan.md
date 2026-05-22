Amend the ComplyHub sidebar link in ClientSidebar.tsx so it conditionally renders.

1. In `src/components/client/ClientSidebar.tsx`:
   - Change `const complyhubUrl = complyhubData?.complyhub_url?.trim() || "https://rto.complyhub.ai/";` to `const complyhubUrl = complyhubData?.complyhub_url?.trim();` (remove the fallback).
   - Wrap the existing ComplyHub `<a>` block in `{complyhubUrl && (...)}` so the item is hidden when the URL is null or empty.

No other code touched. The `useQuery`, icon, styling, and Vivacity Academy item remain unchanged.