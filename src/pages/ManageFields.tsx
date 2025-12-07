import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Trash2, Plus, Search, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface Field {
  id: number;
  label: string;
  type: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator_name?: string;
}

const FIELD_TYPES = [
  'text',
  'number',
  'email',
  'password',
  'date',
  'datetime-local',
  'time',
  'tel',
  'url',
  'checkbox',
  'radio',
  'select',
  'textarea',
  'file',
  'color',
  'range',
  'search',
];

export default function ManageFields() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [formData, setFormData] = useState({
    label: '',
    type: 'text',
  });

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('documents_fields')
        .select(`
          *,
          creator:created_by (
            first_name,
            last_name
          )
        `)
        .order('label', { ascending: true });

      if (error) throw error;
      
      // Map the data to include creator_name
      const fieldsWithCreator = (data || []).map((field: any) => ({
        ...field,
        creator_name: field.creator ? `${field.creator.first_name} ${field.creator.last_name}` : 'Unknown',
        creator: undefined // Remove the nested object
      }));
      
      setFields(fieldsWithCreator);
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
        .from('documents_fields')
        .insert([{
          label: formData.label,
          type: formData.type,
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Field created successfully',
      });

      setIsCreateDialogOpen(false);
      setFormData({ label: '', type: 'text' });
      fetchFields();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = async () => {
    if (!selectedField) return;

    try {
      const { error } = await supabase
        .from('documents_fields')
        .update({
          label: formData.label,
          type: formData.type,
        })
        .eq('id', selectedField.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Field updated successfully',
      });

      setIsEditDialogOpen(false);
      setSelectedField(null);
      setFormData({ label: '', type: 'text' });
      fetchFields();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedField) return;

    try {
      const { error } = await supabase
        .from('documents_fields')
        .delete()
        .eq('id', selectedField.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Field deleted successfully',
      });

      setIsDeleteDialogOpen(false);
      setSelectedField(null);
      fetchFields();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (field: Field) => {
    setSelectedField(field);
    setFormData({
      label: field.label,
      type: field.type,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (field: Field) => {
    setSelectedField(field);
    setIsDeleteDialogOpen(true);
  };

  const filteredFields = fields.filter(field =>
    field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    field.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="container mx-auto py-6 space-y-6">
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
          <h1 className="text-[28px] font-bold">Manage Fields</h1>
          <p className="text-muted-foreground">Create and manage document fields</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
          <Plus className="mr-2 h-4 w-4" />
          New Field
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filteredFields.length} result{filteredFields.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="rounded-lg border-0 bg-card shadow-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 hover:bg-transparent">
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r text-center w-24">ID</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Label</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Type</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Created</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Created By</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16">Loading...</TableCell>
              </TableRow>
            ) : filteredFields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  {searchQuery ? 'No fields match your search' : 'No fields found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredFields.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((field, index) => (
                <TableRow key={field.id} className="group hover:bg-primary/5 transition-all duration-200 border-b border-border/50 hover:border-primary/20 animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                  <TableCell className="py-6 border-r border-border/50 text-center w-24">
                    <span className="font-semibold text-foreground">{field.id}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <span className="font-semibold text-foreground">{field.label}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <span 
                      className="text-sm"
                      style={{
                        color: 'hsl(0deg 2.39% 15.53%)',
                        background: '#b9b9b94f',
                        borderRadius: '9px',
                        paddingTop: '3px',
                        paddingBottom: '3px',
                        paddingLeft: '15px',
                        paddingRight: '15px',
                        fontSize: '13px',
                        border: '1px solid #0000001f'
                      }}
                    >
                      {field.type}
                    </span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm">
                    {new Date(field.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm">
                    {field.creator_name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-right py-6">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(field)}
                        className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(field)}
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
      {filteredFields.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredFields.length)}–{Math.min(currentPage * itemsPerPage, filteredFields.length)} of {filteredFields.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.ceil(filteredFields.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredFields.length / itemsPerPage);
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
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredFields.length / itemsPerPage), p + 1))}
                  className={currentPage === Math.ceil(filteredFields.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
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
            <DialogTitle>Create Field</DialogTitle>
            <DialogDescription>Add a new document field</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-label">Label *</Label>
              <Input
                id="create-label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Enter field label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="create-type" className="bg-background">
                  <SelectValue placeholder="Select field type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!formData.label}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>Update field information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-label">Label *</Label>
              <Input
                id="edit-label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Enter field label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="edit-type" className="bg-background">
                  <SelectValue placeholder="Select field type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={!formData.label}>
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
              This will permanently delete the field "{selectedField?.label}". This action cannot be undone.
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
