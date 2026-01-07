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
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Save, Layers, Plus, GripVertical, Trash2, 
  ChevronRight, AlertTriangle, Copy, Archive,
  Lightbulb, Sparkles, PanelRightClose, PanelRightOpen, Wand2
} from 'lucide-react';
import { StageLibraryDialog } from './StageLibraryDialog';
import { StageDetailPanel } from './StageDetailPanel';
import { PackageAIAssistant } from './PackageAIAssistant';
import { AddRecommendedStagesDialog } from './AddRecommendedStagesDialog';
import { computePackageReadiness, PackageReadinessSummary } from './PackageReadinessIndicator';
import { FrameworkMismatchDialog } from './FrameworkMismatchDialog';
import { PackageStandardsCoverageDialog } from './PackageStandardsCoverageDialog';
import { PackageStageVersionBadge } from './PackageStageVersionBadge';
import { checkFrameworkCompatibility } from '@/components/stage/StageFrameworkSelector';
import { usePackageStandardsCoverage } from '@/hooks/useStageStandards';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableStageItemProps {
  id: number;
  stage: any;
  index: number;
  isSelected: boolean;
  packageId: number;
  onClick: () => void;
  onRemove: () => void;
  getStageTypeColor: (type: string) => string;
}

function SortableStageItem({ 
  id, 
  stage, 
  index, 
  isSelected, 
  packageId,
  onClick, 
  onRemove,
  getStageTypeColor 
}: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer group ${
        isSelected 
          ? 'border-primary bg-primary/5' 
          : 'hover:bg-muted/50 border-border'
      }`}
      onClick={onClick}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{stage.stage?.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {stage.stage?.stage_type && (
            <Badge variant="outline" className={`text-xs ${getStageTypeColor(stage.stage.stage_type)}`}>
              {stage.stage.stage_type}
            </Badge>
          )}
          <PackageStageVersionBadge 
            packageId={packageId} 
            stageId={stage.stage_id} 
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

export function PackageBuilderEditor() {
  const { id } = useParams<{ id: string }>();
  const packageId = id ? parseInt(id) : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { stages: allStages, duplicatePackage, archivePackage } = usePackageBuilder();
  const { 
    packageData, 
    packageStages, 
    loading, 
    updatePackageData, 
    addStageToPackage, 
    removeStageFromPackage,
    reorderStages
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
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isStageLibraryOpen, setIsStageLibraryOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [stageToRemove, setStageToRemove] = useState<number | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isRecommendedStagesOpen, setIsRecommendedStagesOpen] = useState(false);
  const [frameworkMismatch, setFrameworkMismatch] = useState<{
    stageId: number;
    stageName: string;
    stageFrameworks: string[] | null;
  } | null>(null);
  const [isStandardsCoverageOpen, setIsStandardsCoverageOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

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

  const handleDuplicate = async () => {
    if (!packageId) return;
    try {
      setIsDuplicating(true);
      const newPackage = await duplicatePackage(packageId);
      toast({
        title: 'Package Duplicated',
        description: 'A copy of this package has been created.'
      });
      navigate(`/admin/package-builder/${newPackage.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to duplicate package',
        variant: 'destructive'
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleArchive = async () => {
    if (!packageId) return;
    try {
      setIsArchiving(true);
      await archivePackage(packageId);
      toast({
        title: 'Package Archived',
        description: 'This package has been archived.'
      });
      navigate('/admin/manage-packages');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive package',
        variant: 'destructive'
      });
    } finally {
      setIsArchiving(false);
      setConfirmArchive(false);
    }
  };

  const handleAddStage = async (stageId: number) => {
    // Check framework compatibility first
    const stage = allStages.find(s => s.id === stageId);
    if (stage) {
      const isCompatible = checkFrameworkCompatibility(
        stage.frameworks as string[] | null,
        formData.package_type
      );
      
      if (!isCompatible) {
        // Show framework mismatch warning
        setFrameworkMismatch({
          stageId,
          stageName: stage.title,
          stageFrameworks: stage.frameworks as string[] | null
        });
        return;
      }
    }
    
    await doAddStage(stageId);
  };
  
  const doAddStage = async (stageId: number) => {
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
      const removedStage = packageStages.find(ps => ps.id === stageToRemove);
      await removeStageFromPackage(stageToRemove);
      if (selectedStageId === removedStage?.stage_id) {
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = packageStages.findIndex(ps => ps.id === active.id);
      const newIndex = packageStages.findIndex(ps => ps.id === over.id);
      
      const newOrder = arrayMove(packageStages, oldIndex, newIndex);
      const stageIds = newOrder.map(ps => ps.id);
      
      try {
        await reorderStages(stageIds);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder stages',
          variant: 'destructive'
        });
      }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
      case 'inactive': return 'bg-muted text-muted-foreground';
      case 'archived': return 'bg-red-500/10 text-red-600 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-4 h-[calc(100vh-180px)]">
          <Skeleton className="w-80 h-full" />
          <Skeleton className="flex-1 h-full" />
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

  // Check for framework mismatches in package
  const frameworkMismatchStages = packageStages.filter(ps => {
    const stageFrameworks = ps.stage?.frameworks as string[] | null;
    return !checkFrameworkCompatibility(stageFrameworks, formData.package_type);
  });
  
  // Standards coverage analysis
  const standardsCoverage = usePackageStandardsCoverage(packageStages, formData.package_type);

  // Compute package readiness with framework and standards escalation
  const baseReadiness = computePackageReadiness(packageStages);
  const packageReadiness = (() => {
    let status = baseReadiness.status;
    const issues = [...baseReadiness.issues];
    
    // Framework mismatch escalation
    if (frameworkMismatchStages.length > 0) {
      const frameworkIssue = 'Package includes stages outside its regulatory framework';
      if (!issues.includes(frameworkIssue)) {
        issues.push(frameworkIssue);
      }
      // Escalate: ready → incomplete, incomplete → risk
      if (status === 'ready') {
        status = 'incomplete';
      } else if (status === 'incomplete') {
        status = 'risk';
      }
    }
    
    // Zero standards coverage escalation (only escalate one level, ready → incomplete)
    if (standardsCoverage.totalStandards > 0 && standardsCoverage.coveredCount === 0) {
      const standardsIssue = 'No standards mapped to stages in this package';
      if (!issues.includes(standardsIssue)) {
        issues.push(standardsIssue);
      }
      if (status === 'ready') {
        status = 'incomplete';
      }
    }
    
    return { status: status as 'ready' | 'incomplete' | 'risk', issues };
  })();

  const selectedStage = packageStages.find(ps => ps.stage_id === selectedStageId);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/manage-packages')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-muted-foreground">{formData.name}</span>
                <span className="text-lg">—</span>
                <h1 className="text-lg font-bold">{formData.full_text || 'Untitled Package'}</h1>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {formData.package_type?.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={`text-xs ${getStatusColor(formData.status)}`}>
                  {formData.status === 'active' ? 'Active' : formData.status === 'archived' ? 'Archived' : 'Draft'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formData.duration_months} months
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(formData.package_type === 'rto' || formData.package_type === 'membership') && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsRecommendedStagesOpen(true)}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Add Recommended
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsStandardsCoverageOpen(true)}
          >
            Standards Coverage
            {standardsCoverage.totalStandards > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {standardsCoverage.coveredCount}/{standardsCoverage.totalStandards}
              </Badge>
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={showAIPanel ? 'bg-primary/10 border-primary/30' : ''}
          >
            {showAIPanel ? <PanelRightClose className="h-4 w-4 mr-2" /> : <PanelRightOpen className="h-4 w-4 mr-2" />}
            <Sparkles className="h-4 w-4 mr-1" />
            AI
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDuplicate}
            disabled={isDuplicating}
          >
            <Copy className="h-4 w-4 mr-2" />
            {isDuplicating ? 'Duplicating...' : 'Duplicate'}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setConfirmArchive(true)}
            disabled={isArchiving || formData.status === 'archived'}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Package Readiness Summary */}
      <div className="mb-4">
        <PackageReadinessSummary status={packageReadiness.status} issues={packageReadiness.issues} />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
          {/* Left Panel - Stage Timeline */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <div className="h-full flex flex-col bg-muted/20">
              <div className="p-4 border-b bg-background">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Stages
                  </h2>
                  <Button size="sm" variant="outline" onClick={() => setIsStageLibraryOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Drag to reorder. Click to configure.
                </p>
              </div>
              
              <ScrollArea className="flex-1 p-3">
                {packageStages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <Layers className="h-10 w-10 text-muted-foreground mb-3" />
                    <h3 className="font-medium mb-1 text-sm">No stages yet</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Add stages to define your package workflow.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setIsStageLibraryOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add First Stage
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={packageStages.map(ps => ps.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {packageStages.map((ps, index) => (
                          <SortableStageItem
                            key={ps.id}
                            id={ps.id}
                            stage={ps}
                            index={index}
                            isSelected={selectedStageId === ps.stage_id}
                            packageId={packageId!}
                            onClick={() => setSelectedStageId(ps.stage_id)}
                            onRemove={() => setStageToRemove(ps.id)}
                            getStageTypeColor={getStageTypeColor}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center Panel - Stage Editor or Package Details */}
          <ResizablePanel defaultSize={showAIPanel ? 50 : 75}>
            <ScrollArea className="h-full">
              <div className="p-6">
                {selectedStageId && selectedStage ? (
                  <StageDetailPanel
                    packageId={packageId!}
                    stageId={selectedStageId}
                    stage={selectedStage.stage}
                    allStages={allStages}
                    onClose={() => setSelectedStageId(null)}
                  />
                ) : (
                  <div className="space-y-6">
                    {/* Package Details */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Package Details</CardTitle>
                        <CardDescription>Configure the basic information for this package.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Package Code</Label>
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

                    {/* Select a Stage Prompt */}
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="font-semibold text-lg mb-2">Select a Stage to Configure</h3>
                        <p className="text-muted-foreground max-w-md">
                          Click on a stage from the left panel to configure its team tasks, emails, client tasks, and documents.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>

          {/* Right Panel - AI Assistant (Collapsible) */}
          {showAIPanel && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                <div className="h-full">
                  <PackageAIAssistant
                    packageData={packageData}
                    packageStages={packageStages}
                    allStages={allStages}
                    onAddStage={handleAddStage}
                    onClose={() => setShowAIPanel(false)}
                  />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
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
              The stage will remain in the library and can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveStage}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Confirmation */}
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this package? Archived packages won't be available for new clients but existing assignments will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isArchiving}>
              {isArchiving ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Recommended Stages Dialog */}
      <AddRecommendedStagesDialog
        open={isRecommendedStagesOpen}
        onOpenChange={setIsRecommendedStagesOpen}
        packageType={formData.package_type}
        allStages={allStages}
        existingStageIds={packageStages.map(ps => ps.stage_id)}
        onAddStages={async (stageIds) => {
          for (const stageId of stageIds) {
            await addStageToPackage(stageId);
          }
          toast({
            title: 'Stages Added',
            description: `${stageIds.length} recommended stage${stageIds.length !== 1 ? 's' : ''} added to package.`
          });
        }}
      />

      {/* Framework Mismatch Warning Dialog */}
      <FrameworkMismatchDialog
        open={!!frameworkMismatch}
        onOpenChange={(open) => !open && setFrameworkMismatch(null)}
        stageName={frameworkMismatch?.stageName || ''}
        stageFrameworks={frameworkMismatch?.stageFrameworks || null}
        packageFramework={formData.package_type}
        onConfirm={async () => {
          if (frameworkMismatch) {
            await doAddStage(frameworkMismatch.stageId);
          }
        }}
        onCancel={() => setFrameworkMismatch(null)}
      />

      {/* Standards Coverage Dialog */}
      <PackageStandardsCoverageDialog
        open={isStandardsCoverageOpen}
        onOpenChange={setIsStandardsCoverageOpen}
        coverage={standardsCoverage}
      />
    </div>
  );
}
