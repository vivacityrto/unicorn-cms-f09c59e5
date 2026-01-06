import { useState, useMemo } from 'react';
import { Package, PackageStage, Stage } from '@/hooks/usePackageBuilder';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  X, Sparkles, Lightbulb, AlertTriangle, CheckCircle2, 
  Plus, Layers, RefreshCw, Loader2
} from 'lucide-react';

interface PackageAIAssistantProps {
  packageData: Package;
  packageStages: PackageStage[];
  allStages: Stage[];
  onAddStage: (stageId: number) => Promise<void>;
  onClose: () => void;
}

interface Suggestion {
  id: string;
  type: 'stage' | 'warning' | 'recommendation' | 'conflict';
  title: string;
  description: string;
  reason?: string;
  action?: {
    label: string;
    stageId?: number;
  };
  severity?: 'info' | 'warning' | 'error';
}

const PACKAGE_TYPE_STAGE_SUGGESTIONS: Record<string, string[]> = {
  'project': ['onboarding', 'delivery', 'offboarding'],
  'membership': ['onboarding', 'support', 'offboarding'],
  'regulatory_submission': ['onboarding', 'delivery', 'support', 'offboarding']
};

const STAGE_TYPE_LABELS: Record<string, string> = {
  'onboarding': 'Onboarding',
  'delivery': 'Delivery',
  'support': 'Ongoing Support',
  'offboarding': 'Offboarding',
  'other': 'Other'
};

export function PackageAIAssistant({ 
  packageData, 
  packageStages, 
  allStages,
  onAddStage,
  onClose 
}: PackageAIAssistantProps) {
  const [addingStageId, setAddingStageId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const suggestions = useMemo(() => {
    const result: Suggestion[] = [];
    const existingStageTypes = new Set(packageStages.map(ps => ps.stage?.stage_type).filter(Boolean));
    const existingStageIds = new Set(packageStages.map(ps => ps.stage_id));

    // 1. Suggest missing lifecycle stages based on package type
    const recommendedTypes = PACKAGE_TYPE_STAGE_SUGGESTIONS[packageData.package_type || 'project'] || [];
    
    recommendedTypes.forEach(stageType => {
      if (!existingStageTypes.has(stageType)) {
        // Find a matching stage from the library
        const matchingStage = allStages.find(s => 
          s.stage_type === stageType && !existingStageIds.has(s.id)
        );
        
        result.push({
          id: `missing-${stageType}`,
          type: 'stage',
          title: `Add ${STAGE_TYPE_LABELS[stageType]} Stage`,
          description: `This ${packageData.package_type || 'project'} package typically includes an ${STAGE_TYPE_LABELS[stageType].toLowerCase()} stage.`,
          reason: `Based on analysis of similar ${packageData.package_type || 'project'} packages.`,
          action: matchingStage ? {
            label: `Add "${matchingStage.title}"`,
            stageId: matchingStage.id
          } : undefined,
          severity: stageType === 'onboarding' || stageType === 'offboarding' ? 'warning' : 'info'
        });
      }
    });

    // 2. Warn about missing onboarding
    if (!existingStageTypes.has('onboarding') && packageStages.length > 0) {
      result.push({
        id: 'warning-no-onboarding',
        type: 'warning',
        title: 'No Onboarding Stage',
        description: 'Packages without an onboarding stage may leave clients confused about how to get started.',
        reason: 'Onboarding stages help set expectations and collect required information.',
        severity: 'warning'
      });
    }

    // 3. Warn about missing offboarding
    if (!existingStageTypes.has('offboarding') && packageStages.length > 2) {
      result.push({
        id: 'warning-no-offboarding',
        type: 'warning',
        title: 'No Offboarding Stage',
        description: 'Consider adding an offboarding stage to properly close out client engagements.',
        reason: 'Proper offboarding ensures clean handoffs and final deliverables.',
        severity: 'info'
      });
    }

    // 4. Recommend popular stages for this package type
    if (packageData.package_type === 'membership' && !existingStageTypes.has('support')) {
      const supportStage = allStages.find(s => 
        s.stage_type === 'support' && !existingStageIds.has(s.id)
      );
      if (supportStage) {
        result.push({
          id: 'recommend-support',
          type: 'recommendation',
          title: 'Add Ongoing Support',
          description: 'Membership packages typically include ongoing support stages for recurring client engagement.',
          reason: 'This helps maintain regular touchpoints with members.',
          action: {
            label: `Add "${supportStage.title}"`,
            stageId: supportStage.id
          },
          severity: 'info'
        });
      }
    }

    // 5. Warn if package has no stages
    if (packageStages.length === 0) {
      result.push({
        id: 'warning-empty',
        type: 'warning',
        title: 'Package Has No Stages',
        description: 'Add stages to define the workflow for this package.',
        reason: 'Packages need at least one stage to be functional.',
        severity: 'warning'
      });
    }

    // 6. Check for reused stages with potential conflicts
    const reusedStages = packageStages.filter(ps => {
      const stage = allStages.find(s => s.id === ps.stage_id);
      return stage && (stage.usage_count || 0) > 1;
    });

    reusedStages.forEach(ps => {
      const stage = allStages.find(s => s.id === ps.stage_id);
      if (stage && (stage.usage_count || 0) > 3) {
        result.push({
          id: `reused-${ps.id}`,
          type: 'conflict',
          title: `Highly Shared: ${stage.title}`,
          description: `This stage is used in ${stage.usage_count} packages. Changes will affect all of them.`,
          reason: 'Consider duplicating this stage if you need package-specific customizations.',
          severity: 'info'
        });
      }
    });

    // 7. Check for stage order issues
    const stageTypeOrder = packageStages.map(ps => ps.stage?.stage_type);
    const onboardingIndex = stageTypeOrder.indexOf('onboarding');
    const offboardingIndex = stageTypeOrder.indexOf('offboarding');
    
    if (onboardingIndex > 0) {
      result.push({
        id: 'order-onboarding',
        type: 'warning',
        title: 'Onboarding Not First',
        description: 'The Onboarding stage is typically placed at the beginning of a package.',
        reason: 'Reorder stages so Onboarding comes first for a logical workflow.',
        severity: 'warning'
      });
    }
    
    if (offboardingIndex !== -1 && offboardingIndex !== packageStages.length - 1) {
      result.push({
        id: 'order-offboarding',
        type: 'warning',
        title: 'Offboarding Not Last',
        description: 'The Offboarding stage is typically placed at the end of a package.',
        reason: 'Reorder stages so Offboarding comes last for a logical workflow.',
        severity: 'info'
      });
    }

    return result;
  }, [packageData, packageStages, allStages]);

  const handleAddStage = async (stageId: number) => {
    try {
      setAddingStageId(stageId);
      await onAddStage(stageId);
    } finally {
      setAddingStageId(null);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <Lightbulb className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBg = (severity?: string) => {
    switch (severity) {
      case 'warning': return 'bg-amber-500/5 border-amber-500/20';
      case 'error': return 'bg-destructive/5 border-destructive/20';
      default: return 'bg-blue-500/5 border-blue-500/20';
    }
  };

  const warnings = suggestions.filter(s => s.type === 'warning');
  const stageSuggestions = suggestions.filter(s => s.type === 'stage');
  const recommendations = suggestions.filter(s => s.type === 'recommendation');
  const conflicts = suggestions.filter(s => s.type === 'conflict');

  return (
    <div className="h-full flex flex-col bg-muted/20">
      <div className="p-4 border-b bg-background flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
            <h3 className="font-semibold mb-1">Looking Good!</h3>
            <p className="text-sm text-muted-foreground">
              No suggestions at this time. Your package is well-configured.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Warnings Section */}
            {warnings.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Potential Issues ({warnings.length})
                </h4>
                {warnings.map(suggestion => (
                  <div 
                    key={suggestion.id}
                    className={`p-3 rounded-lg border ${getSeverityBg(suggestion.severity)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(suggestion.severity)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {suggestion.description}
                        </p>
                        {suggestion.reason && (
                          <p className="text-xs text-muted-foreground/80 mt-1 italic">
                            Why: {suggestion.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stage Suggestions */}
            {stageSuggestions.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-600">
                  <Layers className="h-4 w-4" />
                  Suggested Stages ({stageSuggestions.length})
                </h4>
                {stageSuggestions.map(suggestion => (
                  <div 
                    key={suggestion.id}
                    className={`p-3 rounded-lg border ${getSeverityBg(suggestion.severity)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(suggestion.severity)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {suggestion.description}
                        </p>
                        {suggestion.reason && (
                          <p className="text-xs text-muted-foreground/80 mt-1 italic">
                            Why: {suggestion.reason}
                          </p>
                        )}
                        {suggestion.action && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            disabled={addingStageId === suggestion.action.stageId}
                            onClick={() => suggestion.action?.stageId && handleAddStage(suggestion.action.stageId)}
                          >
                            {addingStageId === suggestion.action.stageId ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            {suggestion.action.label}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-600">
                  <Lightbulb className="h-4 w-4" />
                  Recommendations ({recommendations.length})
                </h4>
                {recommendations.map(suggestion => (
                  <div 
                    key={suggestion.id}
                    className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20"
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {suggestion.description}
                        </p>
                        {suggestion.reason && (
                          <p className="text-xs text-muted-foreground/80 mt-1 italic">
                            Why: {suggestion.reason}
                          </p>
                        )}
                        {suggestion.action && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            disabled={addingStageId === suggestion.action.stageId}
                            onClick={() => suggestion.action?.stageId && handleAddStage(suggestion.action.stageId)}
                          >
                            {addingStageId === suggestion.action.stageId ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            {suggestion.action.label}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Shared Stage Alerts ({conflicts.length})
                </h4>
                {conflicts.map(suggestion => (
                  <div 
                    key={suggestion.id}
                    className="p-3 rounded-lg border bg-muted/30 border-border"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {suggestion.description}
                        </p>
                        {suggestion.reason && (
                          <p className="text-xs text-muted-foreground/80 mt-1 italic">
                            Tip: {suggestion.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t bg-background">
        <p className="text-xs text-muted-foreground text-center">
          Suggestions are not auto-applied. Review and apply manually.
        </p>
      </div>
    </div>
  );
}
