 import { useState, useEffect } from 'react';
 import { DashboardLayout } from '@/components/DashboardLayout';
 import { useAuth } from '@/hooks/useAuth';
 import { useRBAC } from '@/hooks/useRBAC';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { Badge } from '@/components/ui/badge';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
 import { Label } from '@/components/ui/label';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { toast } from '@/hooks/use-toast';
 import { 
   Plus, 
   Edit, 
   CheckCircle, 
   Archive, 
   Search,
   Library,
   FileText,
   AlertTriangle,
   History,
   Calendar
 } from 'lucide-react';
 import { format } from 'date-fns';
 
 interface KnowledgeItem {
   id: string;
   source_type: string;
   title: string;
   content: string;
   version: string;
   owner_user_id: string | null;
   approval_status: string;
   review_date: string | null;
   applicable_packages: any;
   applicable_phases: any;
   applicable_roles: any;
   tags: string[] | null;
   excludes_rto_2015: boolean;
   regulatory_standard: string | null;
   created_at: string;
   updated_at: string;
 }
 
 const SOURCE_TYPES = [
   { value: 'platform_doc', label: 'Platform Documentation' },
   { value: 'policy', label: 'Internal Policy' },
   { value: 'regulatory_mapping', label: 'Regulatory Mapping' },
   { value: 'package_phase', label: 'Package/Stage Definition' },
   { value: 'eos_process', label: 'EOS Process' },
   { value: 'template', label: 'Template' },
   { value: 'config_meta', label: 'Config Metadata' },
 ];
 
 const STATUS_OPTIONS = [
   { value: 'draft', label: 'Draft', color: 'secondary' },
   { value: 'approved', label: 'Approved', color: 'default' },
   { value: 'archived', label: 'Archived', color: 'outline' },
 ];
 
 export default function AdminKnowledgeLibrary() {
   const { user } = useAuth();
   const { isSuperAdmin } = useRBAC();
   
   const [items, setItems] = useState<KnowledgeItem[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState<string>('all');
   const [typeFilter, setTypeFilter] = useState<string>('all');
   
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
   const [formData, setFormData] = useState({
     title: '',
     source_type: 'platform_doc',
     content: '',
     version: '1.0',
     tags: '',
     review_date: '',
     regulatory_standard: '',
   });
   const [editReason, setEditReason] = useState('');
   const [isSaving, setIsSaving] = useState(false);
 
   useEffect(() => {
     if (isSuperAdmin) {
       loadItems();
     }
   }, [isSuperAdmin]);
 
   async function loadItems() {
     setIsLoading(true);
     const { data, error } = await supabase
       .from('knowledge_items')
       .select('*')
       .order('updated_at', { ascending: false });
     
     if (error) {
       console.error('Error loading knowledge items:', error);
       toast({ title: 'Error loading items', variant: 'destructive' });
     } else {
       setItems((data || []) as KnowledgeItem[]);
     }
     setIsLoading(false);
   }
 
   function validateContent(content: string, sourceType: string): string | null {
     // Block Standards for RTOs 2015 content
     if (sourceType === 'regulatory_mapping') {
       const content2015Patterns = [
         /standards?\s+for\s+rtos?\s+2015/i,
         /srto\s*2015/i,
         /2015\s+standards?/i,
       ];
       for (const pattern of content2015Patterns) {
         if (pattern.test(content)) {
           return 'Content referencing Standards for RTOs 2015 is not allowed. Only 2025 standards are permitted.';
         }
       }
     }
     return null;
   }
 
   async function handleSave() {
     // Validate content
     const validationError = validateContent(formData.content, formData.source_type);
     if (validationError) {
       toast({ title: 'Validation Error', description: validationError, variant: 'destructive' });
       return;
     }
 
     if (!formData.title.trim() || !formData.content.trim()) {
       toast({ title: 'Title and content are required', variant: 'destructive' });
       return;
     }
 
     setIsSaving(true);
     
     const itemData = {
       title: formData.title,
       source_type: formData.source_type,
       content: formData.content,
       version: formData.version,
       tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
       review_date: formData.review_date || null,
       regulatory_standard: formData.regulatory_standard || null,
       owner_user_id: user?.id,
       excludes_rto_2015: formData.source_type === 'regulatory_mapping',
       updated_at: new Date().toISOString(),
     };
 
     try {
       if (editingItem) {
         // Save version before update
         await supabase.from('knowledge_item_versions').insert({
           knowledge_item_id: editingItem.id,
           version: formData.version,
           content: formData.content,
           edit_reason: editReason || 'Content update',
           created_by: user?.id,
         });
 
         const { error } = await supabase
           .from('knowledge_items')
           .update(itemData)
           .eq('id', editingItem.id);
         
         if (error) throw error;
         toast({ title: 'Knowledge item updated' });
       } else {
         const { error } = await supabase
           .from('knowledge_items')
           .insert({ ...itemData, approval_status: 'draft' });
         
         if (error) throw error;
         toast({ title: 'Knowledge item created' });
       }
       
       setIsDialogOpen(false);
       resetForm();
       loadItems();
     } catch (error) {
       console.error('Error saving:', error);
       toast({ title: 'Error saving item', variant: 'destructive' });
     } finally {
       setIsSaving(false);
     }
   }
 
   async function handleApprove(item: KnowledgeItem) {
     const { error } = await supabase
       .from('knowledge_items')
       .update({ approval_status: 'approved', updated_at: new Date().toISOString() })
       .eq('id', item.id);
     
     if (error) {
       toast({ title: 'Error approving item', variant: 'destructive' });
     } else {
       toast({ title: 'Item approved for assistant use' });
       loadItems();
     }
   }
 
   async function handleArchive(item: KnowledgeItem) {
     const { error } = await supabase
       .from('knowledge_items')
       .update({ approval_status: 'archived', updated_at: new Date().toISOString() })
       .eq('id', item.id);
     
     if (error) {
       toast({ title: 'Error archiving item', variant: 'destructive' });
     } else {
       toast({ title: 'Item archived' });
       loadItems();
     }
   }
 
   function openEdit(item: KnowledgeItem) {
     setEditingItem(item);
     setFormData({
       title: item.title,
       source_type: item.source_type,
       content: item.content,
       version: item.version,
       tags: (item.tags || []).join(', '),
       review_date: item.review_date || '',
       regulatory_standard: item.regulatory_standard || '',
     });
     setEditReason('');
     setIsDialogOpen(true);
   }
 
   function openCreate() {
     setEditingItem(null);
     resetForm();
     setIsDialogOpen(true);
   }
 
   function resetForm() {
     setFormData({
       title: '',
       source_type: 'platform_doc',
       content: '',
       version: '1.0',
       tags: '',
       review_date: '',
       regulatory_standard: '',
     });
     setEditReason('');
     setEditingItem(null);
   }
 
   const filteredItems = items.filter(item => {
     const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
       item.content.toLowerCase().includes(searchQuery.toLowerCase());
     const matchesStatus = statusFilter === 'all' || item.approval_status === statusFilter;
     const matchesType = typeFilter === 'all' || item.source_type === typeFilter;
     return matchesSearch && matchesStatus && matchesType;
   });
 
   if (!isSuperAdmin) {
     return (
       <DashboardLayout>
         <div className="flex items-center justify-center h-full">
           <Card className="max-w-md">
             <CardContent className="pt-6">
               <div className="flex flex-col items-center gap-4 text-center">
                 <AlertTriangle className="h-12 w-12 text-destructive" />
                 <h2 className="text-xl font-semibold">Not Authorised</h2>
                 <p className="text-muted-foreground">
                   Knowledge Library is only available to SuperAdmins.
                 </p>
               </div>
             </CardContent>
           </Card>
         </div>
       </DashboardLayout>
     );
   }
 
   return (
     <DashboardLayout>
       <div className="p-6 space-y-6">
         {/* Header */}
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <Library className="h-8 w-8 text-primary" />
             <div>
               <h1 className="text-2xl font-bold">Knowledge Library</h1>
               <p className="text-muted-foreground">Manage assistant knowledge sources</p>
             </div>
           </div>
           <Button onClick={openCreate}>
             <Plus className="h-4 w-4 mr-2" />
             New Item
           </Button>
         </div>
 
         {/* Filters */}
         <Card>
           <CardContent className="pt-4">
             <div className="flex gap-4 flex-wrap">
               <div className="flex-1 min-w-[200px]">
                 <div className="relative">
                   <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input
                     placeholder="Search knowledge items..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="pl-9"
                   />
                 </div>
               </div>
               <Select value={statusFilter} onValueChange={setStatusFilter}>
                 <SelectTrigger className="w-[150px]">
                   <SelectValue placeholder="Status" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Status</SelectItem>
                   {STATUS_OPTIONS.map(opt => (
                     <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Select value={typeFilter} onValueChange={setTypeFilter}>
                 <SelectTrigger className="w-[200px]">
                   <SelectValue placeholder="Source Type" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Types</SelectItem>
                   {SOURCE_TYPES.map(opt => (
                     <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </CardContent>
         </Card>
 
         {/* Items List */}
         <div className="grid gap-4">
           {isLoading ? (
             <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
           ) : filteredItems.length === 0 ? (
             <Card><CardContent className="py-8 text-center text-muted-foreground">No knowledge items found</CardContent></Card>
           ) : (
             filteredItems.map(item => (
               <Card key={item.id} className="hover:shadow-md transition-shadow">
                 <CardContent className="py-4">
                   <div className="flex items-start justify-between gap-4">
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2 mb-2">
                         <FileText className="h-4 w-4 text-muted-foreground" />
                         <h3 className="font-semibold truncate">{item.title}</h3>
                         <Badge variant={
                           item.approval_status === 'approved' ? 'default' :
                           item.approval_status === 'draft' ? 'secondary' : 'outline'
                         }>
                           {item.approval_status}
                         </Badge>
                       </div>
                       <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                         {item.content.substring(0, 200)}...
                       </p>
                       <div className="flex items-center gap-4 text-xs text-muted-foreground">
                         <span className="flex items-center gap-1">
                           <Badge variant="outline" className="text-xs">{
                             SOURCE_TYPES.find(t => t.value === item.source_type)?.label || item.source_type
                           }</Badge>
                         </span>
                         <span>v{item.version}</span>
                         {item.review_date && (
                           <span className="flex items-center gap-1">
                             <Calendar className="h-3 w-3" />
                             Review: {format(new Date(item.review_date), 'MMM d, yyyy')}
                           </span>
                         )}
                         <span>Updated: {format(new Date(item.updated_at), 'MMM d, yyyy')}</span>
                       </div>
                       {item.tags && Array.isArray(item.tags) && item.tags.length > 0 && (
                         <div className="flex gap-1 mt-2 flex-wrap">
                           {item.tags.map((tag, i) => (
                             <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                           ))}
                         </div>
                       )}
                     </div>
                     <div className="flex gap-2 flex-shrink-0">
                       <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                         <Edit className="h-4 w-4" />
                       </Button>
                       {item.approval_status === 'draft' && (
                         <Button size="sm" variant="default" onClick={() => handleApprove(item)}>
                           <CheckCircle className="h-4 w-4 mr-1" />
                           Approve
                         </Button>
                       )}
                       {item.approval_status !== 'archived' && (
                         <Button size="sm" variant="outline" onClick={() => handleArchive(item)}>
                           <Archive className="h-4 w-4" />
                         </Button>
                       )}
                     </div>
                   </div>
                 </CardContent>
               </Card>
             ))
           )}
         </div>
 
         {/* Edit/Create Dialog */}
         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
           <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
             <DialogHeader>
               <DialogTitle>
                 {editingItem ? 'Edit Knowledge Item' : 'New Knowledge Item'}
               </DialogTitle>
             </DialogHeader>
             <ScrollArea className="flex-1 pr-4">
               <div className="space-y-4 py-4">
                 <div className="grid gap-4 sm:grid-cols-2">
                   <div className="space-y-2">
                     <Label>Title *</Label>
                     <Input
                       value={formData.title}
                       onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                       placeholder="Knowledge item title"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Source Type *</Label>
                     <Select value={formData.source_type} onValueChange={(v) => setFormData(p => ({ ...p, source_type: v }))}>
                       <SelectTrigger>
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         {SOURCE_TYPES.map(opt => (
                           <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
 
                 <div className="space-y-2">
                   <Label>Content *</Label>
                   <Textarea
                     value={formData.content}
                     onChange={(e) => setFormData(p => ({ ...p, content: e.target.value }))}
                     placeholder="Enter knowledge content (markdown supported)"
                     className="min-h-[200px]"
                   />
                   {formData.source_type === 'regulatory_mapping' && (
                     <p className="text-xs text-amber-600 flex items-center gap-1">
                       <AlertTriangle className="h-3 w-3" />
                       Note: Standards for RTOs 2015 content is not allowed
                     </p>
                   )}
                 </div>
 
                 <div className="grid gap-4 sm:grid-cols-2">
                   <div className="space-y-2">
                     <Label>Version</Label>
                     <Input
                       value={formData.version}
                       onChange={(e) => setFormData(p => ({ ...p, version: e.target.value }))}
                       placeholder="1.0"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Review Date</Label>
                     <Input
                       type="date"
                       value={formData.review_date}
                       onChange={(e) => setFormData(p => ({ ...p, review_date: e.target.value }))}
                     />
                   </div>
                 </div>
 
                 <div className="space-y-2">
                   <Label>Tags (comma-separated)</Label>
                   <Input
                     value={formData.tags}
                     onChange={(e) => setFormData(p => ({ ...p, tags: e.target.value }))}
                     placeholder="compliance, onboarding, process"
                   />
                 </div>
 
                 {formData.source_type === 'regulatory_mapping' && (
                   <div className="space-y-2">
                     <Label>Regulatory Standard</Label>
                     <Select value={formData.regulatory_standard} onValueChange={(v) => setFormData(p => ({ ...p, regulatory_standard: v }))}>
                       <SelectTrigger>
                         <SelectValue placeholder="Select standard" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="RTO2025">Standards for RTOs 2025</SelectItem>
                         <SelectItem value="CRICOS">CRICOS National Code</SelectItem>
                         <SelectItem value="GTO">GTO Guidance</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 )}
 
                 {editingItem && (
                   <div className="space-y-2">
                     <Label>Edit Reason *</Label>
                     <Input
                       value={editReason}
                       onChange={(e) => setEditReason(e.target.value)}
                       placeholder="Why are you making this change?"
                     />
                   </div>
                 )}
               </div>
             </ScrollArea>
             <DialogFooter>
               <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
               <Button onClick={handleSave} disabled={isSaving}>
                 {isSaving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </div>
     </DashboardLayout>
   );
 }