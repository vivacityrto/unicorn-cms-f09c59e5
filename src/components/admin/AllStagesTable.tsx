import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Layers, Calendar, Pencil, Trash2, Plus, Loader2, ExternalLink, Tag, Video, LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
interface Stage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  created_at: string | null;
  created_by: string | null;
}
interface UserInfo {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}
export function AllStagesTable() {
  const {
    toast
  } = useToast();
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const itemsPerPage = 20;
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
    // Reset to first page when search changes
    setCurrentPage(1);
  }, [searchQuery]);
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
      const {
        data: stagesData,
        error: stagesError
      } = await supabase.from('documents_stages').select('id, title, short_name, description, video_url, created_at, created_by').order('created_at', {
        ascending: false
      });
      if (stagesError) throw stagesError;
      setStages(stagesData || []);

      // Fetch user info for created_by UUIDs
      const userIds = [...new Set((stagesData || []).filter(s => s.created_by).map(s => s.created_by as string))];
      if (userIds.length > 0) {
        const {
          data: usersData,
          error: usersError
        } = await supabase.from('users').select('user_uuid, first_name, last_name, avatar_url').in('user_uuid', userIds);
        if (!usersError && usersData) {
          const usersMap: Record<string, UserInfo> = {};
          usersData.forEach(user => {
            usersMap[user.user_uuid] = user;
          });
          setUsers(usersMap);
        }
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
    } finally {
      setLoading(false);
    }
  };
  const filteredStages = stages.filter(stage => stage.title.toLowerCase().includes(searchQuery.toLowerCase()) || (stage.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) || (stage.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false));
  const totalPages = Math.ceil(filteredStages.length / itemsPerPage);
  const paginatedStages = filteredStages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const getUserDisplay = (userId: string | null) => {
    if (!userId) return {
      name: '-',
      avatar: null,
      initials: '-'
    };
    const user = users[userId];
    if (!user) return {
      name: '-',
      avatar: null,
      initials: '-'
    };
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '-';
    const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
    return {
      name,
      avatar: user.avatar_url,
      initials
    };
  };
  const handleEditClick = (e: React.MouseEvent, stage: Stage) => {
    e.stopPropagation();
    setSelectedStage(stage);
    setEditDialogOpen(true);
  };
  const handleAddClick = () => {
    setSelectedStage(null);
    setEditDialogOpen(true);
  };
  const handleDeleteClick = (e: React.MouseEvent, stage: Stage) => {
    e.stopPropagation();
    setStageToDelete(stage);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!stageToDelete) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('documents_stages').delete().eq('id', stageToDelete.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Stage deleted successfully"
      });
      fetchAllStages();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete stage",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setStageToDelete(null);
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
        const {
          error
        } = await supabase.from('documents_stages').update({
          title: formData.title,
          short_name: formData.short_name || null,
          description: formData.description || null,
          video_url: formData.video_url || null
        }).eq('id', selectedStage.id);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Stage updated successfully"
        });
      } else {
        // Create new stage
        const {
          error
        } = await supabase.from('documents_stages').insert({
          title: formData.title,
          short_name: formData.short_name || null,
          description: formData.description || null,
          video_url: formData.video_url || null
        });
        if (error) throw error;
        toast({
          title: "Success",
          description: "Stage created successfully"
        });
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
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Stage Details</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Short Name</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Video</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Created By</TableHead>
              <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedStages.map((stage, index) => {
              const userInfo = getUserDisplay(stage.created_by);
              return <TableRow key={stage.id} onClick={() => {
                setSelectedStage(stage);
                setEditDialogOpen(true);
              }} className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 animate-fade-in cursor-pointer`}>
                  <TableCell className="py-6 border-r border-border/50 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-semibold text-foreground whitespace-nowrap pb-2.5">{stage.title}</p>
                        {stage.short_name && <p className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap mt-1">
                          <Tag className="h-3 w-3" />
                          {stage.short_name}
                        </p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 min-w-[200px]">
                    <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                      {stage.description || 'No details added.'}
                    </p>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-sm text-muted-foreground whitespace-nowrap truncate max-w-[130px]">
                        {stage.created_at ? format(new Date(stage.created_at), 'dd MMM yyyy') : '-'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 min-w-[150px]">
                    {stage.video_url ? (
                      <a href={stage.video_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] gap-1.5">
                          <Video className="h-3 w-3" />
                          Video Link
                        </Badge>
                      </a>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground hover:bg-muted border border-border text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] gap-1.5">
                        <LinkIcon className="h-3 w-3" />
                        No Link
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={userInfo.avatar || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {userInfo.initials}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm text-muted-foreground whitespace-nowrap truncate max-w-[120px]">
                        {userInfo.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" onClick={e => handleEditClick(e, stage)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10" onClick={e => handleDeleteClick(e, stage)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>;
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>}

    {/* Pagination */}
    {filteredStages.length > 0 && <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredStages.length)}–{Math.min(currentPage * itemsPerPage, filteredStages.length)} of {filteredStages.length} results
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
            {Array.from({
            length: totalPages
          }, (_, i) => i + 1).filter(page => {
            if (totalPages <= 7) return true;
            if (page === 1 || page === totalPages) return true;
            if (page >= currentPage - 1 && page <= currentPage + 1) return true;
            return false;
          }).map((page, index, array) => {
            if (index > 0 && array[index - 1] !== page - 1) {
              return [<PaginationItem key={`ellipsis-${page}`}>
                      <span className="px-4">...</span>
                    </PaginationItem>, <PaginationItem key={page}>
                      <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                        {page}
                      </PaginationLink>
                    </PaginationItem>];
            }
            return <PaginationItem key={page}>
                    <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                      {page}
                    </PaginationLink>
                  </PaginationItem>;
          })}
            <PaginationItem>
              <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>}

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
            <Input id="stage-title" value={formData.title} onChange={e => setFormData({
              ...formData,
              title: e.target.value
            })} placeholder="Enter stage title" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-short-name">Short Name</Label>
            <Input id="stage-short-name" value={formData.short_name} onChange={e => setFormData({
              ...formData,
              short_name: e.target.value
            })} placeholder="Enter short name" />
            <p className="text-xs text-muted-foreground">
              Used when the full stage name would be too long to display
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea id="stage-description" value={formData.description} onChange={e => setFormData({
              ...formData,
              description: e.target.value
            })} placeholder="Enter description" rows={4} className="resize-none" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-video">Help Video URL</Label>
            <Input id="stage-video" type="url" value={formData.video_url} onChange={e => setFormData({
              ...formData,
              video_url: e.target.value
            })} placeholder="https://..." />
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

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Stage</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{stageToDelete?.title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}