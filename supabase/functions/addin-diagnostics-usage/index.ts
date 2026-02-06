import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  errorResponse, 
  verifyAddinToken, 
  createAdminClient 
} from "../_shared/addin-auth.ts";

const FUNCTION_NAME = 'addin-diagnostics-usage';

// Only Super Admin can access diagnostics
const SUPER_ADMIN_ROLES = ['Super Admin', 'SuperAdmin'];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only GET requests are allowed');
  }

  try {
    // Verify token
    const authResult = await verifyAddinToken(req.headers.get('Authorization'), FUNCTION_NAME);
    if (!authResult.success) {
      return errorResponse(
        authResult.error!.status,
        authResult.error!.code,
        authResult.error!.message
      );
    }

    const tokenPayload = authResult.payload!;

    // Enforce SuperAdmin role
    if (!SUPER_ADMIN_ROLES.includes(tokenPayload.role)) {
      console.warn(`[${FUNCTION_NAME}] Access denied for role: ${tokenPayload.role}, user: ${tokenPayload.email}`);
      return errorResponse(403, 'FORBIDDEN', 'Access restricted to SuperAdmins only.');
    }

    // Parse query params for date range
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    // Default to last 7 days if not specified
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 7);
    defaultFrom.setHours(0, 0, 0, 0);

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom;
    const toDate = toParam ? new Date(toParam) : now;

    const supabaseAdmin = createAdminClient();

    // Query addin_audit_log for usage counts
    const { data: auditLogs, error: auditError } = await supabaseAdmin
      .from('addin_audit_log')
      .select('action')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (auditError) {
      console.error(`[${FUNCTION_NAME}] Error querying addin_audit_log:`, auditError);
      return errorResponse(500, 'DATABASE_ERROR', 'Failed to fetch usage data');
    }

    // Count by action type
    const counts = {
      addin_opened: 0,
      actions_executed: 0,
      actions_failed: 0,
    };

    for (const log of auditLogs || []) {
      if (log.action === 'addin_opened') {
        counts.addin_opened++;
      } else if (log.action === 'addin_action_executed') {
        counts.actions_executed++;
      } else if (log.action === 'addin_action_failed') {
        counts.actions_failed++;
      }
    }

    // Query audit_events for top failure codes
    const { data: failureEvents, error: failureError } = await supabaseAdmin
      .from('audit_events')
      .select('details')
      .eq('entity', 'addin')
      .like('action', '%_failed')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (failureError) {
      console.error(`[${FUNCTION_NAME}] Error querying audit_events:`, failureError);
      // Continue without failure stats
    }

    // Aggregate failure codes
    const failureCounts: Record<string, number> = {};
    for (const event of failureEvents || []) {
      const details = event.details as Record<string, unknown> | null;
      const code = (details?.error_code as string) || 'UNKNOWN';
      failureCounts[code] = (failureCounts[code] || 0) + 1;
    }

    // Sort by count descending and take top 10
    const topFailures = Object.entries(failureCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const response = {
      range: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      counts,
      top_failures: topFailures,
    };

    console.log(`[${FUNCTION_NAME}] Usage stats retrieved by ${tokenPayload.email}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(`[${FUNCTION_NAME}] Unexpected error:`, err);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
});
