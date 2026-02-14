import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

interface BulkGenerateRequest {
  tenant_id: number;
  stageinstance_id: number;
  package_id?: number;
  mode: 'all' | 'pending_only';
}

interface TokenBinding {
  source_type: 'client' | 'tenant' | 'package' | 'stage' | 'system' | 'static';
  source_field?: string;
  static_value?: string;
}

interface ExcelBindings {
  status: string;
  token_bindings: Record<string, TokenBinding>;
  dropdown_bindings: Record<string, { list_id: string }>;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function processExcelTemplate(
  templateBytes: Uint8Array,
  mergeData: Record<string, string>,
  listData: Record<string, string[]>
): Promise<Uint8Array> {
  const { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } =
    await import('https://deno.land/x/zipjs@v2.7.32/index.js');

  const zipReader = new ZipReader(new Uint8ArrayReader(templateBytes));
  const entries = await zipReader.getEntries();
  const outputWriter = new Uint8ArrayWriter();
  const zipWriter = new ZipWriter(outputWriter);

  for (const entry of entries) {
    if (entry.directory) continue;
    const fileName = entry.filename;
    const content = await entry.getData!(new Uint8ArrayWriter());

    if (fileName.endsWith('.xml') || fileName.endsWith('.xml.rels')) {
      const decoder = new TextDecoder();
      let xmlContent = decoder.decode(content);

      if (fileName.startsWith('xl/worksheets/') || fileName === 'xl/sharedStrings.xml') {
        for (const [key, value] of Object.entries(mergeData)) {
          const safeValue = escapeXml(value || '');
          xmlContent = xmlContent.replace(new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g'), safeValue);
          xmlContent = xmlContent.replace(new RegExp(`<<${escapeRegex(key)}>>`, 'g'), safeValue);
          xmlContent = xmlContent.replace(new RegExp(`\\[\\[${escapeRegex(key)}\\]\\]`, 'g'), safeValue);
        }
      }

      const encoder = new TextEncoder();
      await zipWriter.add(fileName, new Uint8ArrayReader(encoder.encode(xmlContent)));
    } else {
      await zipWriter.add(fileName, new Uint8ArrayReader(content));
    }
  }

  await zipReader.close();
  await zipWriter.close();
  return await outputWriter.getData();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) throw new Error('Unauthorized');

    const body: BulkGenerateRequest = await req.json();
    const { tenant_id, stageinstance_id, package_id, mode = 'pending_only' } = body;

    console.log('Bulk generate request:', { tenant_id, stageinstance_id, package_id, mode });

    // Verify tenant access
    const { data: userProfile } = await supabase
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', user.id)
      .single();

    const isSuperAdmin = userProfile?.unicorn_role === 'Super Admin';
    if (!isSuperAdmin) {
      const { data: tenantMember } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      if (!tenantMember) throw new Error('Access denied');
    }

    // Rate limit: 1 bulk gen per tenant per 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentBulk } = await supabase
      .from('audit_events')
      .select('id')
      .eq('entity', 'bulk_generate')
      .eq('action', 'bulk_generate_phase_documents')
      .gte('created_at', fiveMinAgo)
      .limit(1);

    if (recentBulk && recentBulk.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limited. Please wait 5 minutes between bulk generations.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 });
    }

    // Fetch document_instances for this stage instance
    const { data: instances, error: instError } = await supabase
      .from('document_instances')
      .select('id, document_id, isgenerated, status')
      .eq('stageinstance_id', stageinstance_id)
      .eq('tenant_id', tenant_id);

    if (instError) throw instError;
    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({
        success: true, total: 0, generated: 0, skipped: 0, failed: 0, results: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get document metadata
    const docIds = [...new Set(instances.map(i => i.document_id))];
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, format, file_names, uploaded_files, merge_fields, is_auto_generated')
      .in('id', docIds);

    const docMap = new Map((docs || []).map(d => [d.id, d]));

    // Filter to eligible documents
    const eligible = instances.filter(inst => {
      const doc = docMap.get(inst.document_id);
      if (!doc) return false;
      if (!doc.is_auto_generated) return false;
      const fmt = (doc.format || '').toLowerCase();
      if (!['xlsx', 'xls', 'xlsm', 'docx'].includes(fmt)) return false;
      if (mode === 'pending_only' && inst.isgenerated) return false;
      return true;
    });

    if (eligible.length > 500) {
      return new Response(JSON.stringify({
        success: false,
        error: `Batch too large (${eligible.length}). Maximum is 500 documents per call.`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Fetch tenant/client merge data
    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    const { data: tenantMergeData } = await supabase
      .from('tenant_merge_data').select('data').eq('tenant_id', tenant_id).single();

    let tenantData: Record<string, unknown> = { ...(tenant || {}) };
    if (tenantMergeData?.data) {
      tenantData = { ...tenantData, ...(tenantMergeData.data as Record<string, unknown>) };
    }

    // Fetch legacy merge field definitions once
    const { data: mergeFieldDefs } = await supabase
      .from('merge_field_definitions')
      .select('code, source_column')
      .eq('is_active', true);

    const results: Array<{ document_instance_id: number; document_title: string; status: 'generated' | 'skipped' | 'failed'; error?: string }> = [];
    let generated = 0, skipped = 0, failed = 0;

    for (const inst of eligible) {
      const doc = docMap.get(inst.document_id)!;
      try {
        const templatePath = doc.uploaded_files?.[0];
        if (!templatePath) {
          results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'skipped', error: 'No template file' });
          skipped++;
          continue;
        }

        // Fetch bindings
        const { data: excelBindings } = await supabase
          .from('excel_template_bindings')
          .select('*')
          .eq('document_id', doc.id)
          .maybeSingle();

        const bindings = excelBindings as ExcelBindings | null;
        if (bindings && bindings.status === 'error') {
          results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'skipped', error: 'Binding errors' });
          skipped++;
          continue;
        }

        // Build merge data
        const mergeData: Record<string, string> = {};
        if (bindings && Object.keys(bindings.token_bindings || {}).length > 0) {
          for (const [token, binding] of Object.entries(bindings.token_bindings)) {
            let value = '';
            switch (binding.source_type) {
              case 'client':
              case 'tenant':
                if (binding.source_field) {
                  const fv = tenantData[binding.source_field];
                  value = fv != null ? String(fv) : '';
                }
                break;
              case 'system':
                if (binding.source_field === 'current_date') value = new Date().toLocaleDateString('en-AU');
                else if (binding.source_field === 'current_year') value = new Date().getFullYear().toString();
                else if (binding.source_field === 'generated_by') value = user.email || '';
                break;
              case 'static':
                value = binding.static_value || '';
                break;
            }
            mergeData[token] = value;
          }
        } else {
          (mergeFieldDefs || []).forEach((field: { code: string; source_column: string }) => {
            const v = tenantData[field.source_column];
            mergeData[field.code] = v != null ? String(v) : '';
          });
        }

        // Build list data
        const listData: Record<string, string[]> = {};
        if (bindings && bindings.dropdown_bindings) {
          for (const [ddId, binding] of Object.entries(bindings.dropdown_bindings)) {
            if (binding.list_id) {
              const { data: items } = await supabase
                .from('lookup_list_items')
                .select('value, label')
                .eq('list_id', binding.list_id)
                .eq('is_active', true)
                .order('sort_order');
              if (items?.length) listData[ddId] = items.map(i => i.label || i.value);
            }
          }
        }

        // Download template
        const { data: templateFile, error: dlErr } = await supabase.storage
          .from('package-documents').download(templatePath);
        if (dlErr || !templateFile) {
          results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'failed', error: dlErr?.message || 'Download failed' });
          failed++;
          continue;
        }

        const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
        const generatedBytes = await processExcelTemplate(templateBytes, mergeData, listData);

        // Upload
        const tenantName = ((tenantData.name || tenantData.companyname || 'tenant') as string)
          .replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const ts = Date.now();
        const generatedFileName = `${doc.title}_${tenantName}_${ts}.xlsx`;
        const outputPath = `generated/${tenant_id}/${doc.id}/${generatedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('package-documents')
          .upload(outputPath, generatedBytes, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: true
          });

        if (uploadErr) {
          results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'failed', error: uploadErr.message });
          failed++;
          continue;
        }

        // Record in generated_documents
        await supabase.from('generated_documents').insert({
          source_document_id: doc.id,
          tenant_id,
          stage_id: undefined,
          package_id: package_id || null,
          file_path: outputPath,
          file_name: generatedFileName,
          generated_by: user.id,
          status: 'generated',
          merge_data: mergeData
        });

        // Update document_instance
        await supabase
          .from('document_instances')
          .update({ isgenerated: true, status: 'generated' })
          .eq('id', inst.id);

        results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'generated' });
        generated++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ document_instance_id: inst.id, document_title: doc.title, status: 'failed', error: msg });
        failed++;
      }
    }

    // Audit log
    await supabase.from('audit_events').insert({
      action: 'bulk_generate_phase_documents',
      entity: 'bulk_generate',
      entity_id: `${stageinstance_id}`,
      user_id: user.id,
      details: { tenant_id, stageinstance_id, package_id, mode, total: eligible.length, generated, skipped, failed }
    });

    const total = eligible.length;
    console.log(`Bulk generation complete: ${generated} generated, ${skipped} skipped, ${failed} failed out of ${total}`);

    return new Response(JSON.stringify({ success: true, total, generated, skipped, failed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Bulk generate error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
});
