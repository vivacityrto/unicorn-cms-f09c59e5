import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Shared tailoring-completeness / TGA-snapshot guard logic. Originally
// inline in GovernanceDeliveryDialog.tsx (single document, many tenants);
// extracted so Bulk Generate — which can span many documents at once — can
// show the same warnings and require the same acknowledgement before
// launching a job.

export type GuardRiskLevel = 'complete' | 'partial' | 'incomplete';

export interface DeliveryGuardPair {
  tenantId: number;
  documentId: number;
}

export interface DeliveryGuardPairStatus extends DeliveryGuardPair {
  completeness: number;
  riskLevel: GuardRiskLevel;
  missingFields: string[];
}

export interface DeliveryGuardSummary {
  complete: number;
  partial: number;
  incomplete: number;
  missingSnapshot: number;
}

export function useDocumentDeliveryGuards(pairs: DeliveryGuardPair[], enabled = true) {
  const documentIds = useMemo(
    () => Array.from(new Set(pairs.map((p) => p.documentId))),
    [pairs],
  );
  const tenantIds = useMemo(
    () => Array.from(new Set(pairs.map((p) => p.tenantId))),
    [pairs],
  );
  const active = enabled && pairs.length > 0;

  const { data: requiredTagsByDoc } = useQuery({
    queryKey: ['delivery-guards-required-tags', documentIds],
    enabled: active && documentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('document_fields')
        .select('document_id, field:dd_fields(tag)')
        .in('document_id', documentIds);
      const map = new Map<number, string[]>();
      for (const row of data || []) {
        const tag = (row as any).field?.tag;
        if (!tag) continue;
        const list = map.get(row.document_id) || [];
        list.push(tag);
        map.set(row.document_id, list);
      }
      return map;
    },
  });

  const { data: tenantMergeData } = useQuery({
    queryKey: ['delivery-guards-merge-data', tenantIds],
    enabled: active && tenantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_tenant_merge_fields')
        .select('tenant_id, field_tag, value')
        .in('tenant_id', tenantIds);
      const byTenant: Record<number, Record<string, string>> = {};
      for (const row of data || []) {
        if (!byTenant[row.tenant_id]) byTenant[row.tenant_id] = {};
        byTenant[row.tenant_id][row.field_tag] = row.value ?? '';
      }
      return byTenant;
    },
  });

  const { data: snapshotByTenant } = useQuery({
    queryKey: ['delivery-guards-snapshots', tenantIds],
    enabled: active && tenantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('tga_rto_snapshots')
        .select('id, tenant_id, created_at')
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false });
      const map = new Map<number, { id: string; created_at: string }>();
      for (const s of data || []) {
        if (!map.has(s.tenant_id)) map.set(s.tenant_id, { id: s.id, created_at: s.created_at });
      }
      return map;
    },
  });

  const pairStatuses = useMemo<DeliveryGuardPairStatus[]>(() => {
    if (!active || !requiredTagsByDoc) return [];
    return pairs.map(({ tenantId, documentId }) => {
      const tags = requiredTagsByDoc.get(documentId) || [];
      if (tags.length === 0) {
        return { tenantId, documentId, completeness: 100, riskLevel: 'complete', missingFields: [] };
      }
      const data = tenantMergeData?.[tenantId] || {};
      const missing = tags.filter((tag) => !data[tag] || data[tag].trim() === '');
      const populated = tags.length - missing.length;
      const pct = Math.round((populated / tags.length) * 100);
      const riskLevel: GuardRiskLevel = pct === 100 ? 'complete' : pct >= 75 ? 'partial' : 'incomplete';
      return { tenantId, documentId, completeness: pct, riskLevel, missingFields: missing };
    });
  }, [active, pairs, requiredTagsByDoc, tenantMergeData]);

  const summary = useMemo<DeliveryGuardSummary>(() => {
    let complete = 0, partial = 0, incomplete = 0;
    for (const p of pairStatuses) {
      if (p.riskLevel === 'complete') complete++;
      else if (p.riskLevel === 'partial') partial++;
      else incomplete++;
    }
    let missingSnapshot = 0;
    for (const tenantId of tenantIds) {
      if (!snapshotByTenant?.has(tenantId)) missingSnapshot++;
    }
    return { complete, partial, incomplete, missingSnapshot };
  }, [pairStatuses, tenantIds, snapshotByTenant]);

  const isLoading = active && (!requiredTagsByDoc || !tenantMergeData || !snapshotByTenant);
  const hasBlockingIssues = summary.incomplete > 0 || summary.missingSnapshot > 0;

  return { active, isLoading, pairStatuses, summary, hasBlockingIssues };
}
