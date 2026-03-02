import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StandardReference {
  id: string;
  framework: string;
  code: string;
  title: string;
  is_active: boolean;
}

// Fetch all active standards
export function useStandardsReference() {
  const [standards, setStandards] = useState<StandardReference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStandards = async () => {
      const { data, error } = await supabase
        .from('standards_reference')
        .select('*')
        .eq('is_active', true)
        .order('framework')
        .order('code');

      if (!error && data) {
        setStandards(data);
      }
      setLoading(false);
    };

    fetchStandards();
  }, []);

  return { standards, loading };
}

// Get standards filtered by frameworks
export function useFilteredStandards(frameworks: string[] | null) {
  const { standards, loading } = useStandardsReference();

  const filteredStandards = useMemo(() => {
    if (!frameworks || frameworks.length === 0 || frameworks.includes('Shared')) {
      // Show all standards for Shared or unspecified frameworks
      return standards;
    }
    // Filter to only matching frameworks
    return standards.filter(s => frameworks.includes(s.framework));
  }, [standards, frameworks]);

  return { standards: filteredStandards, allStandards: standards, loading };
}

// Resolve standard codes to full references
export function resolveStandardCodes(
  codes: string[] | null,
  allStandards: StandardReference[]
): StandardReference[] {
  if (!codes || codes.length === 0) return [];
  return codes
    .map(code => allStandards.find(s => s.code === code))
    .filter((s): s is StandardReference => !!s);
}

// Update stage standards
export async function updateStageStandards(
  stageId: number,
  oldStandards: string[] | null,
  newStandards: string[] | null,
  userId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('stages')
    .update({ covers_standards: newStandards })
    .eq('id', stageId);

  if (error) {
    console.error('Failed to update stage standards:', error);
    return false;
  }

  // Log audit event if changed
  const oldSet = new Set(oldStandards || []);
  const newSet = new Set(newStandards || []);
  const hasChanged = oldSet.size !== newSet.size || 
    [...oldSet].some(c => !newSet.has(c)) ||
    [...newSet].some(c => !oldSet.has(c));

  if (hasChanged) {
    await supabase.from('audit_events').insert({
      action: 'stage.standards_updated',
      entity: 'stage',
      entity_id: stageId.toString(),
      user_id: userId,
      details: {
        before: oldStandards || [],
        after: newStandards || []
      }
    });
  }

  return true;
}

// Check package standards coverage
export function usePackageStandardsCoverage(
  packageStages: Array<{ stage?: { covers_standards?: string[] | null; frameworks?: string[] | null } }>,
  packageFramework: string
) {
  const { standards: allStandards } = useStandardsReference();

  return useMemo(() => {
    // Map package_type to framework
    const frameworkMap: Record<string, string> = {
      'rto': 'RTO',
      'project': 'RTO',
      'regulatory_submission': 'RTO',
      'cricos': 'CRICOS',
      'gto': 'GTO',
      'membership': 'Membership'
    };
    const framework = frameworkMap[packageFramework?.toLowerCase()] || 'RTO';

    // Get all standards for this framework
    const frameworkStandards = allStandards.filter(s => s.framework === framework);

    // Collect all covered standards from stages
    const coveredCodes = new Set<string>();
    packageStages.forEach(ps => {
      const stageStandards = ps.stage?.covers_standards || [];
      stageStandards.forEach(code => coveredCodes.add(code));
    });

    // Calculate coverage
    const coveredStandards = frameworkStandards.filter(s => coveredCodes.has(s.code));
    const uncoveredStandards = frameworkStandards.filter(s => !coveredCodes.has(s.code));

    // Group by framework for display
    const coveredByFramework = coveredStandards.reduce((acc, s) => {
      if (!acc[s.framework]) acc[s.framework] = [];
      acc[s.framework].push(s);
      return acc;
    }, {} as Record<string, StandardReference[]>);

    return {
      framework,
      totalStandards: frameworkStandards.length,
      coveredCount: coveredStandards.length,
      uncoveredCount: uncoveredStandards.length,
      coveredStandards,
      uncoveredStandards,
      coveredByFramework,
      hasAnyCoverage: coveredCodes.size > 0
    };
  }, [packageStages, packageFramework, allStandards]);
}
