import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useProcess, useProcesses, ProcessCategory, ProcessStatus, ProcessAppliesTo, getCategoryLabel, CreateProcessInput, UpdateProcessInput } from '@/hooks/useProcesses';
import { useAuth } from '@/hooks/useAuth';
import { useTenantTeamUsers, getUserDisplayName as getTenantUserDisplayName } from '@/hooks/useTenantTeamUsers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  ArrowLeft, 
  Save,
  X,
  Calendar as CalendarIcon,
  Plus,
  AlertTriangle,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const CATEGORIES: ProcessCategory[] = [
  'eos',
  'operations', 
  'compliance', 
  'client_delivery',
  'sales_marketing',
  'finance',
  'hr_people',
  'it_systems',
  'governance',
  'risk_management',
];

const APPLIES_TO_OPTIONS: { value: ProcessAppliesTo; label: string; description: string }[] = [
  { value: 'vivacity_internal', label: 'Vivacity Internal', description: 'Internal team process' },
  { value: 'all_clients', label: 'All Clients', description: 'Applies to all clients (read-only)' },
  { value: 'specific_client', label: 'Specific Client', description: 'Future: target specific client' },
];

// User interface is now provided by useTenantTeamUsers hook

interface ProcessFormData {
  title: string;
  short_description: string;
  category: ProcessCategory;
  tags: string[];
  owner_user_id: string;
  applies_to: ProcessAppliesTo;
  applies_to_package_id: number | null;
  status: ProcessStatus;
  purpose: string;
  scope: string;
  instructions: string;
  evidence_records: string;
  related_standards: string;
  review_date: Date | null;
  reviewer_user_id: string;
}

const initialFormData: ProcessFormData = {
  title: '',
  short_description: '',
  category: 'operations',
  tags: [],
  owner_user_id: '',
  applies_to: 'vivacity_internal',
  applies_to_package_id: null,
  status: 'draft',
  purpose: '',
  scope: '',
  instructions: '',
  evidence_records: '',
  related_standards: '',
  review_date: null,
  reviewer_user_id: '',
};

export default function ProcessForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { data: existingProcess, isLoading: processLoading } = useProcess(id);
  const { createProcess, updateProcess } = useProcesses();
  
  // Use tenant team users hook - only shows internal team members, not clients
  const { data: tenantTeamUsers = [], isLoading: usersLoading } = useTenantTeamUsers();

  const isEditing = !!id && id !== 'new';

  const [formData, setFormData] = useState<ProcessFormData>(initialFormData);

  const [tagInput, setTagInput] = useState('');
  const [editReasonDialogOpen, setEditReasonDialogOpen] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Check if editing an approved process
  const isEditingApproved = isEditing && existingProcess?.status === 'approved';
  
  // Filter out current owner from reviewer options (reviewer must be different from owner)
  const reviewerOptions = useMemo(() => {
    return tenantTeamUsers.filter(u => u.user_uuid !== formData.owner_user_id);
  }, [tenantTeamUsers, formData.owner_user_id]);
  
  // Validation: if review_date is set, reviewer is required
  const isReviewerRequired = !!formData.review_date;
  const hasReviewerError = isReviewerRequired && !formData.reviewer_user_id;
  
  // Check if owner/reviewer are valid tenant team users (for existing data integrity flagging)
  const isOwnerInvalid = formData.owner_user_id && 
    tenantTeamUsers.length > 0 && 
    !tenantTeamUsers.some(u => u.user_uuid === formData.owner_user_id);
  const isReviewerInvalid = formData.reviewer_user_id && 
    tenantTeamUsers.length > 0 && 
    !tenantTeamUsers.some(u => u.user_uuid === formData.reviewer_user_id);

  useEffect(() => {
    if (existingProcess && isEditing) {
      setFormData({
        title: existingProcess.title,
        short_description: existingProcess.short_description || '',
        category: existingProcess.category,
        tags: existingProcess.tags || [],
        owner_user_id: existingProcess.owner_user_id || '',
        applies_to: existingProcess.applies_to,
        applies_to_package_id: existingProcess.applies_to_package_id,
        status: existingProcess.status,
        purpose: existingProcess.purpose || '',
        scope: existingProcess.scope || '',
        instructions: existingProcess.instructions || '',
        evidence_records: existingProcess.evidence_records || '',
        related_standards: existingProcess.related_standards || '',
        review_date: existingProcess.review_date ? new Date(existingProcess.review_date) : null,
        reviewer_user_id: existingProcess.reviewer_user_id || '',
      });
    }
  }, [existingProcess, isEditing]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    
    // Validate governance: if review_date set, reviewer required
    if (formData.review_date && !formData.reviewer_user_id) {
      return; // Form will show error message
    }
    
    // Validate owner/reviewer are not invalid (client users)
    if (isOwnerInvalid || isReviewerInvalid) {
      return; // Form will show error badges
    }

    // If editing approved, require reason
    if (isEditingApproved) {
      setEditReasonDialogOpen(true);
      return;
    }

    await performSave();
  };

  const performSave = async (reason?: string) => {
    setIsSaving(true);
    try {
      const data: CreateProcessInput | UpdateProcessInput = {
        title: formData.title.trim(),
        short_description: formData.short_description.trim() || undefined,
        category: formData.category,
        tags: formData.tags,
        owner_user_id: formData.owner_user_id || undefined,
        applies_to: formData.applies_to,
        // applies_to_package_id removed - no longer using package-based applies_to
        purpose: formData.purpose.trim() || undefined,
        scope: formData.scope.trim() || undefined,
        instructions: formData.instructions.trim() || undefined,
        evidence_records: formData.evidence_records.trim() || undefined,
        related_standards: formData.related_standards.trim() || undefined,
        review_date: formData.review_date?.toISOString().split('T')[0] || undefined,
        reviewer_user_id: formData.reviewer_user_id || undefined,
      };

      if (isEditing && existingProcess) {
        await updateProcess.mutateAsync({
          ...data,
          id: existingProcess.id,
          edit_reason: reason,
        });
      } else {
        await createProcess.mutateAsync(data);
      }

      navigate('/processes');
    } finally {
      setIsSaving(false);
      setEditReasonDialogOpen(false);
    }
  };

  // Use imported helper from hook

  if (processLoading && isEditing) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/processes')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isEditing ? 'Edit Process' : 'Create New Process'}
              </h1>
              {isEditingApproved && (
                <p className="text-sm text-warning flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-4 w-4" />
                  Editing an approved process will create a new version
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/processes')}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!formData.title.trim() || isSaving || hasReviewerError || isOwnerInvalid || isReviewerInvalid}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Process'}
            </Button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Process Ownership Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              Processes are owned and governed by your internal team. Clients may view assigned processes but cannot own or review them.
            </p>
          </div>
          
          {/* Core Fields */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Define the process title and classification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Process Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Student Enrollment Process"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Short Description</Label>
                <Textarea
                  id="description"
                  value={formData.short_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                  placeholder="Brief summary of this process"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as ProcessCategory }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Process Owner
                    {isOwnerInvalid && (
                      <Badge variant="destructive" className="ml-2 text-xs">Invalid - reassign required</Badge>
                    )}
                  </Label>
                  <Select
                    value={formData.owner_user_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, owner_user_id: value }))}
                  >
                    <SelectTrigger className={cn(isOwnerInvalid && "border-destructive")}>
                      <SelectValue placeholder="Select accountable team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantTeamUsers.map(u => (
                        <SelectItem key={u.user_uuid} value={u.user_uuid}>
                          {getTenantUserDisplayName(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Processes are owned and governed by your internal team
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add a tag"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Applies To</Label>
                  <Select
                    value={formData.applies_to}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, applies_to: value as ProcessAppliesTo }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLIES_TO_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* specific_client selection will be implemented in future */}
                {formData.applies_to === 'specific_client' && (
                  <div className="space-y-2">
                    <Label>Select Client (Future)</Label>
                    <p className="text-sm text-muted-foreground">
                      Client-specific process assignment coming soon
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Governance */}

          {/* Content Sections */}
          <Card>
            <CardHeader>
              <CardTitle>Process Content</CardTitle>
              <CardDescription>Document the process details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Textarea
                  id="purpose"
                  value={formData.purpose}
                  onChange={(e) => setFormData(prev => ({ ...prev, purpose: e.target.value }))}
                  placeholder="Describe the purpose of this process..."
                  rows={4}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="scope">Scope</Label>
                <Textarea
                  id="scope"
                  value={formData.scope}
                  onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value }))}
                  placeholder="Define what this process covers and who it applies to..."
                  rows={4}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="instructions">Step-by-Step Instructions</Label>
                <Textarea
                  id="instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Document the detailed steps of the process..."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  Use numbered lists, headings, and clear language
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="evidence">Evidence / Records Generated</Label>
                <Textarea
                  id="evidence"
                  value={formData.evidence_records}
                  onChange={(e) => setFormData(prev => ({ ...prev, evidence_records: e.target.value }))}
                  placeholder="List the documents or records this process produces..."
                  rows={4}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="standards">Related Standards or EOS Tools</Label>
                <Textarea
                  id="standards"
                  value={formData.related_standards}
                  onChange={(e) => setFormData(prev => ({ ...prev, related_standards: e.target.value }))}
                  placeholder="Reference relevant compliance standards, frameworks, or EOS tools..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Reason Dialog */}
      <Dialog open={editReasonDialogOpen} onOpenChange={setEditReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Approved Process</DialogTitle>
            <DialogDescription>
              This process is currently approved. Editing will create a new version and reset the status to Draft.
              Please provide a reason for this edit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-reason">Reason for Edit *</Label>
            <Textarea
              id="edit-reason"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Explain why this approved process needs to be edited..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReasonDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => performSave(editReason)} 
              disabled={!editReason.trim() || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
