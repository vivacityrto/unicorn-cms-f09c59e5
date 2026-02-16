import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  usePlaybookActivations,
  usePlaybookSteps,
  useUpdateActivationStatus,
  type PlaybookActivation,
} from '@/hooks/useCompliancePlaybooks';
import {
  BookOpen,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  moderate: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
};

const TRIGGER_LABELS: Record<string, string> = {
  clause_cluster: 'Clause Cluster',
  repeated_evidence_gap: 'Repeated Evidence Gap',
  regulator_overlap: 'Regulator Overlap',
  stage_stagnation: 'Stage Stagnation',
  high_risk_forecast: 'High Risk Forecast',
};

const STATUS_STYLES: Record<string, string> = {
  suggested: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  initiated: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  completed: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  dismissed: 'bg-muted text-muted-foreground',
};

interface Props {
  tenantId: number;
}

export function TenantPlaybooksPanel({ tenantId }: Props) {
  const { data: activations = [], isLoading } = usePlaybookActivations(tenantId);
  const updateStatus = useUpdateActivationStatus();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeActivations = activations.filter(
    a => a.activation_status === 'suggested' || a.activation_status === 'initiated'
  );
  const pastActivations = activations.filter(
    a => a.activation_status === 'completed' || a.activation_status === 'dismissed'
  );

  const handleInitiate = (id: string) => {
    updateStatus.mutate(
      { id, status: 'initiated', stepOrder: 1 },
      { onSuccess: () => toast({ title: 'Playbook initiated' }) }
    );
  };

  const handleDismiss = (id: string) => {
    updateStatus.mutate(
      { id, status: 'dismissed' },
      { onSuccess: () => toast({ title: 'Playbook dismissed' }) }
    );
  };

  const handleComplete = (id: string) => {
    updateStatus.mutate(
      { id, status: 'completed' },
      { onSuccess: () => toast({ title: 'Playbook completed' }) }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          Recommended Compliance Playbooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeActivations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No active playbook recommendations
          </p>
        )}

        {activeActivations.map(activation => (
          <ActivationCard
            key={activation.id}
            activation={activation}
            expanded={expandedId === activation.id}
            onToggle={() => setExpandedId(expandedId === activation.id ? null : activation.id)}
            onInitiate={() => handleInitiate(activation.id)}
            onDismiss={() => handleDismiss(activation.id)}
            onComplete={() => handleComplete(activation.id)}
            onAdvanceStep={(step) =>
              updateStatus.mutate({ id: activation.id, status: 'initiated', stepOrder: step })
            }
          />
        ))}

        {pastActivations.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Past ({pastActivations.length})</p>
            {pastActivations.slice(0, 5).map(activation => (
              <div key={activation.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate">
                    {activation.compliance_playbooks?.name || 'Playbook'}
                  </span>
                  <Badge variant="outline" className={`text-xs ${STATUS_STYLES[activation.activation_status]}`}>
                    {activation.activation_status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(activation.activated_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivationCard({
  activation,
  expanded,
  onToggle,
  onInitiate,
  onDismiss,
  onComplete,
  onAdvanceStep,
}: {
  activation: PlaybookActivation;
  expanded: boolean;
  onToggle: () => void;
  onInitiate: () => void;
  onDismiss: () => void;
  onComplete: () => void;
  onAdvanceStep: (step: number) => void;
}) {
  const playbook = activation.compliance_playbooks;
  const severity = playbook?.severity_level || 'moderate';

  return (
    <div className="border border-border rounded-md">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${
          severity === 'critical' ? 'text-destructive' :
          severity === 'high' ? 'text-amber-600' : 'text-blue-600'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {playbook?.name || 'Compliance Playbook'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{activation.activation_reason}</p>
        </div>
        <Badge variant="outline" className={`text-xs ${SEVERITY_STYLES[severity]}`}>
          {severity}
        </Badge>
        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[activation.activation_status]}`}>
          {activation.activation_status}
        </Badge>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {playbook?.description && (
            <p className="text-xs text-muted-foreground">{playbook.description}</p>
          )}

          {playbook?.related_standard_clauses && playbook.related_standard_clauses.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {playbook.related_standard_clauses.map((clause, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{clause}</Badge>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Trigger: {TRIGGER_LABELS[playbook?.trigger_type || ''] || playbook?.trigger_type}
          </p>

          {/* Steps */}
          {activation.activation_status === 'initiated' && (
            <PlaybookStepsView
              playbookId={activation.playbook_id}
              currentStep={activation.current_step_order}
              onAdvance={onAdvanceStep}
            />
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {activation.activation_status === 'suggested' && (
              <>
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={onInitiate}>
                  <Play className="w-3 h-3 mr-1" /> Initiate Playbook
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDismiss}>
                  <XCircle className="w-3 h-3 mr-1" /> Dismiss
                </Button>
              </>
            )}
            {activation.activation_status === 'initiated' && (
              <>
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={onComplete}>
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDismiss}>
                  <XCircle className="w-3 h-3 mr-1" /> Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaybookStepsView({
  playbookId,
  currentStep,
  onAdvance,
}: {
  playbookId: string;
  currentStep: number;
  onAdvance: (step: number) => void;
}) {
  const { data: steps = [], isLoading } = usePlaybookSteps(playbookId);

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;

  const STEP_TYPE_LABELS: Record<string, string> = {
    review: 'Review',
    task_creation: 'Create Task',
    template_review: 'Template Review',
    consult_required: 'Schedule Consult',
    internal_escalation: 'Internal Escalation',
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Steps</p>
      {steps.map(step => {
        const isCompleted = step.step_order < currentStep;
        const isCurrent = step.step_order === currentStep;
        return (
          <div
            key={step.id}
            className={`flex items-start gap-2 p-2 rounded text-xs ${
              isCurrent ? 'bg-primary/5 border border-primary/20' :
              isCompleted ? 'opacity-60' : 'opacity-40'
            }`}
          >
            <div className="mt-0.5">
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              ) : isCurrent ? (
                <Play className="w-3.5 h-3.5 text-primary" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {STEP_TYPE_LABELS[step.step_type] || step.step_type}
                </Badge>
                {step.requires_confirmation && (
                  <span className="text-muted-foreground">· confirmation required</span>
                )}
              </div>
              <p className="text-foreground mt-0.5">{step.step_description}</p>
              {isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs mt-1"
                  onClick={() => onAdvance(step.step_order + 1)}
                >
                  Confirm & Next
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
