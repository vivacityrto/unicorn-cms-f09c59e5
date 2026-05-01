## Wire `/client/reports` to display released audit reports

Replace the placeholder card in `src/pages/client/ClientReportsWrapper.tsx` with a real list of released audits, gated by the existing `tenant_read_v2` RLS policy. Page header stays untouched.

### 1. New hook: `src/hooks/useReleasedAudits.ts`

```ts
useQuery({
  queryKey: ['client-released-audits'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('client_audits')
      .select(`
        id, audit_type, snapshot_rto_name, snapshot_rto_number,
        snapshot_cricos_code, conducted_at, score_pct, score_total,
        score_max, risk_rating, report_pdf_path, report_released_at,
        report_release_notes, report_acknowledged_at
      `)
      .order('report_released_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 60_000,
})
```

No client-side filter — RLS filters to released, tenant-visible rows.

### 2. New component: `src/components/client/ReleasedAuditCard.tsx`

Single card per audit. Composition:

- **Header row** (flex, wraps): `AUDIT_TYPE_LABELS[audit_type]` as bold title + `<AuditRiskBadge risk={risk_rating} />` + (right-aligned) `Released DD MMM YYYY` from `report_released_at`.
- **Sub-line**: `snapshot_rto_name` (fallback "—") · `RTO {snapshot_rto_number}` if present · `CRICOS {snapshot_cricos_code}` if present. Muted text.
- **Score line** (only if `score_pct != null`): `"{score_pct}%"` plus `" ({score_total}/{score_max})"` if both numerator/denominator present. Bold percent, muted parenthetical.
- **Release notes** (only if `report_release_notes`): italic, `text-sm text-muted-foreground`, max 3 lines via `line-clamp-3`.
- **Footer actions** (right-aligned):
  - `Download PDF` — primary cyan button. Disabled when `!report_pdf_path`. On click: `supabase.storage.from('audit-reports').createSignedUrl(report_pdf_path, 600)` → `window.open(signedUrl, '_blank', 'noopener')`. Toast on error: "Couldn't open the PDF. Try again in a moment."
  - `Acknowledge` — `variant="outline"`, only rendered when `report_acknowledged_at == null`. Wrapped in a `Tooltip` saying "Coming soon — acknowledge flow ships in Phase 3." `disabled` + onClick noop. When `report_acknowledged_at` is set, render a small green check chip: `Acknowledged DD MMM YYYY`.

Date helper inline: `new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })`.

### 3. Rewrite `src/pages/client/ClientReportsWrapper.tsx`

```text
ClientLayout
  Header (existing — keep "Reports" + subtitle)
  ── if isLoading: 3 × skeleton cards (Card + CardContent w/ Skeleton lines)
  ── if error: Card with red AlertTriangle + "Couldn't load your reports. Try refreshing."
  ── if data.length === 0:
       Existing empty-state Card (BarChart3 icon + "Reports will be
       available here.") + new subtitle paragraph: "Once your consultant
       releases an audit report, it will appear here."
  ── else:
       <div className="space-y-4">
         {data.map(a => <ReleasedAuditCard key={a.id} audit={a} />)}
       </div>
  Coming-soon block (always rendered, below):
    Card (border-dashed)
      Title: "Assessment Validation"
      Body: "We're building an assessment validation tool to give you
             deeper insight into how your assessments are performing.
             Coming soon."
      No action button.
```

### 4. No DB / RLS / storage changes

- Read query relies on the existing `tenant_read_v2` policy on `client_audits`.
- Storage bucket `audit-reports` is private; signed URLs are generated client-side. The brief flags storage-RLS verification as a Phase 2 follow-up — leave as-is since paths embed the audit UUID and aren't guessable.
- No migrations, no edge functions, no edits to `useAuditReport.ts`.

### Acceptance

- Empty tenant → original placeholder card with the new subtitle, plus the "Assessment Validation — Coming soon" card below.
- Tenant with N released audits → N cards, newest first, each with audit type, risk badge, RTO/CRICOS line, release date, score line (when present), optional release notes, working `Download PDF` opening the signed URL in a new tab, and an `Acknowledge` button that's disabled with a "coming soon" tooltip when `report_acknowledged_at IS NULL`.
- Audits without `report_pdf_path` show a disabled Download PDF button (tooltip: "PDF not generated yet").
- Loading and error states render gracefully (skeletons / error card).
- No client-side `.eq('report_client_visible', true)` filters — RLS does that.
