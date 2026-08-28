/**
 * RETIRED — dead-code cleanup follow-up (28 Aug 2026).
 *
 * Read from compliance_audits/compliance_templates/compliance_audit_responses/
 * compliance_corrective_actions — a legacy audit-instance schema fully
 * superseded by client_audits, which generate-client-audit-report/
 * generate-client-audit-report-docx use instead. compliance_audits had zero
 * rows in production throughout its life; the entire legacy Compliance
 * Auditor UI it served (ComplianceAuditGlobal/List/Form/Report pages, the
 * "Compliance Auditor" sidebar link) was retired in the same change. The
 * shared question-bank tables (compliance_templates and its sections/
 * questions) are NOT affected — they remain live, read by the current
 * Audits workflow (useAuditWorkspace.ts) as its template/question source.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "This function has been retired (28 Aug 2026) — the legacy Compliance Auditor workflow it served has been fully retired. Use generate-client-audit-report instead.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
