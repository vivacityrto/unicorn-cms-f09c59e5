import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ClientImpactReport, ClientImpactItem, ItemSection, ItemStatus, ReportStatus } from '@/types/clientImpact';
import { toast } from 'sonner';

const VIVACITY_TENANT_ID = 6372;

// Mapping functions to sanitize EOS data for client consumption
function mapRockToImpactItem(rock: any): { 
  section: ItemSection; 
  category: string; 
  title: string; 
  description: string; 
  client_benefit: string;
  status: ItemStatus;
  completed_date: string | null;
  source_type: string;
  source_id: string;
} {
  // Remove all EOS terminology
  const categoryMap: Record<string, string> = {
    'compliance': 'Compliance',
    'delivery': 'Delivery Quality',
    'communication': 'Communication',
    'process': 'Process Improvement',
  };
  
  return {
    section: 'improvements' as ItemSection,
    category: categoryMap[rock.category?.toLowerCase()] || 'Service Enhancement',
    title: sanitizeTitle(rock.title) || 'Improvement delivered',
    description: sanitizeDescription(rock.description),
    client_benefit: rock.client_benefit || 'Improved service delivery and outcomes',
    status: (rock.status === 'Complete' ? 'completed' : 'in_progress') as ItemStatus,
    completed_date: rock.completed_date || null,
    source_type: 'rock',
    source_id: rock.id,
  };
}

function mapIssueToImpactItem(issue: any): {
  section: ItemSection;
  category: string;
  title: string;
  description: string;
  client_benefit: string;
  status: ItemStatus;
  completed_date: string | null;
  source_type: string;
  source_id: string;
} {
  const statusMap: Record<string, ItemStatus> = {
    'Solved': 'mitigated',
    'Closed': 'closed',
    'Open': 'identified',
    'In Review': 'in_progress',
  };
  
  return {
    section: 'risks' as ItemSection,
    category: 'Risk Reduction',
    title: sanitizeTitle(issue.title) || 'Risk addressed',
    description: sanitizeDescription(issue.description),
    client_benefit: issue.solution || 'Risk identified and managed proactively',
    status: statusMap[issue.status] || 'identified',
    completed_date: issue.resolved_at || null,
    source_type: 'issue',
    source_id: issue.id,
  };
}

// Remove internal EOS terminology from text
function sanitizeTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\bRock\b/gi, 'Initiative')
    .replace(/\bIDS\b/gi, 'Issue')
    .replace(/\bL10\b/gi, '')
    .replace(/\bGWC\b/gi, '')
    .replace(/\bVTO\b/gi, '')
    .replace(/\bEOS\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeDescription(desc: string | null): string {
  if (!desc) return '';
  return desc
    .replace(/\bRock\b/gi, 'initiative')
    .replace(/\bIDS\b/gi, 'issue')
    .replace(/\bL10\b/gi, 'weekly review')
    .replace(/\bGWC\b/gi, '')
    .replace(/\bVTO\b/gi, 'strategic plan')
    .replace(/\bEOS\b/gi, '')
    .replace(/\bAccountability Chart\b/gi, 'team structure')
    .replace(/\bScorecard\b/gi, 'performance metrics')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCurrentQuarter(): { year: number; quarter: number; period: string; start: Date; end: Date } {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  
  return {
    year,
    quarter,
    period: `Q${quarter} ${year}`,
    start,
    end,
  };
}

// Hook to fetch impact reports for a client
export function useClientImpactReports(clientId?: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['client-impact-reports', clientId],
    queryFn: async () => {
      let query = supabase
        .from('client_impact_reports')
        .select('*')
        .order('period_start', { ascending: false });
      
      if (clientId) {
        query = query.eq('client_id', clientId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []) as ClientImpactReport[];
    },
    enabled: !!user,
  });
}

// Hook to fetch a single report with its items
export function useClientImpactReport(reportId: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['client-impact-report', reportId],
    queryFn: async () => {
      const [reportResult, itemsResult] = await Promise.all([
        supabase
          .from('client_impact_reports')
          .select('*')
          .eq('id', reportId)
          .single(),
        supabase
          .from('client_impact_items')
          .select('*')
          .eq('report_id', reportId)
          .order('display_order', { ascending: true }),
      ]);
      
      if (reportResult.error) throw reportResult.error;
      if (itemsResult.error) throw itemsResult.error;
      
      return {
        report: reportResult.data as ClientImpactReport,
        items: (itemsResult.data || []) as ClientImpactItem[],
      };
    },
    enabled: !!user && !!reportId,
  });
}

// Hook to generate a new impact report from EOS data
export function useGenerateImpactReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ clientId }: { clientId?: string }) => {
      const { year, quarter, period, start, end } = getCurrentQuarter();
      
      // Check if report already exists for this period
      const { data: existing } = await supabase
        .from('client_impact_reports')
        .select('id')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('reporting_period', period)
        .maybeSingle();
      
      if (existing) {
        throw new Error(`Report for ${period} already exists`);
      }
      
      // Fetch completed rocks for the period
      const { data: rocks } = await supabase
        .from('eos_rocks')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('status', 'Complete')
        .gte('completed_date', start.toISOString().split('T')[0])
        .lte('completed_date', end.toISOString().split('T')[0]);
      
      // Fetch resolved issues for the period  
      const { data: issues } = await supabase
        .from('eos_issues')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .in('status', ['Solved', 'Closed'])
        .gte('resolved_at', start.toISOString())
        .lte('resolved_at', end.toISOString());
      
      // Determine overall status
      const completedRocks = rocks?.length || 0;
      const resolvedIssues = issues?.length || 0;
      let overallStatus: ReportStatus = 'on_track';
      
      if (completedRocks === 0 && resolvedIssues === 0) {
        overallStatus = 'needs_attention';
      }
      
      // Generate executive summary
      const summary = generateExecutiveSummary(completedRocks, resolvedIssues, period);
      
      // Create the report
      const { data: report, error: reportError } = await supabase
        .from('client_impact_reports')
        .insert({
          tenant_id: VIVACITY_TENANT_ID,
          client_id: clientId,
          reporting_period: period,
          period_start: start.toISOString().split('T')[0],
          period_end: end.toISOString().split('T')[0],
          executive_summary: summary,
          overall_status: overallStatus,
          focus_areas: ['Compliance', 'Service Delivery', 'Risk Management'],
        })
        .select()
        .single();
      
      if (reportError) throw reportError;
      
      // Create impact items from rocks
      const rockItems = (rocks || []).map((rock, i) => ({
        ...mapRockToImpactItem(rock),
        report_id: report.id,
        tenant_id: VIVACITY_TENANT_ID,
        display_order: i,
      }));
      
      // Create impact items from issues
      const issueItems = (issues || []).map((issue, i) => ({
        ...mapIssueToImpactItem(issue),
        report_id: report.id,
        tenant_id: VIVACITY_TENANT_ID,
        display_order: i,
      }));
      
      const allItems = [...rockItems, ...issueItems];
      
      if (allItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('client_impact_items')
          .insert(allItems);
        
        if (itemsError) throw itemsError;
      }
      
      return report as ClientImpactReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-impact-reports'] });
      toast.success('Impact report generated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate report');
    },
  });
}

// Hook to publish a report
export function usePublishImpactReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase
        .from('client_impact_reports')
        .update({
          is_published: true,
          published_at: new Date().toISOString(),
          published_by: user?.id,
        })
        .eq('id', reportId)
        .select()
        .single();
      
      if (error) throw error;
      return data as ClientImpactReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-impact-reports'] });
      queryClient.invalidateQueries({ queryKey: ['client-impact-report'] });
      toast.success('Report published successfully');
    },
    onError: () => {
      toast.error('Failed to publish report');
    },
  });
}

function generateExecutiveSummary(rocks: number, issues: number, period: string): string {
  const parts: string[] = [];
  
  parts.push(`This report summarises key outcomes and improvements delivered during ${period}.`);
  
  if (rocks > 0) {
    parts.push(`${rocks} strategic initiative${rocks > 1 ? 's were' : ' was'} successfully completed.`);
  }
  
  if (issues > 0) {
    parts.push(`${issues} potential risk${issues > 1 ? 's were' : ' was'} identified and addressed.`);
  }
  
  if (rocks === 0 && issues === 0) {
    parts.push('This period focused on ongoing service delivery and operational excellence.');
  }
  
  parts.push('Our team remains committed to delivering exceptional compliance and consulting outcomes.');
  
  return parts.join(' ');
}
