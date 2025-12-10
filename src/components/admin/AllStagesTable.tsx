import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Layers, Calendar, Pencil, Trash2, CheckCircle, XCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Stage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  created_at: string | null;
}

export function AllStagesTable() {
  const { toast } = useToast();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    short_name: "",
    description: "",
    video_url: ""
  });

  useEffect(() => {
    fetchAllStages();
  }, []);

  useEffect(() => {
    if (selectedStage) {
      setFormData({
        title: selectedStage.title || "",
        short_name: selectedStage.short_name || "",
        description: selectedStage.description || "",
        video_url: selectedStage.video_url || ""
      });
    } else {
      setFormData({
        title: "",
        short_name: "",
        description: "",
        video_url: ""
      });
    }
  }, [selectedStage, editDialogOpen]);

  const fetchAllStages = async () => {
    try {
      setLoading(true);

      // Fetch all stages from documents_stages (master table)
      const { data: stagesData, error: stagesError } = await supabase
        .from('documents_stages')
        .select('id, title, short_name, description, video_url, created_at')
        .order('created_at', { ascending: false });

      if (stagesError) throw stagesError;

      setStages(stagesData || []);
    } catch (error) {
      console.error('Error fetching stages:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStages = stages.filter(stage => 
    stage.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (stage.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
    (stage.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const handleEditClick = (e: React.MouseEvent, stage: Stage) => {
    e.stopPropagation();
    setSelectedStage(stage);
    setEditDialogOpen(true);
  };

  const handleAddClick = () => {
    setSelectedStage(null);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = async (e: React.MouseEvent, stage: Stage) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${stage.title}"?`)) return;
    
    try {
      const { error } = await supabase.from('documents_stages').delete().eq('id', stage.id);
      if (error) throw error;
      toast({ title: "Success", description: "Stage deleted successfully" });
      fetchAllStages();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete stage", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Title is required",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);

      if (selectedStage) {
        // Update existing stage
        const { error } = await supabase
          .from('documents_stages')
          .update({
            title: formData.title,
            short_name: formData.short_name || null,
            description: formData.description || null,
            video_url: formData.video_url || null
          })
          .eq('id', selectedStage.id);

        if (error) throw error;
        toast({ title: "Success", description: "Stage updated successfully" });
      } else {
        // Create new stage
        const { error } = await supabase
          .from('documents_stages')
          .insert({
            title: formData.title,
            short_name: formData.short_name || null,
            description: formData.description || null,
            video_url: formData.video_url || null
          });

        if (error) throw error;
        toast({ title: "Success", description: "Stage created successfully" });
      }

      setEditDialogOpen(false);
      setSelectedStage(null);
      fetchAllStages();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${selectedStage ? 'update' : 'create'} stage`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-sm" />
      <Skeleton className="h-96" />
    </div>;
  }

  return <div className="space-y-4">
    {/* Search and Add */}
    <div className="flex items-center justify-between gap-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search stages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
      </div>
      <Button onClick={handleAddClick} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
        <Plus className="h-4 w-4 mr-2" />
        Add Stage
      </Button>
    </div>

    {/* Stages Table */}
    {filteredStages.length === 0 ? <Card className="border-2 border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Layers className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">No stages found</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {searchQuery ? "Try adjusting your search" : "Create reusable stages that can be added to any package"}
        </p>
      </CardContent>
    </Card> : <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Stage Name</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Short Name</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Stage Details</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStages.map((stage, index) => <TableRow 
              key={stage.id} 
              onClick={() => { setSelectedStage(stage); setEditDialogOpen(true); }} 
              className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 animate-fade-in cursor-pointer`}
            >
              <TableCell className="py-6 border-r border-border/50 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="font-semibold text-foreground pb-[10px]">{stage.title}</p>
                    {stage.created_at && <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(stage.created_at), 'dd MMM yyyy')}
                    </p>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-6 border-r border-border/50 min-w-[150px]">
                <p className="text-sm text-muted-foreground">
                  {stage.short_name || '-'}
                </p>
              </TableCell>
              <TableCell className="py-6 border-r border-border/50 min-w-[300px] pr-8">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {stage.description || '-'}
                </p>
              </TableCell>
              <TableCell className="py-6 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" onClick={(e) => handleEditClick(e, stage)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10" onClick={(e) => handleDeleteClick(e, stage)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>}

    {/* Stage Dialog */}
    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
      <DialogContent className="max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {selectedStage ? 'Edit Stage' : 'Create New Stage'}
          </DialogTitle>
          <DialogDescription>
            {selectedStage ? 'Update the stage details' : 'Create a reusable stage that can be added to any package'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="stage-title">Title *</Label>
            <Input 
              id="stage-title" 
              value={formData.title} 
              onChange={e => setFormData({ ...formData, title: e.target.value })} 
              placeholder="Enter stage title" 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-short-name">Short Name</Label>
            <Input 
              id="stage-short-name" 
              value={formData.short_name} 
              onChange={e => setFormData({ ...formData, short_name: e.target.value })} 
              placeholder="Enter short name" 
            />
            <p className="text-xs text-muted-foreground">
              Used when the full stage name would be too long to display
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea 
              id="stage-description" 
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })} 
              placeholder="Enter description" 
              rows={4} 
              className="resize-none" 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-video">Help Video URL</Label>
            <Input 
              id="stage-video" 
              type="url" 
              value={formData.video_url} 
              onChange={e => setFormData({ ...formData, video_url: e.target.value })} 
              placeholder="https://..." 
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !formData.title.trim()}>
            {isLoading ? <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {selectedStage ? 'Updating...' : 'Creating...'}
            </> : <>
              <Layers className="mr-2 h-4 w-4" />
              {selectedStage ? 'Update Stage' : 'Create Stage'}
            </>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
