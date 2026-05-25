## Goal
Add a `generate-certificate-pdf` Supabase Edge Function that lazily generates a branded A4 landscape PDF using `pdf-lib` and an existing PNG template, stores it in the private `academy-certificates` bucket, persists `storage_path` + `public_url` on `academy_certificates`, and returns a fresh signed URL. Wire the Academy Certificates page Download button to invoke it when `public_url` is null.

No DB migration. No RLS or schema changes. No new tables.

## Pre-flight verified
- `supabase/functions/invite-user/index.ts` — canonical pattern: service-role client, `getUser(callerToken)`, `jsonResponse`, shared `corsHeaders`.
- `supabase/functions/_shared/cors.ts` exists.
- `public.users` has `user_uuid`, `first_name`, `last_name`, `is_vivacity_internal`.
- Buckets `academy-certificates` and `doc-templates` both exist and are private (signed URLs required — aligns with spec).
- `academy_certificates` already has `storage_path`, `public_url`, `metadata` (JSONB), `certificate_number`, `tenant_id`, `course_id`, `user_id`, `issued_at`.
- Frontend page already conditionally renders Download vs disabled-with-tooltip; we extend the null-`public_url` branch only.

## Edge Function — `supabase/functions/generate-certificate-pdf/index.ts`

Mirror invite-user structure: `serve`, OPTIONS preflight, service-role client, `jsonResponse(status, body)` helper, single try/catch, all errors return `{ ok:false, code, detail }` with appropriate HTTP status.

Flow:
1. **Auth**: Extract `Authorization` Bearer token → 401 `NO_AUTH` if missing. `supabase.auth.getUser(token)` → 401 `AUTH_FAILED` on error.
2. **Body validation**: parse `{ certificate_id: number }`; reject non-number with 400.
3. **Fetch cert**: select `id, user_id, tenant_id, certificate_number, issued_at, metadata, storage_path, public_url, course_id` from `academy_certificates` where `id = certificate_id`. Missing → 404 `NOT_FOUND`.
4. **Authorise**: allow if `cert.user_id === callerUser.id`, OR look up caller's `users` row by `user_uuid = callerUser.id` and check `is_vivacity_internal = true`. Otherwise 403 `FORBIDDEN`.
5. **Fast path (already generated)**: if `cert.storage_path` is set, call `storage.from('academy-certificates').createSignedUrl(storage_path, 157680000)`. Update row's `public_url`. Return `{ ok:true, data:{ public_url } }`. Skip PDF regeneration.
6. **Generate path**:
   - Resolve **recipient name**: prefer `metadata.recipient_full_name`; else query `users` by `user_uuid = cert.user_id` → `${first_name} ${last_name}` (trim); else `'Valued Learner'`.
   - Resolve **course title**: prefer `metadata.course_title`; else query `academy_courses.title` where `id = cert.course_id`; fallback `Course ${course_id}`.
   - Download template: `storage.from('doc-templates').download('academy/certificate-template-a4.png')` (service-role bypasses RLS, bucket is private). On error → 500 `TEMPLATE_FETCH_FAILED`.
   - Build PDF with `pdf-lib` (`https://esm.sh/pdf-lib@1.17.1`):
     - `PDFDocument.create()`
     - `addPage([841.89, 595.28])`
     - `embedPng(templateBytes)` drawn at `(0, 0, 841.89, 595.28)`
     - `embedFont(StandardFonts.Helvetica)` and `StandardFonts.HelveticaBold`
     - Helper `drawCentered(text, font, size, color, y)` using `font.widthOfTextAtSize(text, size)` centered on `x = 560 - width/2`.
     - Draw the five lines per spec at y = 335, 295, 260, 228, 190 with the specified fonts/sizes/colors. Date formatted as `DD Month YYYY` using `toLocaleDateString('en-AU', { day:'2-digit', month:'long', year:'numeric' })` from `cert.issued_at` (fallback to `new Date()`).
     - Wrap PDF assembly in try/catch → 500 `PDF_GENERATION_FAILED`.
   - **Upload**: path `${cert.tenant_id}/${cert.certificate_number}.pdf` to `academy-certificates`, contentType `application/pdf`, `upsert: true`. On error → 500 `UPLOAD_FAILED`.
   - **Signed URL**: `createSignedUrl(path, 157680000)`.
   - **Persist**: update `academy_certificates` set `storage_path`, `public_url` where `id = certificate_id`.
   - Return `{ ok:true, data:{ public_url: signedUrl } }`.

Notes / hardening:
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already injected for all functions).
- Service-role client deliberately used — caller auth is enforced manually (step 1+4), matching invite-user.
- No SQL functions created, so the `search_path = ''` rule is N/A (it's a Deno function). Plan's "search_path = ''" clause applies only if SQL functions were added; none are.
- `upsert:true` makes regeneration idempotent (defensive even though fast-path skips it).
- Errors never throw raw — always `jsonResponse` with documented code.

## Frontend — `src/pages/academy/AcademyCertificatesPage.tsx`

Surgical changes only:
1. Imports: add `useState` from react, `useQueryClient` from `@tanstack/react-query`, `toast` from `sonner`, `Loader2` from `lucide-react`.
2. Inside component: `const qc = useQueryClient();` and `const [generatingId, setGeneratingId] = useState<number | null>(null);`.
3. Convert `handleDownload` to async. When `cert.public_url` exists, current behaviour unchanged. When null:
   - `setGeneratingId(cert.id)`
   - `await supabase.functions.invoke('generate-certificate-pdf', { body: { certificate_id: cert.id }})`
   - If error or `!data?.ok` → `toast.error('Could not generate certificate. Please try again.')`
   - Else: `window.open(data.data.public_url, '_blank', 'noopener,noreferrer')` and update the cached list via `qc.setQueryData(['academy-my-certificates', userId], …)` to splice in the new `public_url` for this cert (so subsequent clicks take the fast path and tooltip/disabled state vanishes).
     - Need `userId` from `useAcademyActingUserId()` to build the key — add that call.
   - `finally { setGeneratingId(null) }`.
4. Replace the disabled tooltip branch (lines 209–225) with an active Button: `onClick={() => handleDownload(cert)}`, `disabled={generatingId === cert.id}`, content swaps to `<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...` while loading, else `<Download/> Download`. Remove the Tooltip wrapper (no longer needed) and the `Tooltip*` imports if unused.

No other components, hooks, or queries touched. `AcademyCertificateCard.tsx`, `useAcademyCertificates`, summary stats, layout — all untouched.

## Risk assessment
- **Backward compat**: existing certs with `public_url` set follow unchanged code path. The function only writes to `storage_path`/`public_url` on the targeted row.
- **RLS / FK**: no policy or constraint changes. Service-role writes bypass RLS but are gated by explicit authorisation check.
- **Signed URL lifetime**: 5 years matches spec; if storage TTL policy changes later, fast path re-signs anyway on each request.
- **Template missing**: surfaced as `TEMPLATE_FETCH_FAILED` with toast — no silent failure. User-visible action needed only if the asset is genuinely absent in `doc-templates/academy/certificate-template-a4.png`.
- **Concurrency**: two simultaneous clicks could both generate; `upsert:true` + deterministic path (`{tenant_id}/{certificate_number}.pdf`) make this idempotent.
- **Audit**: generation events are not logged to an audit table (not requested). Storage write itself is observable via storage logs; consider a follow-up audit hook if required.
- **PII**: PDFs land in a private bucket; access only via signed URL handed to the authorised caller.

## Deliverables
- New file: `supabase/functions/generate-certificate-pdf/index.ts`
- Edited file: `src/pages/academy/AcademyCertificatesPage.tsx`
- No migration, no config.toml change (default `verify_jwt=false` is fine — we validate in code).
