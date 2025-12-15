import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, Plus, Search, ArrowLeft, ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Stage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator_name?: string;
  creator_avatar?: string | null;
}

export default function ManageStages() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [formData, setFormData] = useState({
    title: '',
    short_name: '',
    description: '',
    video_url: '',
  });

  useEffect(() => {
    fetchStages();
  }, []);

  const fetchStages = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('documents_stages')
        .select(`
          *,
          creator:created_by (
            first_name,
            last_name,
            avatar_url
          )
        `)
        .order('title', { ascending: true });

      if (error) throw error;
      
      // Map the data to include creator_name and avatar
      const stagesWithCreator = (data || []).map((stage: any) => ({
        ...stage,
        creator_name: stage.creator ? `${stage.creator.first_name} ${stage.creator.last_name}` : 'Unknown',
        creator_avatar: stage.creator?.avatar_url || null,
        creator: undefined // Remove the nested object
      }));
      
      setStages(stagesWithCreator);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const { error } = await supabase
        .from('documents_stages')
        .insert([{
          title: formData.title,
          short_name: formData.short_name || null,
          description: formData.description || null,
          video_url: formData.video_url || null,
        } as any]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Stage created successfully',
      });

      setIsCreateDialogOpen(false);
      setFormData({ title: '', short_name: '', description: '', video_url: '' });
      fetchStages();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = async () => {
    if (!selectedStage) return;

    try {
      const { error } = await supabase
        .from('documents_stages')
        .update({
          title: formData.title,
          short_name: formData.short_name || null,
          description: formData.description || null,
          video_url: formData.video_url || null,
        } as any)
        .eq('id', selectedStage.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Stage updated successfully',
      });

      setIsEditDialogOpen(false);
      setSelectedStage(null);
      setFormData({ title: '', short_name: '', description: '', video_url: '' });
      fetchStages();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedStage) return;

    try {
      const { error } = await supabase
        .from('documents_stages')
        .delete()
        .eq('id', selectedStage.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Stage deleted successfully',
      });

      setIsDeleteDialogOpen(false);
      setSelectedStage(null);
      fetchStages();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (stage: Stage) => {
    setSelectedStage(stage);
    setFormData({
      title: stage.title,
      short_name: stage.short_name || '',
      description: stage.description || '',
      video_url: stage.video_url || '',
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (stage: Stage) => {
    setSelectedStage(stage);
    setIsDeleteDialogOpen(true);
  };

  const filteredStages = stages.filter(stage =>
    stage.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stage.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stage.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/manage-documents')}
          className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
          style={{
            boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
            border: '1px solid #00000052'
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-[28px] font-bold">Manage Stages</h1>
          <p className="text-muted-foreground">Create and manage document stages</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
          <Plus className="mr-2 h-4 w-4" />
          New Stage
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input
            placeholder="Search stages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filteredStages.length} result{filteredStages.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="rounded-lg border-0 bg-card shadow-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 hover:bg-transparent">
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r text-center w-24">ID</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Title</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Description</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Video URL</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Created</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r text-center">Created By</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">Loading...</TableCell>
              </TableRow>
            ) : filteredStages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  {searchQuery ? 'No stages match your search' : 'No stages found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredStages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((stage, index) => (
                <TableRow key={stage.id} className="group hover:bg-primary/5 transition-all duration-200 border-b border-border/50 hover:border-primary/20 animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                  <TableCell className="py-6 border-r border-border/50 text-center w-24">
                    <span className="font-semibold text-foreground">{stage.id}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <span className="font-semibold text-foreground max-w-[200px] truncate whitespace-nowrap block">{stage.title}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <span className="text-muted-foreground text-sm max-w-xs truncate whitespace-nowrap block">{stage.description || 'No description added'}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    {stage.video_url ? (
                      <a 
                        href={stage.video_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge variant="default" className="gap-1 cursor-pointer bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
                          <Video className="h-3 w-3" />
                          Video Link
                        </Badge>
                      </a>
                    ) : (
                      <Badge variant="default" className="bg-muted/50 text-muted-foreground border border-muted-foreground/30 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
                        No link
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm whitespace-nowrap">
                    {new Date(stage.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <div className="flex justify-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="h-8 w-8 cursor-pointer">
                              <AvatarImage src={stage.creator_avatar || undefined} alt={stage.creator_name} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {stage.creator_name ? stage.creator_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'UN'}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{stage.creator_name || 'Unknown'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-6">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(stage)}
                        className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(stage)}
                        className="hover:bg-red-500/20 hover:text-black"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredStages.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredStages.length)}–{Math.min(currentPage * itemsPerPage, filteredStages.length)} of {filteredStages.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.ceil(filteredStages.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredStages.length / itemsPerPage);
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                  return false;
                })
                .map((page, index, array) => {
                  if (index > 0 && array[index - 1] !== page - 1) {
                    return [
                      <PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-4">...</span>
                      </PaginationItem>,
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ];
                  }
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredStages.length / itemsPerPage), p + 1))}
                  className={currentPage === Math.ceil(filteredStages.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Stage</DialogTitle>
            <DialogDescription>Add a new document stage</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="create-title">Title *</Label>
                <Input
                  id="create-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter stage title"
                />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-short-name">Short Name</Label>
              <Input
                id="create-short-name"
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                placeholder="Enter short name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-video-url">Video URL</Label>
              <Input
                id="create-video-url"
                value={formData.video_url}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                placeholder="Enter video URL"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!formData.title}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Stage</DialogTitle>
            <DialogDescription>Update stage information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter stage title"
                />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-short-name">Short Name</Label>
              <Input
                id="edit-short-name"
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                placeholder="Enter short name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-video-url">Video URL</Label>
              <Input
                id="edit-video-url"
                value={formData.video_url}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                placeholder="Enter video URL"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={!formData.title}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the stage "{selectedStage?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
