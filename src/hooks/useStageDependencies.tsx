import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StageDependencyInfo {
  stage_key: string;
  title: string;
  is_certified: boolean;
  version_label: string | null;
}

interface DependencyCheckResult {
  has_dependencies: boolean;
  requires_stage_keys: string[];
  resolved_dependencies: StageDependencyInfo[];
  missing_in_package?: string[]; // stage_keys that are in requires but not in package
}

// Fetch all available stages for selection (for multi-select in editor)
export function useAllStagesForDependencies() {
  const [stages, setStages] = useState<StageDependencyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStages = async () => {
      const { data, error } = await supabase
        .from('documents_stages')
        .select('stage_key, title, is_certified, version_label')
        .eq('is_archived', false)
        .order('title');
      
      if (!error && data) {
        setStages(data as StageDependencyInfo[]);
      }
      setIsLoading(false);
    };
    fetchStages();
  }, []);

  return { stages, isLoading };
}

// Resolve stage_keys to full stage info
export async function resolveStageKeys(stageKeys: string[]): Promise<StageDependencyInfo[]> {
  if (!stageKeys?.length) return [];
  
  const { data, error } = await supabase
    .from('documents_stages')
    .select('stage_key, title, is_certified, version_label')
    .in('stage_key', stageKeys);
  
  if (error || !data) return [];
  return data as StageDependencyInfo[];
}

// Check dependencies for a stage
export function useStageDependencyCheck(stageId: number | null): {
  result: DependencyCheckResult | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const [result, setResult] = useState<DependencyCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!stageId) {
      setResult(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data: stage, error } = await supabase
        .from('documents_stages')
        .select('requires_stage_keys')
        .eq('id', stageId)
        .single();

      if (error || !stage) {
        setResult(null);
        setIsLoading(false);
        return;
      }

      const requires = (stage as any).requires_stage_keys || [];
      
      if (!requires.length) {
        setResult({
          has_dependencies: false,
          requires_stage_keys: [],
          resolved_dependencies: []
        });
        setIsLoading(false);
        return;
      }

      const resolved = await resolveStageKeys(requires);
      
      setResult({
        has_dependencies: true,
        requires_stage_keys: requires,
        resolved_dependencies: resolved
      });
    } catch (err) {
      console.error('Failed to check dependencies:', err);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { result, isLoading, refetch: fetch };
}

// Check if a stage's dependencies are satisfied within a package
export async function checkDependenciesInPackage(
  stageId: number,
  packageId: number
): Promise<{ satisfied: boolean; missing: StageDependencyInfo[] }> {
  // Get stage's required stage_keys
  const { data: stage, error: stageError } = await supabase
    .from('documents_stages')
    .select('requires_stage_keys')
    .eq('id', stageId)
    .single();

  if (stageError || !stage) {
    return { satisfied: true, missing: [] };
  }

  const requires = (stage as any).requires_stage_keys || [];
  if (!requires.length) {
    return { satisfied: true, missing: [] };
  }

  // Get all stage_keys in the package
  const { data: packageStages, error: psError } = await (supabase as any)
    .from('package_stages')
    .select('stage_id, documents_stages!inner(stage_key)')
    .eq('package_id', packageId);

  if (psError || !packageStages) {
    return { satisfied: true, missing: [] };
  }

  const packageStageKeys = new Set(
    packageStages.map((ps: any) => ps.documents_stages?.stage_key).filter(Boolean)
  );

  // Find missing
  const missingKeys = requires.filter((key: string) => !packageStageKeys.has(key));
  
  if (!missingKeys.length) {
    return { satisfied: true, missing: [] };
  }

  // Resolve missing to full info
  const missingStages = await resolveStageKeys(missingKeys);
  
  return { satisfied: false, missing: missingStages };
}

// Check all unmet dependencies within a package (for readiness calculation)
export async function checkPackageDependencies(packageId: number): Promise<{
  hasUnmetDependencies: boolean;
  unmetDependencies: Array<{
    stage_title: string;
    missing_stage_keys: string[];
    missing_stage_titles: string[];
  }>;
}> {
  // Get all stages in package with their dependencies
  const { data: packageStages, error } = await (supabase as any)
    .from('package_stages')
    .select('stage_id, documents_stages!inner(title, stage_key, requires_stage_keys)')
    .eq('package_id', packageId);

  if (error || !packageStages?.length) {
    return { hasUnmetDependencies: false, unmetDependencies: [] };
  }

  // Build set of stage_keys in package
  const packageStageKeys = new Set(
    packageStages.map((ps: any) => ps.documents_stages?.stage_key).filter(Boolean)
  );

  const unmetDependencies: Array<{
    stage_title: string;
    missing_stage_keys: string[];
    missing_stage_titles: string[];
  }> = [];

  // Collect all missing keys for batch resolution
  const allMissingKeys: string[] = [];

  for (const ps of packageStages) {
    const stage = (ps as any).documents_stages;
    const requires = stage?.requires_stage_keys || [];
    const missingKeys = requires.filter((key: string) => !packageStageKeys.has(key));
    
    if (missingKeys.length > 0) {
      allMissingKeys.push(...missingKeys);
      unmetDependencies.push({
        stage_title: stage?.title || 'Unknown Stage',
        missing_stage_keys: missingKeys,
        missing_stage_titles: [] // Will be resolved
      });
    }
  }

  // Resolve all missing keys at once
  if (allMissingKeys.length > 0) {
    const uniqueKeys = [...new Set(allMissingKeys)];
    const resolved = await resolveStageKeys(uniqueKeys);
    const keyToTitle = new Map(resolved.map(s => [s.stage_key, s.title]));

    for (const dep of unmetDependencies) {
      dep.missing_stage_titles = dep.missing_stage_keys.map(
        key => keyToTitle.get(key) || key
      );
    }
  }

  return {
    hasUnmetDependencies: unmetDependencies.length > 0,
    unmetDependencies
  };
}

// Update stage dependencies
export async function updateStageDependencies(
  stageId: number, 
  stageKeys: string[],
  stageTitle?: string
): Promise<boolean> {
  // Get old value for audit
  const { data: oldStage } = await supabase
    .from('documents_stages')
    .select('requires_stage_keys')
    .eq('id', stageId)
    .single();

  const oldKeys = (oldStage as any)?.requires_stage_keys || [];

  const { error } = await supabase
    .from('documents_stages')
    .update({ requires_stage_keys: stageKeys.length > 0 ? stageKeys : null })
    .eq('id', stageId);

  if (error) {
    console.error('Failed to update dependencies:', error);
    return false;
  }

  // Log audit event if changed
  if (JSON.stringify(oldKeys.sort()) !== JSON.stringify(stageKeys.sort())) {
    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.dependencies_updated',
      details: {
        stage_title: stageTitle,
        old_dependencies: oldKeys,
        new_dependencies: stageKeys
      }
    });
  }

  return true;
}

// Check if any required stages are not certified (for certification warning)
export async function checkDependencyCertification(stageKeys: string[]): Promise<{
  allCertified: boolean;
  uncertified: string[];
}> {
  if (!stageKeys?.length) {
    return { allCertified: true, uncertified: [] };
  }

  const { data, error } = await supabase
    .from('documents_stages')
    .select('title, stage_key, is_certified')
    .in('stage_key', stageKeys);

  if (error || !data) {
    return { allCertified: true, uncertified: [] };
  }

  const uncertified = data.filter(s => !s.is_certified).map(s => s.title);
  
  return {
    allCertified: uncertified.length === 0,
    uncertified
  };
}
