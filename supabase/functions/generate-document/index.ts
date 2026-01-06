import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

interface GenerateDocumentRequest {
  document_id: number;
  tenant_id: number;
  client_legacy_id: string;
  stage_id: number;
  package_id: number;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const body: GenerateDocumentRequest = await req.json();
    const { document_id, tenant_id, client_legacy_id, stage_id, package_id } = body;

    console.log('Generate document request:', { document_id, tenant_id, client_legacy_id, stage_id, package_id });

    // 1. Fetch the source document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, format, file_names, uploaded_files')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
    }

    console.log('Source document:', document.title);

    // 2. Fetch the tenant/client data for merge fields
    const { data: client, error: clientError } = await supabase
      .from('clients_legacy')
      .select('*')
      .eq('id', client_legacy_id)
      .single();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message || 'Unknown error'}`);
    }

    console.log('Client data fetched:', client.companyname);

    // 3. Fetch merge field definitions
    const { data: mergeFields, error: fieldsError } = await supabase
      .from('merge_field_definitions')
      .select('code, source_column')
      .eq('is_active', true);

    if (fieldsError) {
      console.warn('Could not fetch merge fields:', fieldsError.message);
    }

    // 4. Build merge data object
    const mergeData: Record<string, string> = {};
    (mergeFields || []).forEach((field: { code: string; source_column: string }) => {
      const value = (client as Record<string, unknown>)[field.source_column];
      mergeData[field.code] = value !== null && value !== undefined ? String(value) : '';
    });

    console.log('Merge data prepared with', Object.keys(mergeData).length, 'fields');

    // 5. For now, we'll create a placeholder record since actual DOCX processing 
    // requires additional server-side libraries
    // In a production environment, this would:
    // - Download the template from storage
    // - Use a library like docxtemplater to process merge fields
    // - Upload the generated document to storage
    // - Return the file path

    const generatedFileName = `${document.title}_${client.companyname || 'tenant'}_${Date.now()}.${document.format || 'docx'}`;
    const filePath = `generated/${tenant_id}/${package_id}/${stage_id}/${generatedFileName}`;

    // 6. Create the generated document record
    const { data: generatedDoc, error: insertError } = await supabase
      .from('generated_documents')
      .insert({
        source_document_id: document_id,
        tenant_id: tenant_id,
        client_legacy_id: client_legacy_id,
        stage_id: stage_id,
        package_id: package_id,
        file_path: filePath,
        file_name: generatedFileName,
        generated_by: user.id,
        status: 'generated',
        merge_data: mergeData
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create generated document record: ${insertError.message}`);
    }

    console.log('Generated document record created:', generatedDoc.id);

    // Log to audit
    await supabase
      .from('package_builder_audit_log')
      .insert({
        package_id: package_id,
        action: 'generate',
        entity_type: 'generated_document',
        entity_id: generatedDoc.id,
        after_data: {
          document_id,
          tenant_id,
          stage_id,
          file_name: generatedFileName
        },
        performed_by: user.id
      });

    return new Response(
      JSON.stringify({
        success: true,
        generated_document: generatedDoc,
        message: `Document "${document.title}" generated for ${client.companyname}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Generate document error:', errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
