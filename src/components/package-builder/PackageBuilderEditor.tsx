import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePackageDetail, usePackageBuilder, Stage } from '@/hooks/usePackageBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Save, Layers, Plus, GripVertical, Trash2, 
  ChevronRight, AlertTriangle, Users, Clock, CheckCircle2,
  Lightbulb, Sparkles
} from 'lucide-react';
import { StageLibraryDialog } from './StageLibraryDialog';
import { StageDetailPanel } from './StageDetailPanel';
import { PackageAIAssistant } from './PackageAIAssistant';

export function PackageBuilderEditor() {
  const { id } = useParams<{ id: string }>();
  const packageId = id ? parseInt(id) : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { stages: allStages } = usePackageBuilder();
  const { 
    packageData, 
    packageStages, 
    loading, 
    updatePackageData, 
    addStageToPackage, 
    removeStageFromPackage,
    fetchPackageStages
  } = usePackageDetail(packageId);

  const [formData, setFormData] = useState({
    name: '',
    full_text: '',
    details: '',
    package_type: 'project',
    duration_months: 12,
    total_hours: 0,
    status: 'inactive'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isStageLibraryOpen, setIsStageLibraryOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [stageToRemove, setStageToRemove] = useState<number | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);

  useEffect(() => {
    if (packageData) {
      setFormData({
        name: packageData.name || '',
        full_text: packageData.full_text || '',
        details: packageData.details || '',
        package_type: packageData.package_type || 'project',
        duration_months: packageData.duration_months || 12,
        total_hours: packageData.total_hours || 0,
        status: packageData.status || 'inactive'
      });
    }
  }, [packageData]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updatePackageData(formData);
      toast({
        title: 'Package Saved',
        description: 'Your changes have been saved successfully.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save package',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStage = async (stageId: number) => {
    try {
      await addStageToPackage(stageId);
      toast({
        title: 'Stage Added',
        description: 'Stage has been added to the package.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add stage',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveStage = async () => {
    if (!stageToRemove) return;
    try {
      await removeStageFromPackage(stageToRemove);
      if (selectedStageId === packageStages.find(ps => ps.id === stageToRemove)?.stage_id) {
        setSelectedStageId(null);
      }
      toast({
        title: 'Stage Removed',
        description: 'Stage has been removed from the package.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove stage',
        variant: 'destructive'
      });
    } finally {
      setStageToRemove(null);
    }
  };

  const getStageTypeColor = (stageType: string) => {
    switch (stageType) {
      case 'onboarding': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'delivery': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'support': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'offboarding': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[400px]" />
          </div>
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (!packageData) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Package Not Found</h2>
        <p className="text-muted-foreground mb-4">The package you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/admin/manage-packages')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Packages
        </Button>
      </div>
    );
  }

  // Find missing lifecycle stages
  const stageTypes = packageStages.map(ps => ps.stage?.stage_type).filter(Boolean);
  const missingLifecycleStages = [];
  if (!stageTypes.includes('onboarding')) missingLifecycleStages.push('Onboarding');
  if (!stageTypes.includes('offboarding')) missingLifecycleStages.push('Offboarding');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/manage-packages')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{formData.full_text || 'Untitled Package'}</h1>
            <p className="text-muted-foreground">{formData.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={showAIPanel ? 'bg-primary/10' : ''}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Assistant
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* AI Warnings */}
      {missingLifecycleStages.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <span className="text-sm">
              <strong>Missing lifecycle stages:</strong> {missingLifecycleStages.join(', ')}. 
              Consider adding these for a complete package workflow.
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-auto"
              onClick={() => setIsStageLibraryOpen(true)}
            >
              Add Stages
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Package Details & Stages */}
        <div className="lg:col-span-2 space-y-6">
          {/* Package Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Package Details</CardTitle>
              <CardDescription>Configure the basic information for this package.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Abbreviation</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., KS-RTO"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Package Type</Label>
                  <Select 
                    value={formData.package_type} 
                    onValueChange={(value) => setFormData({ ...formData, package_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="membership">Membership</SelectItem>
                      <SelectItem value="regulatory_submission">Regulatory Submission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={formData.full_text}
                  onChange={(e) => setFormData({ ...formData, full_text: e.target.value })}
                  placeholder="e.g., Kickstart RTO Package"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.details}
                  onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                  placeholder="Describe what this package includes..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Duration (months)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.duration_months}
                    onChange={(e) => setFormData({ ...formData, duration_months: parseInt(e.target.value) || 12 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Hours</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.total_hours}
                    onChange={(e) => setFormData({ ...formData, total_hours: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Switch
                      checked={formData.status === 'active'}
                      onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? 'active' : 'inactive' })}
                    />
                    <span className={formData.status === 'active' ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                      {formData.status === 'active' ? 'Active' : 'Draft'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stages Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Package Stages
                </CardTitle>
                <CardDescription>
                  Define the workflow stages for this package. Click a stage to configure its tasks and emails.
                </CardDescription>
              </div>
              <Button onClick={() => setIsStageLibraryOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            </CardHeader>
            <CardContent>
              {packageStages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <Layers className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="font-medium mb-1">No stages yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add stages from the library to build your package workflow.
                  </p>
                  <Button variant="outline" onClick={() => setIsStageLibraryOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Stage
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {packageStages.map((ps, index) => (
                    <div
                      key={ps.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedStageId === ps.stage_id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedStageId(ps.stage_id)}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{ps.stage?.title}</span>
                          {ps.stage?.stage_type && (
                            <Badge variant="outline" className={`text-xs ${getStageTypeColor(ps.stage.stage_type)}`}>
                              {ps.stage.stage_type}
                            </Badge>
                          )}
                        </div>
                        {ps.stage?.short_name && (
                          <span className="text-xs text-muted-foreground">{ps.stage.short_name}</span>
                        )}
                      </div>
                      {!ps.is_required && (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStageToRemove(ps.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stage Detail or AI Panel */}
        <div className="space-y-6">
          {showAIPanel ? (
            <PackageAIAssistant
              packageData={packageData}
              packageStages={packageStages}
              allStages={allStages}
              onAddStage={handleAddStage}
              onClose={() => setShowAIPanel(false)}
            />
          ) : selectedStageId ? (
            <StageDetailPanel
              packageId={packageId!}
              stageId={selectedStageId}
              stage={packageStages.find(ps => ps.stage_id === selectedStageId)?.stage}
              onClose={() => setSelectedStageId(null)}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Select a Stage</h3>
                <p className="text-sm text-muted-foreground">
                  Click on a stage to configure its tasks, emails, and documents.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Stage Library Dialog */}
      <StageLibraryDialog
        open={isStageLibraryOpen}
        onOpenChange={setIsStageLibraryOpen}
        onSelectStage={handleAddStage}
        existingStageIds={packageStages.map(ps => ps.stage_id)}
      />

      {/* Remove Stage Confirmation */}
      <AlertDialog open={!!stageToRemove} onOpenChange={() => setStageToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this stage from the package? 
              The stage will remain in the library and can be added again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveStage}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}