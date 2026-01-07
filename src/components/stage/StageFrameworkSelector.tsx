import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Building2, GraduationCap, Users, Briefcase, Globe } from 'lucide-react';

export const FRAMEWORK_OPTIONS = [
  { value: 'RTO', label: 'RTO', icon: Building2, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { value: 'CRICOS', label: 'CRICOS', icon: GraduationCap, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  { value: 'GTO', label: 'GTO', icon: Briefcase, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'Membership', label: 'Membership', icon: Users, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  { value: 'Shared', label: 'Shared', icon: Globe, color: 'bg-muted text-muted-foreground border-border' },
] as const;

export type FrameworkValue = typeof FRAMEWORK_OPTIONS[number]['value'];

interface StageFrameworkSelectorProps {
  selectedFrameworks: string[];
  onChange: (frameworks: string[]) => void;
  disabled?: boolean;
}

export function StageFrameworkSelector({
  selectedFrameworks,
  onChange,
  disabled = false
}: StageFrameworkSelectorProps) {
  const handleToggle = (value: string) => {
    if (disabled) return;
    
    if (selectedFrameworks.includes(value)) {
      // If removing 'Shared', that's fine
      // If removing last item, default to Shared behavior (empty array)
      onChange(selectedFrameworks.filter(f => f !== value));
    } else {
      // Adding a framework
      if (value === 'Shared') {
        // If selecting Shared, clear other selections
        onChange(['Shared']);
      } else {
        // If selecting a specific framework, remove Shared if present
        const newSelection = [...selectedFrameworks.filter(f => f !== 'Shared'), value];
        onChange(newSelection);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {FRAMEWORK_OPTIONS.map(option => {
          const Icon = option.icon;
          const isSelected = selectedFrameworks.includes(option.value);
          
          return (
            <div
              key={option.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? option.color
                  : 'bg-background border-border hover:bg-muted/50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleToggle(option.value)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle(option.value)}
                disabled={disabled}
                className="pointer-events-none"
              />
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{option.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper to format frameworks for display
export function formatFrameworks(frameworks: string[] | null): string {
  if (!frameworks || frameworks.length === 0) return 'Shared';
  return frameworks.join(', ');
}

// Helper to get framework color
export function getFrameworkColor(framework: string): string {
  return FRAMEWORK_OPTIONS.find(f => f.value === framework)?.color || 'bg-muted text-muted-foreground';
}

// Badge display component
interface StageFrameworkBadgesProps {
  frameworks: string[] | null;
  size?: 'sm' | 'default';
}

export function StageFrameworkBadges({ frameworks, size = 'default' }: StageFrameworkBadgesProps) {
  const displayFrameworks = (!frameworks || frameworks.length === 0) ? ['Shared'] : frameworks;
  
  return (
    <div className="flex flex-wrap gap-1">
      {displayFrameworks.map(framework => {
        const option = FRAMEWORK_OPTIONS.find(f => f.value === framework);
        const Icon = option?.icon || Globe;
        
        return (
          <Badge
            key={framework}
            variant="outline"
            className={`${option?.color || 'bg-muted text-muted-foreground'} ${size === 'sm' ? 'text-xs py-0 px-1.5' : ''}`}
          >
            <Icon className={size === 'sm' ? 'h-3 w-3 mr-0.5' : 'h-3 w-3 mr-1'} />
            {framework}
          </Badge>
        );
      })}
    </div>
  );
}

// Update frameworks in database
export async function updateStageFrameworks(
  stageId: number, 
  frameworks: string[], 
  stageTitle: string,
  oldFrameworks: string[] | null
): Promise<boolean> {
  try {
    const newValue = frameworks.length === 0 ? null : frameworks;
    
    const { error } = await supabase
      .from('documents_stages')
      .update({ frameworks: newValue })
      .eq('id', stageId);
    
    if (error) throw error;
    
    // Log audit event
    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.frameworks_updated',
      details: {
        old_frameworks: oldFrameworks,
        new_frameworks: newValue,
        stage_title: stageTitle
      }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to update stage frameworks:', error);
    return false;
  }
}

// Check if frameworks are being narrowed on a certified stage
export function isFrameworksNarrowed(
  oldFrameworks: string[] | null, 
  newFrameworks: string[]
): boolean {
  const oldSet = new Set(oldFrameworks || []);
  const newSet = new Set(newFrameworks);
  
  // If old was empty (Shared), any specific frameworks narrows scope
  if (oldSet.size === 0 && newSet.size > 0 && !newSet.has('Shared')) {
    return true;
  }
  
  // Check if any old framework is being removed
  for (const framework of oldSet) {
    if (!newSet.has(framework)) {
      return true;
    }
  }
  
  return false;
}

// Check if a stage's frameworks match a package framework
export function checkFrameworkCompatibility(
  stageFrameworks: string[] | null,
  packageFramework: string
): { compatible: boolean; message: string } {
  // Empty/null frameworks = Shared = compatible with everything
  if (!stageFrameworks || stageFrameworks.length === 0 || stageFrameworks.includes('Shared')) {
    return { compatible: true, message: '' };
  }
  
  // Map package_type to framework value
  const frameworkMap: Record<string, string> = {
    'rto': 'RTO',
    'cricos': 'CRICOS',
    'gto': 'GTO',
    'membership': 'Membership',
    'project': 'RTO', // Default project type maps to RTO
    'regulatory_submission': 'RTO'
  };
  
  const mappedFramework = frameworkMap[packageFramework.toLowerCase()] || packageFramework.toUpperCase();
  
  if (stageFrameworks.includes(mappedFramework)) {
    return { compatible: true, message: '' };
  }
  
  return {
    compatible: false,
    message: `Stage frameworks: ${stageFrameworks.join(', ')}. Package framework: ${mappedFramework}.`
  };
}
