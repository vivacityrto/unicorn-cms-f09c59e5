 import { useState, useEffect } from 'react';
 import { DashboardLayout } from '@/components/DashboardLayout';
 import { useAuth } from '@/hooks/useAuth';
 import { useRBAC } from '@/hooks/useRBAC';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent } from '@/components/ui/card';
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
   Cog,
   AlertTriangle,
   Calendar,
   Trash2
 } from 'lucide-react';
 import { format } from 'date-fns';
 
 interface EOSProcess {
   id: string;
   title: string;
   eos_component: string;
   purpose: string | null;
   scope: string | null;
   steps: any;
   inputs: any;
   outputs: any;
   roles_responsible: any;
   evidence_records: any;
   version: string;
   approval_status: string;
   review_date: string | null;
   owner_user_id: string | null;
   created_at: string;
   updated_at: string;
 }
 
 const EOS_COMPONENTS = [
   { value: 'Vision', label: 'Vision' },
   { value: 'People', label: 'People' },
   { value: 'Data', label: 'Data' },
   { value: 'Issues', label: 'Issues' },
   { value: 'Process', label: 'Process' },
   { value: 'Traction', label: 'Traction' },
 ];
 
 const STATUS_OPTIONS = [
   { value: 'draft', label: 'Draft' },
   { value: 'approved', label: 'Approved' },
   { value: 'archived', label: 'Archived' },
 ];
 
 interface Step {
   order: number;
   description: string;
 }
 
 export default function AdminEOSProcesses() {
   const { user } = useAuth();
   const { isSuperAdmin } = useRBAC();
   
   const [processes, setProcesses] = useState<EOSProcess[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState<string>('all');
   const [componentFilter, setComponentFilter] = useState<string>('all');
   
   const [isDialogOpen, setIsDialogOpen] = useState(false);
   const [editingProcess, setEditingProcess] = useState<EOSProcess | null>(null);
   const [formData, setFormData] = useState({
     title: '',
     eos_component: 'Vision',
     purpose: '',
     scope: '',
     version: '1.0',
     review_date: '',
     inputs: '',
     outputs: '',
     roles_responsible: '',
     evidence_records: '',
   });
   const [steps, setSteps] = useState<Step[]>([{ order: 1, description: '' }]);
   const [editReason, setEditReason] = useState('');
   const [isSaving, setIsSaving] = useState(false);
 
   useEffect(() => {
     if (isSuperAdmin) {
       loadProcesses();
     }
   }, [isSuperAdmin]);
 
   async function loadProcesses() {
     setIsLoading(true);
     const { data, error } = await supabase
       .from('eos_processes')
       .select('*')
       .order('updated_at', { ascending: false });
     
     if (error) {
       console.error('Error loading processes:', error);
       toast({ title: 'Error loading processes', variant: 'destructive' });
     } else {
       setProcesses((data || []) as EOSProcess[]);
     }
     setIsLoading(false);
   }
 
   async function handleSave() {
     if (!formData.title.trim()) {
       toast({ title: 'Title is required', variant: 'destructive' });
       return;
     }
 
     setIsSaving(true);
     
     const processData = {
       title: formData.title,
       eos_component: formData.eos_component,
       purpose: formData.purpose || null,
       scope: formData.scope || null,
       version: formData.version,
       review_date: formData.review_date || null,
       steps: steps.filter(s => s.description.trim()),
       inputs: formData.inputs.split('\n').map(i => i.trim()).filter(Boolean),
       outputs: formData.outputs.split('\n').map(o => o.trim()).filter(Boolean),
       roles_responsible: formData.roles_responsible.split(',').map(r => r.trim()).filter(Boolean),
       evidence_records: formData.evidence_records.split('\n').map(e => e.trim()).filter(Boolean),
       owner_user_id: user?.id,
       updated_at: new Date().toISOString(),
     };
 
     try {
       if (editingProcess) {
         // Save version before update
         await supabase.from('eos_process_versions').insert({
           eos_process_id: editingProcess.id,
           version: formData.version,
           content_snapshot: processData as any,
           edit_reason: editReason || 'Process update',
           created_by: user?.id,
         });
 
         const { error } = await supabase
           .from('eos_processes')
           .update(processData as any)
           .eq('id', editingProcess.id);
         
         if (error) throw error;
         toast({ title: 'Process updated' });
       } else {
         const { error } = await supabase
           .from('eos_processes')
           .insert({ ...processData, approval_status: 'draft' } as any);
         
         if (error) throw error;
         toast({ title: 'Process created' });
       }
       
       setIsDialogOpen(false);
       resetForm();
       loadProcesses();
     } catch (error) {
       console.error('Error saving:', error);
       toast({ title: 'Error saving process', variant: 'destructive' });
     } finally {
       setIsSaving(false);
     }
   }
 
   async function handleApprove(process: EOSProcess) {
     const { error } = await supabase
       .from('eos_processes')
       .update({ approval_status: 'approved', updated_at: new Date().toISOString() })
       .eq('id', process.id);
     
     if (error) {
       toast({ title: 'Error approving process', variant: 'destructive' });
     } else {
       toast({ title: 'Process approved for assistant use' });
       loadProcesses();
     }
   }
 
   async function handleArchive(process: EOSProcess) {
     const { error } = await supabase
       .from('eos_processes')
       .update({ approval_status: 'archived', updated_at: new Date().toISOString() })
       .eq('id', process.id);
     
     if (error) {
       toast({ title: 'Error archiving process', variant: 'destructive' });
     } else {
       toast({ title: 'Process archived' });
       loadProcesses();
     }
   }
 
   function openEdit(process: EOSProcess) {
     setEditingProcess(process);
     setFormData({
       title: process.title,
       eos_component: process.eos_component,
       purpose: process.purpose || '',
       scope: process.scope || '',
       version: process.version,
       review_date: process.review_date || '',
       inputs: (process.inputs || []).join('\n'),
       outputs: (process.outputs || []).join('\n'),
       roles_responsible: (process.roles_responsible || []).join(', '),
       evidence_records: (process.evidence_records || []).join('\n'),
     });
     const processSteps = Array.isArray(process.steps) ? process.steps : [];
     setSteps(processSteps.length ? processSteps : [{ order: 1, description: '' }]);
     setEditReason('');
     setIsDialogOpen(true);
   }
 
   function openCreate() {
     setEditingProcess(null);
     resetForm();
     setIsDialogOpen(true);
   }
 
   function resetForm() {
     setFormData({
       title: '',
       eos_component: 'Vision',
       purpose: '',
       scope: '',
       version: '1.0',
       review_date: '',
       inputs: '',
       outputs: '',
       roles_responsible: '',
       evidence_records: '',
     });
     setSteps([{ order: 1, description: '' }]);
     setEditReason('');
     setEditingProcess(null);
   }
 
   function addStep() {
     setSteps([...steps, { order: steps.length + 1, description: '' }]);
   }
 
   function updateStep(index: number, description: string) {
     const newSteps = [...steps];
     newSteps[index].description = description;
     setSteps(newSteps);
   }
 
   function removeStep(index: number) {
     if (steps.length > 1) {
       const newSteps = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
       setSteps(newSteps);
     }
   }
 
   const filteredProcesses = processes.filter(p => {
     const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
     const matchesStatus = statusFilter === 'all' || p.approval_status === statusFilter;
     const matchesComponent = componentFilter === 'all' || p.eos_component === componentFilter;
     return matchesSearch && matchesStatus && matchesComponent;
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
                   EOS Processes Library is only available to SuperAdmins.
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
             <Cog className="h-8 w-8 text-primary" />
             <div>
               <h1 className="text-2xl font-bold">EOS Processes Library</h1>
               <p className="text-muted-foreground">Manage EOS operating system processes</p>
             </div>
           </div>
           <Button onClick={openCreate}>
             <Plus className="h-4 w-4 mr-2" />
             New Process
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
                     placeholder="Search processes..."
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
               <Select value={componentFilter} onValueChange={setComponentFilter}>
                 <SelectTrigger className="w-[150px]">
                   <SelectValue placeholder="Component" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Components</SelectItem>
                   {EOS_COMPONENTS.map(opt => (
                     <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </CardContent>
         </Card>
 
         {/* Process List */}
         <div className="grid gap-4">
           {isLoading ? (
             <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
           ) : filteredProcesses.length === 0 ? (
             <Card><CardContent className="py-8 text-center text-muted-foreground">No processes found</CardContent></Card>
           ) : (
             filteredProcesses.map(process => (
               <Card key={process.id} className="hover:shadow-md transition-shadow">
                 <CardContent className="py-4">
                   <div className="flex items-start justify-between gap-4">
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2 mb-2">
                         <Badge variant="outline">{process.eos_component}</Badge>
                         <h3 className="font-semibold truncate">{process.title}</h3>
                         <Badge variant={
                           process.approval_status === 'approved' ? 'default' :
                           process.approval_status === 'draft' ? 'secondary' : 'outline'
                         }>
                           {process.approval_status}
                         </Badge>
                       </div>
                       {process.purpose && (
                         <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                           {process.purpose}
                         </p>
                       )}
                       <div className="flex items-center gap-4 text-xs text-muted-foreground">
                         <span>v{process.version}</span>
                         <span>{Array.isArray(process.steps) ? process.steps.length : 0} steps</span>
                         {process.review_date && (
                           <span className="flex items-center gap-1">
                             <Calendar className="h-3 w-3" />
                             Review: {format(new Date(process.review_date), 'MMM d, yyyy')}
                           </span>
                         )}
                         <span>Updated: {format(new Date(process.updated_at), 'MMM d, yyyy')}</span>
                       </div>
                     </div>
                     <div className="flex gap-2 flex-shrink-0">
                       <Button size="sm" variant="ghost" onClick={() => openEdit(process)}>
                         <Edit className="h-4 w-4" />
                       </Button>
                       {process.approval_status === 'draft' && (
                         <Button size="sm" variant="default" onClick={() => handleApprove(process)}>
                           <CheckCircle className="h-4 w-4 mr-1" />
                           Approve
                         </Button>
                       )}
                       {process.approval_status !== 'archived' && (
                         <Button size="sm" variant="outline" onClick={() => handleArchive(process)}>
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
           <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
             <DialogHeader>
               <DialogTitle>
                 {editingProcess ? 'Edit EOS Process' : 'New EOS Process'}
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
                       placeholder="Process title"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>EOS Component *</Label>
                     <Select value={formData.eos_component} onValueChange={(v) => setFormData(p => ({ ...p, eos_component: v }))}>
                       <SelectTrigger>
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         {EOS_COMPONENTS.map(opt => (
                           <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
 
                 <div className="space-y-2">
                   <Label>Purpose</Label>
                   <Textarea
                     value={formData.purpose}
                     onChange={(e) => setFormData(p => ({ ...p, purpose: e.target.value }))}
                     placeholder="What is the purpose of this process?"
                     className="min-h-[80px]"
                   />
                 </div>
 
                 <div className="space-y-2">
                   <Label>Scope</Label>
                   <Textarea
                     value={formData.scope}
                     onChange={(e) => setFormData(p => ({ ...p, scope: e.target.value }))}
                     placeholder="What does this process cover?"
                     className="min-h-[80px]"
                   />
                 </div>
 
                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <Label>Steps</Label>
                     <Button type="button" size="sm" variant="outline" onClick={addStep}>
                       <Plus className="h-3 w-3 mr-1" /> Add Step
                     </Button>
                   </div>
                   <div className="space-y-2">
                     {steps.map((step, index) => (
                       <div key={index} className="flex gap-2 items-start">
                         <span className="text-sm font-medium w-6 pt-2">{step.order}.</span>
                         <Input
                           value={step.description}
                           onChange={(e) => updateStep(index, e.target.value)}
                           placeholder={`Step ${step.order} description`}
                           className="flex-1"
                         />
                         {steps.length > 1 && (
                           <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(index)}>
                             <Trash2 className="h-4 w-4 text-destructive" />
                           </Button>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
 
                 <div className="grid gap-4 sm:grid-cols-2">
                   <div className="space-y-2">
                     <Label>Inputs (one per line)</Label>
                     <Textarea
                       value={formData.inputs}
                       onChange={(e) => setFormData(p => ({ ...p, inputs: e.target.value }))}
                       placeholder="Required inputs..."
                       className="min-h-[80px]"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Outputs (one per line)</Label>
                     <Textarea
                       value={formData.outputs}
                       onChange={(e) => setFormData(p => ({ ...p, outputs: e.target.value }))}
                       placeholder="Expected outputs..."
                       className="min-h-[80px]"
                     />
                   </div>
                 </div>
 
                 <div className="grid gap-4 sm:grid-cols-2">
                   <div className="space-y-2">
                     <Label>Roles Responsible (comma-separated)</Label>
                     <Input
                       value={formData.roles_responsible}
                       onChange={(e) => setFormData(p => ({ ...p, roles_responsible: e.target.value }))}
                       placeholder="Super Admin, Team Leader"
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Evidence/Records (one per line)</Label>
                     <Textarea
                       value={formData.evidence_records}
                       onChange={(e) => setFormData(p => ({ ...p, evidence_records: e.target.value }))}
                       placeholder="Records produced..."
                       className="min-h-[60px]"
                     />
                   </div>
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
 
                 {editingProcess && (
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
                 {isSaving ? 'Saving...' : editingProcess ? 'Update' : 'Create'}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </div>
     </DashboardLayout>
   );
 }