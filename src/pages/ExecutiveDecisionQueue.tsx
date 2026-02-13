import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pencil, Trash2, Plus, Search, ArrowLeft } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

const SYSTEM_TENANT_ID = 6372;
const STATUS_OPTIONS = ['pending', 'decided', 'deferred'];
const IMPACT_LEVELS = ['low', 'medium', 'high', 'critical'];

interface DecisionItem {
  id: string;
  title: string;
  description: string | null;
  impact_level: string;
  recommended_option: string | null;
  status: string;
  submitted_at: string;
  decided_at: string | null;
  decision_note: string | null;
  tenant_id: number;
}

const defaultForm = {
  title: '',
  description: '',
  impact_level: 'medium',
  recommended_option: '',
  status: 'pending',
  decision_note: '',
};

export default function ExecutiveDecisionQueue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<DecisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<DecisionItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('ceo_decision_queue')
        .select('*')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setRecords(data ?? []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('ceo_decision_queue').insert([{
        tenant_id: SYSTEM_TENANT_ID,
        title: formData.title,
        description: formData.description || null,
        impact_level: formData.impact_level,
        recommended_option: formData.recommended_option || null,
        status: formData.status,
        decision_note: formData.decision_note || null,
        submitted_by: user.id,
      }]);
      if (error) throw error;
      toast({ title: 'Success', description: 'Decision item created' });
      setIsCreateOpen(false);
      setFormData(defaultForm);
      fetchRecords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = async () => {
    if (!selected) return;
    try {
      const updates: Record<string, any> = {
        title: formData.title,
        description: formData.description || null,
        impact_level: formData.impact_level,
        recommended_option: formData.recommended_option || null,
        status: formData.status,
        decision_note: formData.decision_note || null,
      };
      if (formData.status === 'decided' && selected.status !== 'decided') {
        const { data: { user } } = await supabase.auth.getUser();
        updates.decided_at = new Date().toISOString();
        updates.decided_by = user?.id ?? null;
      }
      const { error } = await supabase.from('ceo_decision_queue').update(updates).eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Decision item updated' });
      setIsEditOpen(false);
      setSelected(null);
      setFormData(defaultForm);
      fetchRecords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      const { error } = await supabase.from('ceo_decision_queue').delete().eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Decision item deleted' });
      setIsDeleteOpen(false);
      setSelected(null);
      fetchRecords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const openEdit = (r: DecisionItem) => {
    setSelected(r);
    setFormData({
      title: r.title,
      description: r.description ?? '',
      impact_level: r.impact_level,
      recommended_option: r.recommended_option ?? '',
      status: r.status,
      decision_note: r.decision_note ?? '',
    });
    setIsEditOpen(true);
  };

  const filtered = records.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.impact_level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Decision title" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Context and background..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Impact Level *</Label>
          <Select value={formData.impact_level} onValueChange={v => setFormData({ ...formData, impact_level: v })}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {IMPACT_LEVELS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status *</Label>
          <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Recommended Option</Label>
        <Input value={formData.recommended_option} onChange={e => setFormData({ ...formData, recommended_option: e.target.value })} placeholder="Suggested course of action" />
      </div>
      <div className="space-y-2">
        <Label>Decision Note</Label>
        <Textarea value={formData.decision_note} onChange={e => setFormData({ ...formData, decision_note: e.target.value })} placeholder="Notes on the decision..." />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/executive')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Executive Dashboard
          </Button>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-[28px] font-bold">CEO Decision Queue</h1>
            <p className="text-muted-foreground">Manage items requiring CEO review and decision</p>
          </div>
          <Button onClick={() => { setFormData(defaultForm); setIsCreateOpen(true); }} className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New Decision Item
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
            <Input placeholder="Search decisions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12" />
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="rounded-lg bg-card shadow-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Title</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Impact</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Recommended</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Status</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Submitted</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 text-right">Days Pending</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  {searchQuery ? 'No decisions match your search' : 'No decision items found'}
                </TableCell></TableRow>
              ) : filtered.map(r => {
                const daysPending = r.status === 'pending' ? differenceInDays(new Date(), new Date(r.submitted_at)) : 0;
                return (
                  <TableRow key={r.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="font-medium max-w-[250px]">
                      <div className="truncate">{r.title}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                        r.impact_level === 'critical' ? 'bg-destructive/10 text-destructive' :
                        r.impact_level === 'high' ? 'bg-amber-100 text-amber-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{r.impact_level}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.recommended_option ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                        r.status === 'decided' ? 'bg-green-100 text-green-700' :
                        r.status === 'deferred' ? 'bg-amber-100 text-amber-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{r.status}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(r.submitted_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.status === 'pending' ? (
                        <span className={daysPending >= 5 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>{daysPending}d</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setSelected(r); setIsDeleteOpen(true); }} className="hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Decision Item</DialogTitle>
              <DialogDescription>Submit a new item for CEO decision</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formData.title}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Decision Item</DialogTitle>
              <DialogDescription>Update decision details</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Decision Item</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone. Are you sure?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
