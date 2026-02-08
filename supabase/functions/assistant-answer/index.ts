 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
 };
 
 // Report types and their required data sources
 const REPORT_TYPES = {
   'client_engagement_overview': {
     title: 'Client Engagement Overview',
     description: 'Summary of client engagement activities and status',
   },
   'package_utilisation_summary': {
     title: 'Package Utilisation Summary',
     description: 'Hours used, remaining, and package status',
   },
   'phase_progression_timeline': {
     title: 'Phase Progression Timeline',
     description: 'Document and phase completion status over time',
   },
   'decisions_approvals_log': {
     title: 'Decisions and Approvals Log',
     description: 'Record of approvals and key decisions',
   },
   'risks_unresolved_actions': {
     title: 'Risks and Unresolved Actions Summary',
     description: 'Open risks and pending action items',
   },
   'eos_engagement_summary': {
     title: 'EOS Engagement Summary',
     description: 'Rocks, meetings, and EOS activity summary',
   },
 };
 
 // Fields to always redact from responses
 const REDACTION_PATTERNS = [
   'email_body',
   'chat_log',
   'meeting_transcript',
   'evidence_content',
   'learner_data',
   'pricing',
   'health_leave',
 ];
 
 serve(async (req) => {
   // Handle CORS preflight
   if (req.method === 'OPTIONS') {
     return new Response('ok', { headers: corsHeaders });
   }
 
   try {
     // Get auth header
     const authHeader = req.headers.get('Authorization');
     if (!authHeader?.startsWith('Bearer ')) {
       return new Response(
         JSON.stringify({ error: 'Unauthorized' }),
         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // Create Supabase client
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
     const supabase = createClient(supabaseUrl, supabaseAnonKey, {
       global: { headers: { Authorization: authHeader } }
     });
 
     // Verify user
     const token = authHeader.replace('Bearer ', '');
     const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
     if (claimsError || !claimsData?.claims) {
       return new Response(
         JSON.stringify({ error: 'Unauthorized' }),
         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     const userId = claimsData.claims.sub;
 
     // Verify SuperAdmin status
     const { data: userData, error: userError } = await supabase
       .from('users')
       .select('unicorn_role, global_role')
       .eq('user_uuid', userId)
       .single();
 
     if (userError || !userData) {
       return new Response(
         JSON.stringify({ error: 'User not found' }),
         { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
      // Check for Vivacity internal access (Super Admin, Team Leader, Team Member)
      const isVivacityInternal = ['Super Admin', 'Team Leader', 'Team Member'].includes(userData.unicorn_role || '') 
        || userData.global_role === 'SuperAdmin';
      
      if (!isVivacityInternal) {
        // Log denied access
        const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await serviceClient.from('audit_ask_viv_access_denied').insert({
          user_id: userId,
          user_role: userData.unicorn_role || userData.global_role || 'unknown',
          endpoint: 'assistant-answer',
          reason: 'not_vivacity_internal',
        });
        
        return new Response(
          JSON.stringify({ 
            error: 'FORBIDDEN',
            code: 'ASK_VIV_ACCESS_DENIED',
            message: 'Ask Viv is restricted to Vivacity Team members.' 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
 
     // Parse request body
     const body = await req.json();
     const { type, query, threadId, reportType, clientTenantId, dateRange } = body;
 
     let response: any;
     let action: string;
     let sourcesUsed: string[] = [];
     let redactionsApplied: string[] = [];
 
     if (type === 'chat') {
       // Handle chat query
       action = 'chat_query';
       response = await handleChatQuery(supabase, query, userId);
       sourcesUsed = response.sources || [];
       
       if (response.refusal) {
         action = 'refusal';
       }
     } else if (type === 'report') {
       // Handle report generation
       action = 'report_generate';
       
       if (!reportType || !REPORT_TYPES[reportType as keyof typeof REPORT_TYPES]) {
         return new Response(
           JSON.stringify({ error: 'Invalid report type' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
 
       if (!clientTenantId) {
         return new Response(
           JSON.stringify({ error: 'Client tenant ID required for report generation' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
 
       response = await generateReport(supabase, reportType, clientTenantId, dateRange);
       sourcesUsed = response.dataSources || [];
       redactionsApplied = response.redactions || [];
     } else {
       return new Response(
         JSON.stringify({ error: 'Invalid request type. Use "chat" or "report".' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // Log to audit
     await supabase.from('assistant_audit_log').insert({
       viewer_user_id: userId,
       thread_id: threadId || null,
       action,
       client_tenant_id: clientTenantId || null,
       report_type: reportType || null,
       sources_used: sourcesUsed,
       redactions_applied: redactionsApplied,
       request_text: query || `Report: ${reportType}`,
       response_summary: response.summary || response.answer?.substring(0, 500) || 'Report generated',
     });
 
     return new Response(
       JSON.stringify(response),
       { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error) {
     console.error('Assistant error:', error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });
 
 // Handle chat queries with knowledge retrieval
 async function handleChatQuery(supabase: any, query: string, userId: string) {
   // Search for relevant knowledge items
   const { data: knowledgeItems, error: searchError } = await supabase
     .rpc('search_knowledge_items', {
       p_search_query: query,
       p_source_types: null,
       p_limit: 5
     });
 
   if (searchError) {
     console.error('Knowledge search error:', searchError);
   }
 
   // If no knowledge found, return refusal
   if (!knowledgeItems || knowledgeItems.length === 0) {
     return {
       answer: "I couldn't find any approved internal documentation related to your question. I can only answer questions based on approved internal policies, procedures, and documentation. Please refine your question or contact your team lead for assistance.",
       sources: [],
       refusal: true,
     };
   }
 
   // Build context from knowledge items
   const context = knowledgeItems.map((item: any) => 
     `[${item.source_type}] ${item.title} (v${item.version}):\n${item.content}`
   ).join('\n\n---\n\n');
 
   const sources = knowledgeItems.map((item: any) => ({
     id: item.id,
     type: item.source_type,
     title: item.title,
     version: item.version,
   }));
 
   // Call OpenAI to generate answer based on retrieved content
   const openaiKey = Deno.env.get('OPENAI_API_KEY');
   if (!openaiKey) {
     return {
       answer: "AI service is not configured. Please contact your administrator.",
       sources,
       refusal: true,
     };
   }
 
   const systemPrompt = `You are an internal AI assistant for Unicorn 2.0, Vivacity Coaching & Consulting's compliance management platform.
 
 CRITICAL RULES:
 1. ONLY answer based on the provided context from approved internal documentation.
 2. NEVER use external internet knowledge.
 3. NEVER provide compliance judgements or assessments beyond what is explicitly stated in the documentation.
 4. NEVER infer, guess, or speculate.
 5. If the context doesn't contain enough information to answer, say so clearly.
 6. Reference which sources you used in your answer.
 7. Be concise and professional.
 8. For regulatory questions, only reference Standards for RTOs 2025, CRICOS National Code, and GTO guidance.
 9. NEVER reference Standards for RTOs 2015.
 
 Your role is to help SuperAdmins understand internal procedures, EOS processes, and platform documentation.`;
 
   const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${openaiKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       model: 'gpt-4o-mini',
       messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: `Based on the following approved internal documentation:\n\n${context}\n\nAnswer this question: ${query}` }
       ],
       temperature: 0.3,
       max_tokens: 1000,
     }),
   });
 
   if (!openaiResponse.ok) {
     const errorText = await openaiResponse.text();
     console.error('OpenAI error:', errorText);
     return {
       answer: "There was an error processing your request. Please try again.",
       sources,
       refusal: true,
     };
   }
 
   const aiData = await openaiResponse.json();
   const answer = aiData.choices?.[0]?.message?.content || "No response generated.";
 
   return {
     answer,
     sources,
     refusal: false,
   };
 }
 
 // Generate client summary reports
 async function generateReport(supabase: any, reportType: string, clientTenantId: number, dateRange?: { start?: string; end?: string }) {
   const reportConfig = REPORT_TYPES[reportType as keyof typeof REPORT_TYPES];
   const dataSources: string[] = [];
   const redactions: string[] = [];
   const sections: any[] = [];
   const knownGaps: string[] = [];
 
   // Get client info
   const { data: tenant, error: tenantError } = await supabase
     .from('tenants')
     .select('id, name, rto_id, status, created_at')
     .eq('id', clientTenantId)
     .single();
 
   if (tenantError || !tenant) {
     return { error: 'Client not found', dataSources: [], redactions: [] };
   }
 
   dataSources.push('tenants');
 
   // Base report header
   const report = {
     reportType: reportConfig.title,
     scope: reportConfig.description,
     clientIdentifier: tenant.name,
     clientRtoId: tenant.rto_id,
     timePeriod: dateRange ? `${dateRange.start || 'All time'} to ${dateRange.end || 'Present'}` : 'All time',
     generatedAt: new Date().toISOString(),
     sections: [] as any[],
     knownGaps: [] as string[],
     dataSources: [] as string[],
     redactions: [] as string[],
    summary: '',
   };
 
   // Build report based on type
   switch (reportType) {
     case 'client_engagement_overview':
       await buildEngagementOverview(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps);
       break;
     case 'package_utilisation_summary':
       await buildPackageUtilisation(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps);
       break;
     case 'phase_progression_timeline':
       await buildPhaseProgression(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps);
       break;
     case 'decisions_approvals_log':
       await buildDecisionsLog(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps, redactions);
       break;
     case 'risks_unresolved_actions':
       await buildRisksSummary(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps);
       break;
     case 'eos_engagement_summary':
       await buildEosSummary(supabase, clientTenantId, dateRange, sections, dataSources, knownGaps);
       break;
   }
 
   report.sections = sections;
   report.knownGaps = knownGaps;
   report.dataSources = dataSources;
   report.redactions = redactions;
   report.summary = `${reportConfig.title} for ${tenant.name}. ${sections.length} sections generated.`;
 
   return report;
 }
 
 // Report builders
 async function buildEngagementOverview(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[]) {
   // Get package instances
   const { data: packages } = await supabase
     .from('package_instances')
     .select('id, package_id, start_date, end_date, is_complete, hours_used, hours_included, hours_added')
     .eq('tenant_id', tenantId);
   
   dataSources.push('package_instances');
 
   // Get notes count (not content)
   const { count: notesCount } = await supabase
     .from('notes')
     .select('*', { count: 'exact', head: true })
     .eq('tenant_id', tenantId);
   
   dataSources.push('notes (count only)');
 
   sections.push({
     title: 'Package Summary',
     data: {
       totalPackages: packages?.length || 0,
       activePackages: packages?.filter((p: any) => !p.is_complete).length || 0,
       completedPackages: packages?.filter((p: any) => p.is_complete).length || 0,
     }
   });
 
   sections.push({
     title: 'Engagement Activity',
     data: {
       totalNotes: notesCount || 0,
     }
   });
 }
 
 async function buildPackageUtilisation(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[]) {
   const { data: packages } = await supabase
     .from('package_instances')
     .select(`
       id, start_date, end_date, is_complete,
       hours_used, hours_included, hours_added,
       packages:package_id (name)
     `)
     .eq('tenant_id', tenantId);
   
   dataSources.push('package_instances', 'packages');
 
   if (!packages || packages.length === 0) {
     knownGaps.push('No package instances found for this client');
     return;
   }
 
   sections.push({
     title: 'Package Utilisation',
     data: packages.map((pkg: any) => ({
       package: pkg.packages?.name || 'Unknown',
       startDate: pkg.start_date,
       endDate: pkg.end_date,
       status: pkg.is_complete ? 'Completed' : 'Active',
       hoursIncluded: pkg.hours_included || 0,
       hoursAdded: pkg.hours_added || 0,
       hoursUsed: pkg.hours_used || 0,
       hoursRemaining: ((pkg.hours_included || 0) + (pkg.hours_added || 0)) - (pkg.hours_used || 0),
       utilisationPercent: pkg.hours_included ? Math.round(((pkg.hours_used || 0) / ((pkg.hours_included || 0) + (pkg.hours_added || 0))) * 100) : 0,
     }))
   });
 }
 
 async function buildPhaseProgression(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[]) {
   const { data: documents } = await supabase
     .from('documents')
     .select('id, doc_name, status, created_at, updated_at')
     .eq('tenant_id', tenantId)
     .order('created_at', { ascending: true });
   
   dataSources.push('documents');
 
   if (!documents || documents.length === 0) {
     knownGaps.push('No documents found for this client');
     return;
   }
 
   const statusCounts = documents.reduce((acc: any, doc: any) => {
     acc[doc.status] = (acc[doc.status] || 0) + 1;
     return acc;
   }, {});
 
   sections.push({
     title: 'Document Status Summary',
     data: {
       totalDocuments: documents.length,
       byStatus: statusCounts,
     }
   });
 }
 
 async function buildDecisionsLog(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[], redactions: string[]) {
   // Get approval records - note content is redacted
   const { data: approvals } = await supabase
     .from('audit_events')
     .select('id, action, entity, created_at')
     .eq('action', 'approve')
     .limit(100);
   
   dataSources.push('audit_events (actions only)');
   redactions.push('approval_notes', 'decision_comments');
 
   sections.push({
     title: 'Approvals Summary',
     data: {
       totalApprovals: approvals?.length || 0,
       note: 'Detailed approval notes are redacted for privacy',
     }
   });
 }
 
 async function buildRisksSummary(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[]) {
   // Note: eos_issues may be internal only
   const { data: risks } = await supabase
     .from('eos_issues')
     .select('id, issue_type, title, impact, status, created_at, resolved_at')
     .eq('tenant_id', tenantId)
     .is('deleted_at', null);
   
   dataSources.push('eos_issues');
 
   if (!risks || risks.length === 0) {
     knownGaps.push('No risks or issues found for this client');
     sections.push({
       title: 'Risks & Actions',
       data: { message: 'No risks or issues recorded' }
     });
     return;
   }
 
   const openRisks = risks.filter((r: any) => r.status === 'Open');
   const resolvedRisks = risks.filter((r: any) => r.status === 'Solved');
 
   sections.push({
     title: 'Risks & Opportunities Summary',
     data: {
       total: risks.length,
       open: openRisks.length,
       resolved: resolvedRisks.length,
       byImpact: risks.reduce((acc: any, r: any) => {
         acc[r.impact] = (acc[r.impact] || 0) + 1;
         return acc;
       }, {}),
       openItems: openRisks.map((r: any) => ({
         type: r.issue_type,
         title: r.title,
         impact: r.impact,
         createdAt: r.created_at,
       })),
     }
   });
 }
 
 async function buildEosSummary(supabase: any, tenantId: number, dateRange: any, sections: any[], dataSources: string[], knownGaps: string[]) {
   // Get rocks
   const { data: rocks } = await supabase
     .from('eos_rocks')
     .select('id, title, status, quarter, year')
     .eq('tenant_id', tenantId);
   
   dataSources.push('eos_rocks');
 
   // Get meetings count
   const { count: meetingsCount } = await supabase
     .from('eos_meetings')
     .select('*', { count: 'exact', head: true })
     .eq('tenant_id', tenantId);
   
   dataSources.push('eos_meetings (count only)');
 
   sections.push({
     title: 'EOS Engagement',
     data: {
       totalRocks: rocks?.length || 0,
       rocksByStatus: rocks?.reduce((acc: any, r: any) => {
         acc[r.status] = (acc[r.status] || 0) + 1;
         return acc;
       }, {}) || {},
       totalMeetings: meetingsCount || 0,
     }
   });
 
   if (!rocks || rocks.length === 0) {
     knownGaps.push('No EOS rocks found for this client');
   }
 }