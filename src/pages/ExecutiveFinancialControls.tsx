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
import { format } from 'date-fns';

const SYSTEM_TENANT_ID = 6372;

const CONTROL_TYPES = [
  { value: 'xero_reconciliation', label: 'Xero Reconciliation' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'outstanding_balance', label: 'Outstanding Balance' },
];

const STATUS_OPTIONS = ['ok', 'pending', 'overdue', 'flagged'];

interface FinancialControl {
  id: string;
  control_type: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  amount_outstanding: number | null;
  notes: string | null;
  created_at: string;
  tenant_id: number;
}

const defaultForm = {
  control_type: 'xero_reconciliation',
  status: 'pending',
  due_date: '',
  amount_outstanding: '',
  notes: '',
};

export default function ExecutiveFinancialControls() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<FinancialControl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<FinancialControl | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('financial_controls')
        .select('*')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .order('created_at', { ascending: false });
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
      const { error } = await supabase.from('financial_controls').insert([{
        tenant_id: SYSTEM_TENANT_ID,
        control_type: formData.control_type,
        status: formData.status,
        due_date: formData.due_date || null,
        amount_outstanding: formData.amount_outstanding ? Number(formData.amount_outstanding) : null,
        notes: formData.notes || null,
      }]);
      if (error) throw error;
      toast({ title: 'Success', description: 'Financial control created' });
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
      const { error } = await supabase.from('financial_controls').update({
        control_type: formData.control_type,
        status: formData.status,
        due_date: formData.due_date || null,
        amount_outstanding: formData.amount_outstanding ? Number(formData.amount_outstanding) : null,
        notes: formData.notes || null,
        completed_at: formData.status === 'ok' ? new Date().toISOString() : null,
      }).eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Financial control updated' });
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
      const { error } = await supabase.from('financial_controls').delete().eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Financial control deleted' });
      setIsDeleteOpen(false);
      setSelected(null);
      fetchRecords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const openEdit = (r: FinancialControl) => {
    setSelected(r);
    setFormData({
      control_type: r.control_type,
      status: r.status,
      due_date: r.due_date ?? '',
      amount_outstanding: r.amount_outstanding?.toString() ?? '',
      notes: r.notes ?? '',
    });
    setIsEditOpen(true);
  };

  const filtered = records.filter(r =>
    r.control_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.notes ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Control Type *</Label>
        <Select value={formData.control_type} onValueChange={v => setFormData({ ...formData, control_type: v })}>
          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-background z-50">
            {CONTROL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
      <div className="space-y-2">
        <Label>Due Date</Label>
        <Input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Amount Outstanding</Label>
        <Input type="number" min="0" step="0.01" value={formData.amount_outstanding} onChange={e => setFormData({ ...formData, amount_outstanding: e.target.value })} placeholder="0.00" />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." />
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
            <h1 className="text-[28px] font-bold">Financial Controls</h1>
            <p className="text-muted-foreground">Manage Xero reconciliation, payroll, and outstanding balances</p>
          </div>
          <Button onClick={() => { setFormData(defaultForm); setIsCreateOpen(true); }} className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New Control
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
            <Input placeholder="Search controls..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12" />
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="rounded-lg bg-card shadow-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Control Type</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Status</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Due Date</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Completed At</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 text-right">Amount</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Notes</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  {searchQuery ? 'No controls match your search' : 'No financial controls found'}
                </TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className="group hover:bg-primary/5 transition-colors">
                  <TableCell className="font-medium capitalize">{r.control_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                      r.status === 'ok' ? 'bg-green-100 text-green-700' :
                      r.status === 'overdue' || r.status === 'flagged' ? 'bg-destructive/10 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>{r.status}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.due_date ? format(new Date(r.due_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.completed_at ? format(new Date(r.completed_at), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.amount_outstanding != null ? `$${r.amount_outstanding.toLocaleString()}` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.notes ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setSelected(r); setIsDeleteOpen(true); }} className="hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Financial Control</DialogTitle>
              <DialogDescription>Add a new financial control record</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formData.control_type}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Financial Control</DialogTitle>
              <DialogDescription>Update financial control record</DialogDescription>
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
              <AlertDialogTitle>Delete Financial Control</AlertDialogTitle>
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
