import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { tenant_id, stage_id, document_ids, name, expires_in_days = 7 } = await req.json();
    
    if (!tenant_id || !stage_id || !document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "tenant_id, stage_id, and document_ids array are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Generating pack for tenant ${tenant_id}, stage ${stage_id}, ${document_ids.length} documents`);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get the auth user from the request
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }
    
    // Get document details and their file paths
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("id, name, file_path, current_published_version_id")
      .in("id", document_ids);
    
    if (docsError || !documents || documents.length === 0) {
      console.error("Error fetching documents:", docsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch documents" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get published version file paths if available
    const versionIds = documents
      .filter(d => d.current_published_version_id)
      .map(d => d.current_published_version_id);
    
    let versionFiles: Record<string, string> = {};
    
    if (versionIds.length > 0) {
      const { data: versions } = await supabase
        .from("document_versions")
        .select("id, file_path")
        .in("id", versionIds);
      
      if (versions) {
        versionFiles = Object.fromEntries(versions.map(v => [v.id, v.file_path]));
      }
    }
    
    // Collect files to include in pack
    const filesToInclude: { name: string; path: string }[] = [];
    const documentVersionIds: string[] = [];
    
    for (const doc of documents) {
      let filePath: string | null = null;
      
      // Prefer published version file
      if (doc.current_published_version_id && versionFiles[doc.current_published_version_id]) {
        filePath = versionFiles[doc.current_published_version_id];
        documentVersionIds.push(doc.current_published_version_id);
      } else if (doc.file_path) {
        filePath = doc.file_path;
      }
      
      if (filePath) {
        filesToInclude.push({
          name: doc.name,
          path: filePath
        });
      }
    }
    
    if (filesToInclude.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files available for the selected documents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // For Phase 7, we create the pack record - ZIP generation can be done client-side
    // or enhanced later with a separate ZIP endpoint
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    
    const packName = name || `Stage Documents - ${new Date().toISOString().split('T')[0]}`;
    
    // Create the pack record
    const { data: pack, error: packError } = await supabase
      .from("tenant_packs")
      .insert({
        tenant_id,
        stage_id,
        name: packName,
        document_ids,
        document_version_ids: documentVersionIds,
        created_by: userId,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();
    
    if (packError) {
      console.error("Error creating pack:", packError);
      return new Response(
        JSON.stringify({ error: "Failed to create pack record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Log the pack creation event
    await supabase
      .from("pack_events")
      .insert({
        pack_id: pack.id,
        event_type: "pack_created",
        tenant_id,
        stage_id,
        user_id: userId,
        metadata: {
          document_count: document_ids.length,
          file_count: filesToInclude.length
        }
      });
    
    // Generate signed URLs for each file (valid for the pack expiry period)
    const signedUrls: { name: string; url: string }[] = [];
    const expirySeconds = expires_in_days * 24 * 60 * 60;
    
    for (const file of filesToInclude) {
      const { data: signedData, error: signError } = await supabase.storage
        .from("documents")
        .createSignedUrl(file.path, expirySeconds);
      
      if (!signError && signedData?.signedUrl) {
        signedUrls.push({
          name: file.name,
          url: signedData.signedUrl
        });
      } else {
        console.warn(`Failed to generate signed URL for ${file.path}:`, signError);
      }
    }
    
    console.log(`Pack ${pack.id} created with ${signedUrls.length} files`);
    
    return new Response(
      JSON.stringify({
        success: true,
        pack_id: pack.id,
        pack_name: packName,
        expires_at: expiresAt.toISOString(),
        files: signedUrls,
        document_count: document_ids.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Pack generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
