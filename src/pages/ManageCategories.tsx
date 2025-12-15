import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, FolderTree, Search, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Category {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator_name?: string;
}

export default function ManageCategories() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents_categories')
        .select(`
          *,
          creator:created_by (
            first_name,
            last_name
          )
        `)
        .order('id', { ascending: true });

      if (error) throw error;
      
      // Map the data to include creator_name
      const categoriesWithCreator = (data || []).map((cat: any) => ({
        ...cat,
        creator_name: cat.creator ? `${cat.creator.first_name} ${cat.creator.last_name}` : 'Unknown',
        creator: undefined // Remove the nested object
      }));
      
      setCategories(categoriesWithCreator);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Get max ID to determine next ID
      const maxId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) : 0;
      
      const { error } = await supabase
        .from('documents_categories')
        .insert({
          id: maxId + 1,
          name: formData.name.trim(),
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category created successfully',
      });

      setFormData({ name: '', description: '' });
      setIsCreateDialogOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('documents_categories')
        .update({ name: formData.name.trim() })
        .eq('id', editingCategory.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category updated successfully',
      });

      setFormData({ name: '', description: '' });
      setEditingCategory(null);
      setIsEditDialogOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!confirm('Are you sure you want to delete this category? Documents with this category will need to be reassigned.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('documents_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category deleted successfully',
      });

      fetchCategories();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, description: '' });
    setIsEditDialogOpen(true);
  };

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FolderTree className="h-8 w-8 text-primary" />
          <h1 className="text-[28px] font-bold">Manage Categories</h1>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

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
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Manage Categories</h1>
          <p className="text-muted-foreground">
            Organize documents by creating and managing categories
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
              <Plus className="h-4 w-4 mr-2" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                Create New Category
              </DialogTitle>
              <DialogDescription>
                Add a new category to organize documents
              </DialogDescription>
            </DialogHeader>
            <Separator />
            <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="name">Category Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter category name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter category description"
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
            <Separator className="my-1" />
            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="hover:bg-[#40c6e524] hover:text-black">
                Cancel
              </Button>
              <Button onClick={handleCreateCategory}>Create Category</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filteredCategories.length} result{filteredCategories.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="rounded-lg border-0 bg-card shadow-lg overflow-x-auto">
        <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r text-center w-24">ID</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Name</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Description</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Created</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Created By</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    {searchQuery ? 'No categories match your search' : 'No categories found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCategories.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((category, index) => (
                  <TableRow key={category.id} className="group hover:bg-primary/5 transition-all duration-200 border-b border-border/50 hover:border-primary/20 animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                  <TableCell className="py-6 border-r border-border/50 text-center w-24">
                    <span className="font-semibold text-foreground">{category.id}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <span className="font-semibold text-foreground">{category.name}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm">
                    {category.description || 'No description added'}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm">
                    {new Date(category.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar className="h-8 w-8 cursor-pointer">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {category.creator_name ? category.creator_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'UN'}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{category.creator_name || 'Unknown'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right py-6">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(category)}
                        className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCategory(category.id)}
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
      {filteredCategories.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredCategories.length)}–{Math.min(currentPage * itemsPerPage, filteredCategories.length)} of {filteredCategories.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.ceil(filteredCategories.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
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
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredCategories.length / itemsPerPage), p + 1))}
                  className={currentPage === Math.ceil(filteredCategories.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Edit Category
            </DialogTitle>
            <DialogDescription>
              Update category details
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Category Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter category name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter category description"
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <Separator className="my-1" />
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="hover:bg-[#40c6e524] hover:text-black">
              Cancel
            </Button>
            <Button onClick={handleEditCategory}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
