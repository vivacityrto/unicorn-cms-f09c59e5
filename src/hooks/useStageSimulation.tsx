import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStandardsReference, resolveStandardCodes } from '@/hooks/useStageStandards';
import { useStageDependencyCheck, checkDependenciesInPackage } from '@/hooks/useStageDependencies';
import { computeStageQuality } from '@/hooks/useStageQualityCheck';
import { Stage } from '@/hooks/usePackageBuilder';

export interface SimulationContext {
  packageId: number;
  packageName: string;
  tenantId?: string;
  tenantName?: string;
}

export interface SimulationTeamTask {
  id: string;
  name: string;
  description: string | null;
  owner_role: string;
  estimated_hours: number | null;
  is_mandatory: boolean;
  order_number: number;
}

export interface SimulationClientTask {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  due_date_offset: number | null;
  required_documents: string[] | null;
  order_number: number;
}

export interface SimulationEmail {
  id: number;
  trigger_type: string;
  recipient_type: string;
  template_id: string;
  template_name: string;
  subject: string;
  html_body: string;
  rendered_subject: string;
  rendered_body: string;
  missing_merge_fields: string[];
  sort_order: number;
}

export interface SimulationDocument {
  id: string;
  document_id: number;
  doc_name: string;
  visibility: string;
  delivery_type: string;
  is_auto_generated: boolean;
  is_tenant_downloadable: boolean;
  sort_order: number;
}

export interface DependencyCheckResult {
  has_dependencies: boolean;
  all_met: boolean;
  missing_stages: Array<{ stage_key: string; title: string }>;
}

export interface QualityCheckResult {
  status: 'pass' | 'warn' | 'fail';
  issues: string[];
}

export interface SimulationSummary {
  stage: Stage;
  version_label: string | null;
  frameworks: string[];
  standards: Array<{ code: string; title: string }>;
  dependency_check: DependencyCheckResult;
  quality_check: QualityCheckResult;
  content_source: 'template' | 'override';
}

export interface SimulationData {
  summary: SimulationSummary;
  teamTasks: SimulationTeamTask[];
  clientTasks: SimulationClientTask[];
  emails: SimulationEmail[];
  documents: SimulationDocument[];
  mergeDataSource: string;
}

const SAMPLE_MERGE_DATA: Record<string, string> = {
  ClientName: 'Sample Client',
  RTOName: 'Sample RTO',
  RTOId: '12345',
  CSCName: 'Sample CSC',
  CSCEmail: 'csc@sample.com',
  CSCPhone: '0400 000 000',
  PackageName: '',
  StageName: '',
  CompanyName: 'Sample Company Pty Ltd',
  ABN: '12 345 678 901',
  Email: 'client@sample.com',
  Phone: '0400 123 456',
  Address: '123 Sample Street, Sydney NSW 2000',
  ContactName: 'John Sample',
  FirstName: 'John',
  LastName: 'Sample',
};

/**
 * Render merge fields in template text
 * Replaces {{FieldName}} with actual values
 * Returns rendered text and list of missing fields
 */
export function renderMergeFields(
  template: string,
  mergeData: Record<string, string>
): { rendered: string; missingFields: string[] } {
  const missingFields: string[] = [];
  const tokenRegex = /\{\{(\w+)\}\}/g;
  
  const rendered = template.replace(tokenRegex, (match, fieldName) => {
    const value = mergeData[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
    missingFields.push(fieldName);
    return match; // Leave token in place if missing
  });
  
  return { rendered, missingFields };
}

/**
 * Build merge data from tenant or use sample defaults
 */
async function buildMergeData(
  tenantId: string | undefined,
  packageName: string,
  stageName: string
): Promise<{ mergeData: Record<string, string>; source: string }> {
  const baseData = {
    ...SAMPLE_MERGE_DATA,
    PackageName: packageName,
    StageName: stageName,
  };

  if (!tenantId) {
    return { mergeData: baseData, source: 'Sample data' };
  }

  try {
    // Fetch tenant data from clients_legacy using tenant_id reference
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', parseInt(tenantId))
      .single();

    if (!tenantData) {
      return { mergeData: baseData, source: 'Sample data' };
    }

    // Get the linked client_legacy record (use limit 1 to avoid 406 on duplicates)
    const { data: client } = await supabase
      .from('clients_legacy')
      .select('*')
      .eq('tenant_id', parseInt(tenantId))
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!client) {
      return { 
        mergeData: { ...baseData, ClientName: tenantData.name },
        source: `Tenant: ${tenantData.name}` 
      };
    }

    // Map client fields to merge data
    const mergeData: Record<string, string> = {
      ...baseData,
      ClientName: client.companyname || tenantData.name,
      RTOName: client.rto_name || client.companyname || '',
      RTOId: client.rtoid || '',
      CompanyName: client.companyname || '',
      LegalName: client.legal_name || '',
      ABN: client.abn || '',
      ACN: client.acn || '',
      Email: client.email || '',
      Phone: client.phone || '',
      Address: client.address || '',
      ContactName: client.contactname || '',
      FirstName: client.first_name || '',
      LastName: client.last_name || '',
      Website: client.website || '',
      State: client.state || '',
      Suburb: client.suburb || '',
      Postcode: client.postcode || '',
    };

    // Fetch CSC data if assigned
    const { data: clientPackages } = await supabase
      .from('client_packages')
      .select('assigned_csc_user_id')
      .eq('tenant_id', parseInt(tenantId))
      .not('assigned_csc_user_id', 'is', null)
      .limit(1);

    if (clientPackages && clientPackages.length > 0 && clientPackages[0].assigned_csc_user_id) {
      const { data: cscUser } = await supabase
        .from('users')
        .select('first_name, last_name, email, phone')
        .eq('user_uuid', clientPackages[0].assigned_csc_user_id)
        .single();

      if (cscUser) {
        mergeData.CSCName = `${cscUser.first_name || ''} ${cscUser.last_name || ''}`.trim();
        mergeData.CSCEmail = cscUser.email || '';
        mergeData.CSCPhone = cscUser.phone || '';
      }
    }

    return { mergeData, source: `Tenant: ${tenantData.name}` };
  } catch (error) {
    console.error('Failed to build merge data:', error);
    return { mergeData: baseData, source: 'Sample data' };
  }
}

/**
 * Fetch resolved content based on use_overrides flag
 * Returns content from either stage_* (template) or package_* (override) tables
 */
async function fetchResolvedContent(packageId: number, stageId: number) {
  // Check if package uses overrides for this stage
  const { data: psData } = await supabase
    .from('package_stages')
    .select('use_overrides')
    .eq('package_id', packageId)
    .eq('stage_id', stageId)
    .single();

  const usesOverrides = psData?.use_overrides ?? false;

  if (usesOverrides) {
    // Fetch from package_* override tables
    const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
      supabase
        .from('package_staff_tasks')
        .select('*')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('order_number', { ascending: true }),
      supabase
        .from('package_client_tasks')
        .select('*')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('order_number', { ascending: true }),
      supabase
        .from('package_stage_emails')
        .select(`
          id, trigger_type, recipient_type, email_template_id, sort_order, is_active,
          email_templates:email_template_id (id, internal_name, subject, html_body)
        `)
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('package_stage_documents')
        .select(`
          id, document_id, visibility, delivery_type, sort_order,
          documents:document_id (id, doc_name, is_auto_generated, is_tenant_downloadable)
        `)
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true })
    ]);

    return {
      source: 'override' as const,
      teamTasks: teamResult.data || [],
      clientTasks: clientResult.data || [],
      emails: emailsResult.data || [],
      documents: docsResult.data || []
    };
  } else {
    // Fetch from stage_* template tables
    const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
      supabase
        .from('stage_team_tasks')
        .select('*')
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('stage_client_tasks')
        .select('*')
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('stage_emails')
        .select(`
          id, trigger_type, recipient_type, email_template_id, sort_order, is_active,
          email_template:email_templates (id, internal_name, subject, html_body)
        `)
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('stage_documents')
        .select(`
          id, document_id, visibility, delivery_type, sort_order,
          document:documents (id, doc_name, is_auto_generated, is_tenant_downloadable)
        `)
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true })
    ]);

    return {
      source: 'template' as const,
      teamTasks: teamResult.data || [],
      clientTasks: clientResult.data || [],
      emails: emailsResult.data || [],
      documents: docsResult.data || []
    };
  }
}

export function useStageSimulation() {
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const { standards: allStandards } = useStandardsReference();

  const fetchPackagesUsingStage = useCallback(async (stageId: number) => {
    const { data } = await supabase
      .from('package_stages')
      .select('package_id, packages:package_id (id, name, status, package_type)')
      .eq('stage_id', stageId) as any;

    const packages = (data || [])
      .filter((d: any) => d.packages)
      .map((d: any) => ({
        id: d.packages.id,
        name: d.packages.name,
        status: d.packages.status,
        package_type: d.packages.package_type,
      }));

    // Remove duplicates
    const uniquePackages = packages.filter(
      (pkg: any, index: number, self: any[]) => 
        index === self.findIndex(p => p.id === pkg.id)
    );

    return uniquePackages;
  }, []);

  const fetchTenantsForSimulation = useCallback(async () => {
    // Fetch tenants that have client_legacy records for merge preview
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(50);

    return data || [];
  }, []);

  const runSimulation = useCallback(async (
    stageId: number,
    context: SimulationContext
  ) => {
    setLoading(true);
    try {
      // Fetch stage data
      const { data: stageData, error: stageError } = await supabase
        .from('documents_stages')
        .select('*')
        .eq('id', stageId)
        .single();

      if (stageError || !stageData) throw new Error('Stage not found');

      const stage = stageData as Stage;

      // Build merge data
      const { mergeData, source: mergeDataSource } = await buildMergeData(
        context.tenantId,
        context.packageName,
        stage.title
      );

      // Fetch resolved content (from template or override based on use_overrides flag)
      const resolved = await fetchResolvedContent(context.packageId, stageId);

      // Map team tasks
      const teamTasks: SimulationTeamTask[] = resolved.teamTasks.map((t: any) => ({
        id: t.id?.toString() || '',
        name: t.name,
        description: t.description,
        owner_role: t.owner_role || 'Admin',
        estimated_hours: t.estimated_hours,
        is_mandatory: t.is_mandatory ?? true,
        order_number: t.order_number ?? t.sort_order ?? 0,
      }));

      // Map client tasks
      const clientTasks: SimulationClientTask[] = resolved.clientTasks.map((t: any) => ({
        id: t.id?.toString() || '',
        name: t.name,
        description: t.description,
        instructions: t.instructions,
        due_date_offset: t.due_date_offset,
        required_documents: t.required_documents,
        order_number: t.order_number ?? t.sort_order ?? 0,
      }));

      // Map emails with template rendering
      const emails: SimulationEmail[] = resolved.emails.map((e: any) => {
        // Handle both override (email_templates) and template (email_template) structure
        const template = e.email_templates || e.email_template;
        const subject = template?.subject || '';
        const htmlBody = template?.html_body || '';
        
        const { rendered: renderedSubject, missingFields: subjectMissing } = renderMergeFields(subject, mergeData);
        const { rendered: renderedBody, missingFields: bodyMissing } = renderMergeFields(htmlBody, mergeData);
        
        const allMissing = [...new Set([...subjectMissing, ...bodyMissing])];

        return {
          id: e.id,
          trigger_type: e.trigger_type,
          recipient_type: e.recipient_type,
          template_id: e.email_template_id,
          template_name: template?.internal_name || 'Unknown',
          subject,
          html_body: htmlBody,
          rendered_subject: renderedSubject,
          rendered_body: renderedBody,
          missing_merge_fields: allMissing,
          sort_order: e.sort_order,
        };
      });

      // Map documents
      const documents: SimulationDocument[] = resolved.documents.map((d: any) => {
        // Handle both override (documents) and template (document) structure
        const doc = d.documents || d.document;
        return {
          id: d.id?.toString() || '',
          document_id: d.document_id,
          doc_name: doc?.doc_name || doc?.title || 'Unknown Document',
          visibility: d.visibility || 'both',
          delivery_type: d.delivery_type || 'manual',
          is_auto_generated: doc?.is_auto_generated ?? false,
          is_tenant_downloadable: doc?.is_tenant_downloadable ?? true,
          sort_order: d.sort_order,
        };
      });

      // Check dependencies
      const depResult = await checkDependenciesInPackage(stageId, context.packageId);
      const dependencyCheck: DependencyCheckResult = {
        has_dependencies: (stageData as any).requires_stage_keys?.length > 0,
        all_met: depResult.satisfied,
        missing_stages: depResult.missing.map((m) => ({ stage_key: m.stage_key, title: m.title })),
      };

      // Compute quality
      const qualityResult = await computeStageQuality(stageId, context.packageId);
      const qualityIssues: string[] = [];
      if (qualityResult) {
        qualityResult.checks
          .filter(c => c.status === 'fail' || c.status === 'warn')
          .forEach(c => qualityIssues.push(c.message));
      }
      const qualityCheck: QualityCheckResult = {
        status: qualityResult?.status || 'pass',
        issues: qualityIssues,
      };

      // Resolve standards
      const resolvedStandards = resolveStandardCodes(
        (stageData as any).covers_standards || null,
        allStandards
      ).map(s => ({ code: s.code, title: s.title }));

      const summary: SimulationSummary = {
        stage,
        version_label: (stageData as any).version_label || null,
        frameworks: (stageData as any).frameworks || [],
        standards: resolvedStandards,
        dependency_check: dependencyCheck,
        quality_check: qualityCheck,
        content_source: resolved.source,
      };

      setSimulationData({
        summary,
        teamTasks,
        clientTasks,
        emails,
        documents,
        mergeDataSource,
      });

      return true;
    } catch (error) {
      console.error('Simulation failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [allStandards]);

  const clearSimulation = useCallback(() => {
    setSimulationData(null);
  }, []);

  return {
    loading,
    simulationData,
    fetchPackagesUsingStage,
    fetchTenantsForSimulation,
    runSimulation,
    clearSimulation,
  };
}
