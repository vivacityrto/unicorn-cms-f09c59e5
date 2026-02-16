/**
 * research-evidence-gap-check: Phase 6 – Client Portal Evidence Gap Checker
 *
 * Scans uploaded evidence files for a stage instance and compares
 * against required evidence categories. Flags missing categories only.
 * Does not assess quality or compliance.
 *
 * Input: { tenant_id, stage_instance_id, stage_type? }
 * Auth: Authenticated users with tenant access
 */
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth } from "../_shared/auth-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Keyword mappings for file classification
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Trainer and Assessor Matrix": ["trainer", "assessor", "matrix", "ta matrix", "vocational competency", "currency"],
  "Assessment Tools": ["assessment", "tool", "marking guide", "rubric", "assessment instrument"],
  "LLND Process": ["llnd", "literacy", "numeracy", "digital", "language", "lln"],
  "Industry Engagement Evidence": ["industry", "engagement", "consultation", "employer", "stakeholder"],
  "Marketing Materials": ["marketing", "brochure", "flyer", "course guide", "website", "prospectus"],
  "Third Party Agreements": ["third party", "3rd party", "partnership", "agreement", "mou", "subcontract"],
  "Student Support Evidence": ["student support", "learner support", "wellbeing", "counselling", "pre-enrolment"],
  "Validation Records": ["validation", "moderation", "benchmarking"],
  "Internal Audit Records": ["internal audit", "self-assessment", "monitoring", "evaluation"],
  "Work Placement Evidence": ["work placement", "workplace", "practical placement", "host employer"],
  "Enrolment and Completion Records": ["enrolment", "completion", "student record", "transcript", "issuance"],
  "Complaints and Appeals Records": ["complaint", "appeal", "grievance", "dispute"],
};

async function auditLog(supabase: any, userId: string, jobId: string, action: string, details?: any) {
  await supabase.from("research_audit_log").insert({
    user_id: userId,
    job_id: jobId,
    action,
    details: details || null,
  });
}

function classifyFile(fileName: string, tags: string[], folderPath: string): string[] {
  const searchText = `${fileName} ${tags.join(" ")} ${folderPath}`.toLowerCase();
  const matched: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        matched.push(category);
        break;
      }
    }
  }

  return matched;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", detail: "No token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", detail: authError || "Auth failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenant_id, stage_instance_id, stage_type } = await req.json();

    if (!tenant_id || !stage_instance_id) {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", detail: "tenant_id and stage_instance_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create research job
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id,
        stage_instance_id: stage_instance_id.toString(),
        job_type: "evidence_gap_check",
        status: "queued",
        created_by: user.id,
        standards_version: "Standards for RTOs 2025",
        input_json: { tenant_id, stage_instance_id, stage_type },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Job creation error:", jobError);
      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", detail: "Failed to create job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await auditLog(supabase, user.id, job.id, "gap_check_created", { tenant_id, stage_instance_id });
    await supabase.from("research_jobs").update({ status: "running" }).eq("id", job.id);

    // Step 2: Fetch required categories
    const resolvedStageType = stage_type || "default";
    const { data: requiredCategories } = await supabase
      .from("stage_required_evidence_categories")
      .select("*")
      .or(`stage_type.eq.${resolvedStageType},stage_type.eq.default`)
      .order("mandatory_flag", { ascending: false });

    const categories = requiredCategories || [];

    // Step 3: Fetch uploaded documents for this stage instance
    // Look in portal_documents and document_files for the stage
    const { data: portalDocs } = await supabase
      .from("portal_documents")
      .select("id, file_name, tags, folder_path, document_type, created_at")
      .eq("tenant_id", tenant_id);

    const { data: docFiles } = await supabase
      .from("document_files")
      .select("id, file_name, tags, created_at")
      .eq("stage_instance_id", stage_instance_id);

    // Combine all files
    const allFiles = [
      ...(portalDocs || []).map((d: any) => ({
        id: d.id,
        name: d.file_name || "",
        tags: Array.isArray(d.tags) ? d.tags : [],
        folder: d.folder_path || "",
        type: d.document_type || "",
      })),
      ...(docFiles || []).map((d: any) => ({
        id: d.id,
        name: d.file_name || "",
        tags: Array.isArray(d.tags) ? d.tags : [],
        folder: "",
        type: "",
      })),
    ];

    // Step 4: Classify files into categories
    const detectedCategoriesSet = new Set<string>();
    const fileClassifications: Array<{ file_id: string; file_name: string; categories: string[] }> = [];

    for (const file of allFiles) {
      const matched = classifyFile(file.name, file.tags, `${file.folder} ${file.type}`);
      matched.forEach(c => detectedCategoriesSet.add(c));
      if (matched.length > 0) {
        fileClassifications.push({ file_id: file.id, file_name: file.name, categories: matched });
      }
    }

    // Step 5: Compute gaps
    const requiredCategoryNames = categories.map(c => c.category_name);
    const detectedCategoryNames = Array.from(detectedCategoriesSet);
    const missingCategories = categories
      .filter(c => !detectedCategoriesSet.has(c.category_name))
      .map(c => ({
        category_name: c.category_name,
        category_description: c.category_description,
        related_standard_clause: c.related_standard_clause,
        mandatory: c.mandatory_flag,
      }));

    const mandatoryMissing = missingCategories.filter(c => c.mandatory).length;

    // Step 6: Store results
    const { data: gapCheck } = await supabase
      .from("evidence_gap_checks")
      .insert({
        tenant_id,
        stage_instance_id,
        research_job_id: job.id,
        generated_by_user_id: user.id,
        required_categories_json: categories.map(c => ({
          category_name: c.category_name,
          category_description: c.category_description,
          related_standard_clause: c.related_standard_clause,
          mandatory: c.mandatory_flag,
        })),
        detected_categories_json: detectedCategoryNames.map(name => ({
          category_name: name,
          matched_files: fileClassifications.filter(f => f.categories.includes(name)).map(f => f.file_name),
        })),
        missing_categories_json: missingCategories,
        status: "draft",
      })
      .select("id")
      .single();

    // Create research finding summary
    const summaryMd = `# Evidence Gap Check

**Generated:** ${new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}  
**Standards Reference:** Standards for RTOs 2025  
**Files Scanned:** ${allFiles.length}

---

## Summary
- **Required Categories:** ${requiredCategoryNames.length}
- **Detected:** ${detectedCategoryNames.length}
- **Missing:** ${missingCategories.length} (${mandatoryMissing} mandatory)

## Missing Categories
${missingCategories.map(c => `- **${c.category_name}** ${c.mandatory ? "(MANDATORY)" : "(Optional)"} — ${c.related_standard_clause}\n  ${c.category_description}`).join("\n")}

---

This check identifies missing evidence categories only. It does not assess document quality or compliance.`;

    await supabase.from("research_findings").insert({
      job_id: job.id,
      summary_md: summaryMd,
      citations_json: [],
      risk_flags_json: missingCategories.filter(c => c.mandatory).map(c => ({
        risk_category: "Missing Evidence",
        standard_clause: c.related_standard_clause,
        severity: "medium",
        source_url: "",
        claim_excerpt: `Missing: ${c.category_name}`,
      })),
      review_status: "draft",
    });

    // Complete job
    await supabase.from("research_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      output_json: {
        gap_check_id: gapCheck?.id,
        files_scanned: allFiles.length,
        required: requiredCategoryNames.length,
        detected: detectedCategoryNames.length,
        missing: missingCategories.length,
        mandatory_missing: mandatoryMissing,
      },
    }).eq("id", job.id);

    await auditLog(supabase, user.id, job.id, "gap_check_completed", {
      gap_check_id: gapCheck?.id,
      files_scanned: allFiles.length,
      missing_count: missingCategories.length,
      mandatory_missing: mandatoryMissing,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: job.id,
        gap_check_id: gapCheck?.id,
        summary: {
          files_scanned: allFiles.length,
          required: requiredCategoryNames.length,
          detected: detectedCategoryNames.length,
          missing: missingCategories.length,
          mandatory_missing: mandatoryMissing,
        },
        missing_categories: missingCategories,
        detected_categories: detectedCategoryNames,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-evidence-gap-check error:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
