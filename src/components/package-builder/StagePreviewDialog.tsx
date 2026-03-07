import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Stage } from '@/hooks/usePackageBuilder';
import { useStageDependencyCheck } from '@/hooks/useStageDependencies';
import { useStageTypeOptions, getStageTypeColor as getStageTypeColorHelper, getStageTypeLabel as getStageTypeLabelHelper } from '@/hooks/useStageTypeOptions';
import { useStandardsReference, resolveStandardCodes } from '@/hooks/useStageStandards';
import { 
  Layers, 
  Users, 
  UserCheck, 
  Mail, 
  FileText, 
  Loader2, 
  ShieldCheck,
  Video,
  Clock,
  CheckCircle2,
  Link2,
  BookOpen
} from 'lucide-react';

interface StagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: Stage | null;
}

interface StageUsageData {
  teamTasks: Array<{
    id: string;
    name: string;
    owner_role: string;
    estimated_hours: number | null;
    is_mandatory: boolean;
    package_name?: string;
  }>;
  clientTasks: Array<{
    id: string;
    name: string;
    instructions: string | null;
    package_name?: string;
  }>;
  emails: Array<{
    id: number;
    trigger_type: string;
    recipient_type: string;
    template_name?: string;
    package_name?: string;
  }>;
  documents: Array<{
    id: number;
    doc_name: string;
    package_name?: string;
  }>;
}

// Stage types loaded dynamically via useStageTypeOptions hook

export function StagePreviewDialog({ open, onOpenChange, stage }: StagePreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [usageData, setUsageData] = useState<StageUsageData>({
    teamTasks: [],
    clientTasks: [],
    emails: [],
    documents: []
  });
  
  const { result: dependencyResult } = useStageDependencyCheck(stage?.id || null);
  const { standards: allStandards } = useStandardsReference();
  
  // Resolve standards codes to full references
  const resolvedStandards = resolveStandardCodes(
    (stage as any)?.covers_standards || null,
    allStandards
  );

  useEffect(() => {
    if (open && stage) {
      fetchStageUsageData();
    }
  }, [open, stage]);

  const fetchStageUsageData = async () => {
    if (!stage) return;
    
    setLoading(true);
    try {
      // Fetch team tasks for this stage across all packages
      const [teamTasksResult, clientTasksResult, emailsResult, documentsResult] = await Promise.all([
        (supabase as any)
          .from('package_staff_tasks')
          .select(`
            id, name, owner_role, estimated_hours, is_mandatory,
            packages:package_id (name)
          `)
          .eq('stage_id', stage.id)
          .order('order_number', { ascending: true }),
        (supabase as any)
          .from('package_client_tasks')
          .select(`
            id, name, instructions,
            packages:package_id (name)
          `)
          .eq('stage_id', stage.id)
          .order('order_number', { ascending: true }),
        supabase
          .from('package_stage_emails' as any)
          .select(`
            id, trigger_type, recipient_type,
            packages:package_id (name),
            email_templates:email_template_id (internal_name)
          `)
          .eq('stage_id', stage.id)
          .order('sort_order', { ascending: true }) as any,
        (supabase as any)
          .from('documents')
          .select(`
            id, doc_name,
            packages:package_id (name)
          `)
          .eq('stage', stage.id)
          .order('id', { ascending: true })
      ]);

      setUsageData({
        teamTasks: (teamTasksResult.data || []).map((t: any) => ({
          ...t,
          package_name: t.packages?.name
        })),
        clientTasks: (clientTasksResult.data || []).map((t: any) => ({
          ...t,
          package_name: t.packages?.name
        })),
        emails: (emailsResult.data || []).map((e: any) => ({
          ...e,
          template_name: e.email_templates?.internal_name,
          package_name: e.packages?.name
        })),
        documents: (documentsResult.data || []).map((d: any) => ({
          ...d,
          package_name: d.packages?.name
        }))
      });
    } catch (error) {
      console.error('Failed to fetch stage usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStageTypeColor = (stageType: string) => {
    return STAGE_TYPE_OPTIONS.find(opt => opt.value === stageType)?.color || 'bg-muted text-muted-foreground';
  };

  const getStageTypeLabel = (stageType: string) => {
    return STAGE_TYPE_OPTIONS.find(opt => opt.value === stageType)?.label || stageType;
  };

  if (!stage) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Stage Preview
          </DialogTitle>
          <DialogDescription>
            Read-only view of stage configuration
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Stage Header */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">{stage.title}</h3>
                <Badge variant="outline" className={`text-xs ${getStageTypeColor(stage.stage_type)}`}>
                  {getStageTypeLabel(stage.stage_type)}
                </Badge>
                {stage.is_certified && (
                  <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Certified
                  </Badge>
                )}
              </div>
              
              {(stage as any).version_label && (
                <p className="text-sm font-medium">
                  Version: <span className="text-muted-foreground">{(stage as any).version_label}</span>
                </p>
              )}
              
              <p className="text-sm">
                <span className="font-medium">Frameworks: </span>
                <span className="text-muted-foreground">
                  {(stage as any).frameworks && (stage as any).frameworks.length > 0 
                    ? (stage as any).frameworks.join(', ') 
                    : 'Shared'}
                </span>
              </p>
              
              {stage.short_name && (
                <p className="text-sm text-muted-foreground">
                  Short name: <span className="font-medium">{stage.short_name}</span>
                </p>
              )}
              
              {stage.description && (
                <p className="text-sm text-muted-foreground">{stage.description}</p>
              )}

              {stage.video_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Video className="h-4 w-4 text-blue-600" />
                  <a 
                    href={stage.video_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate"
                  >
                    {stage.video_url}
                  </a>
                </div>
              )}

              {stage.usage_count !== undefined && stage.usage_count > 0 && (
                <p className="text-sm text-muted-foreground">
                  Used in <span className="font-medium">{stage.usage_count}</span> package{stage.usage_count !== 1 ? 's' : ''}
                </p>
              )}
              
              {/* Dependencies */}
              {dependencyResult?.has_dependencies && (
                <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-2">
                    <Link2 className="h-4 w-4" />
                    Depends on:
                  </div>
                  <ul className="space-y-1">
                    {dependencyResult.resolved_dependencies.map((dep) => (
                      <li key={dep.stage_key} className="text-sm flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {dep.name}
                        {dep.version_label && (
                          <span className="text-muted-foreground">({dep.version_label})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Standards Coverage */}
              <div className="mt-3">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Standards Coverage
                </div>
                {resolvedStandards.length > 0 ? (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <ul className="space-y-1.5">
                      {resolvedStandards.map((std) => (
                        <li key={std.id} className="text-sm flex items-start gap-2">
                          <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                            {std.code}
                          </Badge>
                          <span className="text-muted-foreground">{std.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No standards mapped.</p>
                )}
              </div>
            </div>

            <Separator />

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Team Tasks */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Team Tasks</h4>
                    <Badge variant="secondary" className="text-xs">{usageData.teamTasks.length}</Badge>
                  </div>
                  {usageData.teamTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No team tasks configured</p>
                  ) : (
                    <div className="space-y-2 pl-6">
                      {usageData.teamTasks.slice(0, 5).map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                          <div className="flex items-center gap-2">
                            {task.is_mandatory ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span>{task.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">{task.owner_role}</Badge>
                        </div>
                      ))}
                      {usageData.teamTasks.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          +{usageData.teamTasks.length - 5} more tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Client Tasks */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Client Tasks</h4>
                    <Badge variant="secondary" className="text-xs">{usageData.clientTasks.length}</Badge>
                  </div>
                  {usageData.clientTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No client tasks configured</p>
                  ) : (
                    <div className="space-y-2 pl-6">
                      {usageData.clientTasks.slice(0, 5).map((task) => (
                        <div key={task.id} className="p-2 rounded-md bg-muted/30 text-sm">
                          <span>{task.name}</span>
                          {task.instructions && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {task.instructions}
                            </p>
                          )}
                        </div>
                      ))}
                      {usageData.clientTasks.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          +{usageData.clientTasks.length - 5} more tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Emails */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Email Triggers</h4>
                    <Badge variant="secondary" className="text-xs">{usageData.emails.length}</Badge>
                  </div>
                  {usageData.emails.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No email triggers configured</p>
                  ) : (
                    <div className="space-y-2 pl-6">
                      {usageData.emails.slice(0, 5).map((email) => (
                        <div key={email.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                          <span>{email.template_name || 'Unknown template'}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">
                              {email.trigger_type.replace('_', ' ')}
                            </Badge>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {email.recipient_type}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {usageData.emails.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          +{usageData.emails.length - 5} more emails
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Documents */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Documents</h4>
                    <Badge variant="secondary" className="text-xs">{usageData.documents.length}</Badge>
                  </div>
                  {usageData.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No documents configured</p>
                  ) : (
                    <div className="space-y-2 pl-6">
                      {usageData.documents.slice(0, 5).map((doc) => (
                        <div key={doc.id} className="p-2 rounded-md bg-muted/30 text-sm">
                          <span>{doc.doc_name}</span>
                        </div>
                      ))}
                      {usageData.documents.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          +{usageData.documents.length - 5} more documents
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
