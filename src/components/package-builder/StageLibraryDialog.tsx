import { useState, useMemo } from 'react';
import { usePackageBuilder, Stage } from '@/hooks/usePackageBuilder';
import { useStageTypeOptions, getStageTypeColor as getStageTypeColorHelper } from '@/hooks/useStageTypeOptions';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Check, Layers, AlertTriangle, Loader2, ShieldCheck, Eye } from 'lucide-react';
import { StagePreviewDialog } from './StagePreviewDialog';

interface StageLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStage: (stageId: number) => Promise<void>;
  existingStageIds: number[];
}

// Stage types loaded dynamically via useStageTypeOptions hook

export function StageLibraryDialog({ 
  open, 
  onOpenChange, 
  onSelectStage, 
  existingStageIds 
}: StageLibraryDialogProps) {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const { stages, createStage } = usePackageBuilder();
  
  const [activeTab, setActiveTab] = useState('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [certifiedFilter, setCertifiedFilter] = useState<string>('all');
  const [addingStageId, setAddingStageId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [previewStage, setPreviewStage] = useState<Stage | null>(null);
  const [newStage, setNewStage] = useState({
    title: '',
    short_name: '',
    description: '',
    stage_type: 'delivery',
    video_url: '',
    ai_hint: '',
    is_certified: false,
    certified_notes: ''
  });

  const filteredStages = useMemo(() => {
    return stages.filter(stage => {
      const matchesSearch = !searchQuery || 
        stage.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stage.short_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === 'all' || stage.stage_type === typeFilter;
      
      const matchesCertified = certifiedFilter === 'all' || 
        (certifiedFilter === 'certified' && stage.is_certified) ||
        (certifiedFilter === 'non-certified' && !stage.is_certified);
      
      return matchesSearch && matchesType && matchesCertified;
    });
  }, [stages, searchQuery, typeFilter, certifiedFilter]);

  const handleAddStage = async (stageId: number) => {
    try {
      setAddingStageId(stageId);
      await onSelectStage(stageId);
    } catch (error) {
      console.error('Failed to add stage:', error);
    } finally {
      setAddingStageId(null);
    }
  };

  const handleCreateStage = async () => {
    if (!newStage.title.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Stage name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsCreating(true);
      // Only allow certification fields if SuperAdmin
      const certificationData = isSuperAdmin() ? {
        is_certified: newStage.is_certified,
        certified_notes: newStage.is_certified ? newStage.certified_notes : null
      } : {
        is_certified: false,
        certified_notes: null
      };
      
      const created = await createStage({
        title: newStage.title,
        short_name: newStage.short_name,
        description: newStage.description,
        stage_type: newStage.stage_type,
        video_url: newStage.video_url,
        ai_hint: newStage.ai_hint,
        is_reusable: true,
        dashboard_visible: true,
        ...certificationData
      });

      toast({
        title: 'Stage Created',
        description: `"${newStage.title}" has been added to the library.`
      });

      // Add to package
      await onSelectStage(created.id);

      // Reset form
      setNewStage({
        title: '',
        short_name: '',
        description: '',
        stage_type: 'delivery',
        video_url: '',
        ai_hint: '',
        is_certified: false,
        certified_notes: ''
      });
      setActiveTab('library');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create stage',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const getStageTypeColor = (stageType: string) => {
    return STAGE_TYPE_OPTIONS.find(opt => opt.value === stageType)?.color || 'bg-muted text-muted-foreground';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Stage Library
          </DialogTitle>
          <DialogDescription>
            Select stages from the library or create new ones to add to your package.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">From Library</TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4 space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Stage Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {STAGE_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={certifiedFilter} onValueChange={setCertifiedFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Certified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="certified">Certified</SelectItem>
                  <SelectItem value="non-certified">Non-certified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stage List */}
            <ScrollArea className="h-[400px] pr-4">
              {filteredStages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No stages found matching your search.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStages.map(stage => {
                    const isAdded = existingStageIds.includes(stage.id);
                    const isAdding = addingStageId === stage.id;
                    const usageCount = stage.usage_count || 0;

                    return (
                      <div
                        key={stage.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isAdded ? 'bg-muted/50 border-muted' : 'hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{stage.title}</span>
                            <Badge variant="outline" className={`text-xs ${getStageTypeColor(stage.stage_type)}`}>
                              {stage.stage_type}
                            </Badge>
                            {stage.is_certified && (
                              <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Certified
                              </Badge>
                            )}
                            {usageCount > 1 && (
                              <Badge variant="secondary" className="text-xs">
                                Used in {usageCount} packages
                              </Badge>
                            )}
                          </div>
                          {stage.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {stage.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewStage(stage)}
                            className="h-8 w-8 p-0"
                            title="Preview stage"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={isAdded ? 'secondary' : 'default'}
                            disabled={isAdded || isAdding}
                            onClick={() => handleAddStage(stage.id)}
                            title={isAdded ? 'Already added to this package' : 'Add to package'}
                          >
                            {isAdding ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isAdded ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Added
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Reuse Warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Stages are reusable. Changes to a stage will affect all packages using it.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="create" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stage Name *</Label>
                <Input
                  value={newStage.title}
                  onChange={(e) => setNewStage({ ...newStage, title: e.target.value })}
                  placeholder="e.g., Client Onboarding"
                />
              </div>
              <div className="space-y-2">
                <Label>Short Name</Label>
                <Input
                  value={newStage.short_name}
                  onChange={(e) => setNewStage({ ...newStage, short_name: e.target.value })}
                  placeholder="e.g., Onboard"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Stage Type</Label>
              <Select 
                value={newStage.stage_type} 
                onValueChange={(value) => setNewStage({ ...newStage, stage_type: value })}
              >
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
              <Label>Description</Label>
              <Textarea
                value={newStage.description}
                onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
                placeholder="Describe what this stage involves..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Video URL (optional)</Label>
              <Input
                value={newStage.video_url}
                onChange={(e) => setNewStage({ ...newStage, video_url: e.target.value })}
                placeholder="https://youtube.com/..."
              />
            </div>

            <div className="space-y-2">
              <Label>AI Hint (optional)</Label>
              <Textarea
                value={newStage.ai_hint}
                onChange={(e) => setNewStage({ ...newStage, ai_hint: e.target.value })}
                placeholder="Hints for AI suggestions, e.g., 'Suggest welcome email and kickoff call task'"
                rows={2}
              />
            </div>

            {/* Certified Stage Toggle */}
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="certified-toggle" className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Certified Stage
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Mark this stage as a certified template for reuse
                  </p>
                </div>
                <Switch
                  id="certified-toggle"
                  checked={newStage.is_certified}
                  onCheckedChange={(checked) => setNewStage({ ...newStage, is_certified: checked })}
                />
              </div>
              {newStage.is_certified && (
                <div className="space-y-2">
                  <Label>Certification Notes</Label>
                  <Textarea
                    value={newStage.certified_notes}
                    onChange={(e) => setNewStage({ ...newStage, certified_notes: e.target.value })}
                    placeholder="Notes about why this stage is certified, standards met, etc."
                    rows={2}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setActiveTab('library')}>
                Cancel
              </Button>
              <Button onClick={handleCreateStage} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create & Add
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Stage Preview Dialog */}
        <StagePreviewDialog
          open={!!previewStage}
          onOpenChange={(open) => !open && setPreviewStage(null)}
          stage={previewStage}
        />
      </DialogContent>
    </Dialog>
  );
}