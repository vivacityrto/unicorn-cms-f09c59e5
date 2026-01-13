import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useRBAC } from '@/hooks/useRBAC';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Layers, ArrowRight, ArrowLeft, Check, Plus, Trash2, ShieldCheck, ShieldX,
  AlertTriangle, CheckCircle2, Mail, Users, FileText, Loader2, Sparkles,
  Package, Wand2, Edit2, Info
} from 'lucide-react';
import { STAGE_TEMPLATES, StageTemplate, TemplateTask, TemplateEmail } from '@/lib/stage-templates';

const STAGE_TYPE_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'support', label: 'Ongoing Support' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'other', label: 'Other' },
];

const PACKAGE_TYPE_OPTIONS = [
  { value: 'rto', label: 'RTO' },
  { value: 'cricos', label: 'CRICOS' },
  { value: 'gto', label: 'GTO' },
  { value: 'membership', label: 'Membership' },
  { value: 'other', label: 'Other' },
];

interface WizardTask extends TemplateTask {
  id: string;
  type: 'team' | 'client';
}

interface WizardEmail extends TemplateEmail {
  id: string;
  createNew: boolean;
  existingTemplateId?: string;
}

interface WizardState {
  // Step 1: Basics
  stageName: string;
  stageType: string;
  packageType: string;
  isCertified: boolean;
  templateKey: string;
  description: string;
  
  // Step 2: Content
  teamTasks: WizardTask[];
  clientTasks: WizardTask[];
  emails: WizardEmail[];
  linkDocumentsLater: boolean;
  selectedDocumentIds: number[];
  
  // Step 3: Review
  warnings: string[];
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function StageBuilder() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useRBAC();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [createdStageId, setCreatedStageId] = useState<number | null>(null);
  
  const [state, setState] = useState<WizardState>({
    stageName: '',
    stageType: 'onboarding',
    packageType: 'rto',
    isCertified: false,
    templateKey: 'blank',
    description: '',
    teamTasks: [],
    clientTasks: [],
    emails: [],
    linkDocumentsLater: true,
    selectedDocumentIds: [],
    warnings: [],
  });

  // Apply template when selected
  const handleTemplateChange = (templateKey: string) => {
    setState(prev => {
      const template = STAGE_TEMPLATES.find(t => t.key === templateKey);
      if (!template || templateKey === 'blank') {
        return {
          ...prev,
          templateKey,
          teamTasks: [],
          clientTasks: [],
          emails: [],
        };
      }
      
      return {
        ...prev,
        templateKey,
        stageType: template.defaultStageType,
        description: template.description,
        teamTasks: template.teamTasks.map(t => ({ ...t, id: generateId(), type: 'team' as const })),
        clientTasks: template.clientTasks.map(t => ({ ...t, id: generateId(), type: 'client' as const })),
        emails: template.emails.map(e => ({ ...e, id: generateId(), createNew: true })),
      };
    });
  };

  // Task handlers
  const addTask = (type: 'team' | 'client') => {
    const newTask: WizardTask = {
      id: generateId(),
      type,
      name: '',
      instructions: '',
      ownerRole: type === 'team' ? 'Admin' : undefined,
      estimatedHours: type === 'team' ? 1 : undefined,
      isMandatory: true,
    };
    
    setState(prev => ({
      ...prev,
      [type === 'team' ? 'teamTasks' : 'clientTasks']: [
        ...(type === 'team' ? prev.teamTasks : prev.clientTasks),
        newTask,
      ],
    }));
  };

  const updateTask = (type: 'team' | 'client', id: string, updates: Partial<WizardTask>) => {
    const key = type === 'team' ? 'teamTasks' : 'clientTasks';
    setState(prev => ({
      ...prev,
      [key]: prev[key].map(t => t.id === id ? { ...t, ...updates } : t),
    }));
  };

  const removeTask = (type: 'team' | 'client', id: string) => {
    const key = type === 'team' ? 'teamTasks' : 'clientTasks';
    setState(prev => ({
      ...prev,
      [key]: prev[key].filter(t => t.id !== id),
    }));
  };

  // Email handlers
  const addEmail = () => {
    const newEmail: WizardEmail = {
      id: generateId(),
      subject: '',
      bodyPreview: '',
      triggerType: 'manual',
      recipientType: 'tenant',
      createNew: true,
    };
    setState(prev => ({ ...prev, emails: [...prev.emails, newEmail] }));
  };

  const updateEmail = (id: string, updates: Partial<WizardEmail>) => {
    setState(prev => ({
      ...prev,
      emails: prev.emails.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  };

  const removeEmail = (id: string) => {
    setState(prev => ({ ...prev, emails: prev.emails.filter(e => e.id !== id) }));
  };

  // Quality checks
  const warnings = useMemo(() => {
    const warns: string[] = [];
    
    if (state.teamTasks.length === 0) {
      warns.push('No team tasks defined');
    }
    
    if ((state.stageType === 'onboarding' || state.stageType === 'offboarding') && state.clientTasks.length === 0) {
      warns.push('No client tasks for onboarding/offboarding stage');
    }
    
    if (state.stageType === 'documentation' || state.stageType === 'delivery') {
      const hasDocsReadyEmail = state.emails.some(e => 
        e.subject.toLowerCase().includes('document') || e.subject.toLowerCase().includes('ready')
      );
      if (!hasDocsReadyEmail) {
        warns.push('No "documents ready" email for documentation/delivery stage');
      }
    }
    
    if (state.linkDocumentsLater && state.selectedDocumentIds.length === 0) {
      warns.push('No documents will be linked (you can add them later)');
    }
    
    return warns;
  }, [state]);

  // Step navigation
  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 1:
        return state.stageName.trim().length > 0;
      case 2:
        return true; // Content is optional
      case 3:
        return true;
      default:
        return false;
    }
  }, [currentStep, state.stageName]);

  const nextStep = () => {
    if (canProceed && currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Create stage
  const handleCreate = async () => {
    if (!state.stageName.trim()) {
      toast({ title: 'Error', description: 'Stage name is required', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      // Generate unique stage key
      const baseKey = state.stageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const stageKey = `${baseKey}-${Date.now()}`;

      // 1. Create the stage
      const { data: newStage, error: stageError } = await supabase
        .from('documents_stages')
        .insert({
          title: state.stageName,
          description: state.description,
          stage_type: state.stageType,
          stage_key: stageKey,
          is_certified: state.isCertified,
          is_reusable: true,
          dashboard_visible: true,
          is_archived: false,
        })
        .select()
        .single();

      if (stageError || !newStage) throw new Error(stageError?.message || 'Failed to create stage');

      const stageId = newStage.id;

      // 2. Create email templates for new emails
      for (const email of state.emails) {
        if (email.createNew && email.subject.trim()) {
          const slug = `${state.stageName}-${email.subject}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
          const { data: emailTemplate, error: emailError } = await supabase
            .from('email_templates')
            .insert({
              internal_name: `${state.stageName} - ${email.subject}`.substring(0, 100),
              description: `Auto-generated for stage: ${state.stageName}`,
              slug: `${slug}-${Date.now()}`,
              subject: email.subject,
              html_body: `<p>${email.bodyPreview || 'Email content here...'}</p>`,
              from_address: 'noreply@example.com',
              reply_to: 'support@example.com',
              editor_type: 'html',
              status: 'draft',
            })
            .select()
            .single();

          if (!emailError && emailTemplate) {
            email.existingTemplateId = emailTemplate.id;
          }
        }
      }

      // 3. Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: stageId.toString(),
        action: 'stage.created',
        details: {
          created_via: 'stage_builder',
          template_used: state.templateKey,
          team_tasks_count: state.teamTasks.length,
          client_tasks_count: state.clientTasks.length,
          emails_count: state.emails.length,
        },
      });

      setCreatedStageId(stageId);
      toast({
        title: 'Stage Created!',
        description: `"${state.stageName}" has been created successfully.`,
      });
    } catch (error: any) {
      console.error('Failed to create stage:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create stage',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Access check
  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <ShieldX className="h-16 w-16 mx-auto text-destructive/50" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">
              You need Super Admin privileges to access Phase Builder.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Success screen
  if (createdStageId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[500px]">
          <Card className="w-full max-w-lg text-center">
            <CardContent className="pt-12 pb-8 space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Phase Created Successfully!</h2>
                <p className="text-muted-foreground">
                  "{state.stageName}" has been created with {state.teamTasks.length} team tasks, 
                  {' '}{state.clientTasks.length} client tasks, and {state.emails.length} emails.
                </p>
              </div>
              <div className="flex gap-3 justify-center pt-4">
                <Button variant="outline" onClick={() => {
                  setCreatedStageId(null);
                  setCurrentStep(1);
                  setState({
                    stageName: '',
                    stageType: 'onboarding',
                    packageType: 'rto',
                    isCertified: false,
                    templateKey: 'blank',
                    description: '',
                    teamTasks: [],
                    clientTasks: [],
                    emails: [],
                    linkDocumentsLater: true,
                    selectedDocumentIds: [],
                    warnings: [],
                  });
                }}>
                  Create Another
                </Button>
                <Button onClick={() => navigate(`/admin/stages/${createdStageId}`)}>
                  Open Phase Editor
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 max-w-5xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold flex items-center gap-2">
              <Wand2 className="h-7 w-7" />
              Phase Builder
            </h1>
            <p className="text-muted-foreground">
              Create a complete phase with tasks, emails, and documents in minutes
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Step {currentStep} of 3
          </Badge>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div className={`
                flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
                ${currentStep === step ? 'bg-primary text-primary-foreground' : 
                  currentStep > step ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}
              `}>
                {currentStep > step ? <Check className="h-4 w-4" /> : step}
              </div>
              <span className={`text-sm font-medium ${currentStep >= step ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step === 1 ? 'Basics' : step === 2 ? 'Content' : 'Review'}
              </span>
              {step < 3 && <div className={`flex-1 h-0.5 ${currentStep > step ? 'bg-emerald-500' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="min-h-[500px]">
          <CardContent className="pt-6">
            {/* Step 1: Basics */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <CardTitle className="text-lg mb-1">Phase Basics</CardTitle>
                  <CardDescription>Define the core properties of your new phase</CardDescription>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Phase Name *</Label>
                    <Input
                      value={state.stageName}
                      onChange={(e) => setState(prev => ({ ...prev, stageName: e.target.value }))}
                      placeholder="e.g., Client Onboarding"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Phase Type</Label>
                    <Select value={state.stageType} onValueChange={(v) => setState(prev => ({ ...prev, stageType: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_TYPE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Package Type</Label>
                    <Select value={state.packageType} onValueChange={(v) => setState(prev => ({ ...prev, packageType: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_TYPE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Based on Template</Label>
                    <Select value={state.templateKey} onValueChange={handleTemplateChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blank">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Blank (no template)
                          </span>
                        </SelectItem>
                        {STAGE_TEMPLATES.map(template => (
                          <SelectItem key={template.key} value={template.key}>
                            <span className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-primary" />
                              {template.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {state.templateKey !== 'blank' && (
                      <p className="text-xs text-muted-foreground">
                        {STAGE_TEMPLATES.find(t => t.key === state.templateKey)?.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={state.description}
                    onChange={(e) => setState(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this stage involves..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Switch
                    checked={state.isCertified}
                    onCheckedChange={(checked) => setState(prev => ({ ...prev, isCertified: checked }))}
                  />
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <ShieldCheck className="h-4 w-4" />
                    Mark as Certified Template
                  </Label>
                </div>
              </div>
            )}

            {/* Step 2: Content */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <CardTitle className="text-lg mb-1">Stage Content</CardTitle>
                  <CardDescription>Configure tasks, emails, and documents for this stage</CardDescription>
                </div>

                {/* Team Tasks */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-base font-medium">
                      <Users className="h-4 w-4" />
                      Team Tasks ({state.teamTasks.length})
                    </Label>
                    <Button size="sm" variant="outline" onClick={() => addTask('team')}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2">
                      {state.teamTasks.map((task, index) => (
                        <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                          <span className="text-xs text-muted-foreground mt-2 w-6">{index + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={task.name}
                              onChange={(e) => updateTask('team', task.id, { name: e.target.value })}
                              placeholder="Task name"
                              className="h-8"
                            />
                            <div className="flex gap-2">
                              <Select 
                                value={task.ownerRole || 'Admin'} 
                                onValueChange={(v) => updateTask('team', task.id, { ownerRole: v })}
                              >
                                <SelectTrigger className="h-7 text-xs w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                                  <SelectItem value="Admin">Admin</SelectItem>
                                  <SelectItem value="CSC">CSC</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={task.estimatedHours || ''}
                                onChange={(e) => updateTask('team', task.id, { estimatedHours: parseFloat(e.target.value) || undefined })}
                                placeholder="Hours"
                                className="h-7 text-xs w-[80px]"
                              />
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTask('team', task.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {state.teamTasks.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No team tasks. Click "Add Task" to create one.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                {/* Client Tasks */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-base font-medium">
                      <FileText className="h-4 w-4" />
                      Client Tasks ({state.clientTasks.length})
                    </Label>
                    <Button size="sm" variant="outline" onClick={() => addTask('client')}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2">
                      {state.clientTasks.map((task, index) => (
                        <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                          <span className="text-xs text-muted-foreground mt-2 w-6">{index + 1}.</span>
                          <div className="flex-1">
                            <Input
                              value={task.name}
                              onChange={(e) => updateTask('client', task.id, { name: e.target.value })}
                              placeholder="Task name (visible to client)"
                              className="h-8"
                            />
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTask('client', task.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {state.clientTasks.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No client tasks.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                {/* Emails */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-base font-medium">
                      <Mail className="h-4 w-4" />
                      Emails ({state.emails.length})
                    </Label>
                    <Button size="sm" variant="outline" onClick={addEmail}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Email
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[250px]">
                    <div className="space-y-2">
                      {state.emails.map((email, index) => (
                        <div key={email.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                          <span className="text-xs text-muted-foreground mt-2 w-6">{index + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={email.subject}
                              onChange={(e) => updateEmail(email.id, { subject: e.target.value })}
                              placeholder="Email subject"
                              className="h-8"
                            />
                            <Textarea
                              value={email.bodyPreview}
                              onChange={(e) => updateEmail(email.id, { bodyPreview: e.target.value })}
                              placeholder="Email body preview..."
                              rows={2}
                              className="text-xs"
                            />
                            <div className="flex gap-2">
                              <Select 
                                value={email.triggerType} 
                                onValueChange={(v) => updateEmail(email.id, { triggerType: v })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="on_stage_start">On Stage Start</SelectItem>
                                  <SelectItem value="on_task_complete">On Task Complete</SelectItem>
                                  <SelectItem value="manual">Manual</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select 
                                value={email.recipientType} 
                                onValueChange={(v) => updateEmail(email.id, { recipientType: v })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tenant">Tenant</SelectItem>
                                  <SelectItem value="internal">Internal</SelectItem>
                                  <SelectItem value="both">Both</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEmail(email.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {state.emails.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No emails configured.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                {/* Documents */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-base font-medium">
                    <FileText className="h-4 w-4" />
                    Documents
                  </Label>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="linkLater"
                      checked={state.linkDocumentsLater}
                      onCheckedChange={(checked) => setState(prev => ({ ...prev, linkDocumentsLater: checked === true }))}
                    />
                    <Label htmlFor="linkLater" className="text-sm cursor-pointer">
                      Link documents later (recommended)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can link documents to this stage after creation in the Stage Editor.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <CardTitle className="text-lg mb-1">Review & Create</CardTitle>
                  <CardDescription>Review your stage configuration before creating</CardDescription>
                </div>

                {/* Warnings */}
                {warnings.length > 0 && (
                  <Alert className="border-amber-500/30 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">Quality Checks</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {warnings.map((warn, i) => (
                          <li key={i} className="text-sm">{warn}</li>
                        ))}
                      </ul>
                      <p className="text-xs mt-2">You can still create the stage and add these later.</p>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Stage Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-medium">{state.stageName || '(not set)'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type:</span>
                        <Badge variant="outline" className="capitalize">{state.stageType}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Package:</span>
                        <span className="capitalize">{state.packageType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Certified:</span>
                        <span>{state.isCertified ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Template:</span>
                        <span>{state.templateKey === 'blank' ? 'None' : STAGE_TEMPLATES.find(t => t.key === state.templateKey)?.name}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Content Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Team Tasks:</span>
                        <span className="font-medium">{state.teamTasks.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Client Tasks:</span>
                        <span className="font-medium">{state.clientTasks.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emails:</span>
                        <span className="font-medium">{state.emails.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Documents:</span>
                        <span className="font-medium">{state.linkDocumentsLater ? 'Link later' : state.selectedDocumentIds.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tasks Preview */}
                {(state.teamTasks.length > 0 || state.clientTasks.length > 0) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {state.teamTasks.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Team Tasks
                        </h4>
                        <div className="space-y-1">
                          {state.teamTasks.map((task, i) => (
                            <div key={task.id} className="text-sm text-muted-foreground flex items-center gap-2">
                              <span className="text-xs">{i + 1}.</span>
                              <span>{task.name || '(unnamed)'}</span>
                              {task.ownerRole && <Badge variant="outline" className="text-xs">{task.ownerRole}</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {state.clientTasks.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Client Tasks
                        </h4>
                        <div className="space-y-1">
                          {state.clientTasks.map((task, i) => (
                            <div key={task.id} className="text-sm text-muted-foreground">
                              {i + 1}. {task.name || '(unnamed)'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Emails Preview */}
                {state.emails.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Emails
                    </h4>
                    <div className="space-y-1">
                      {state.emails.map((email, i) => (
                        <div key={email.id} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="text-xs">{i + 1}.</span>
                          <span>{email.subject || '(no subject)'}</span>
                          <Badge variant="outline" className="text-xs capitalize">{email.triggerType.replace('_', ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    After creating the stage, you can edit it in the Stage Editor to add it to packages, 
                    fine-tune content, and link documents.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep < 3 ? (
            <Button onClick={nextStep} disabled={!canProceed}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isCreating || !state.stageName.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create Stage
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
