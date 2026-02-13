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
import { Combobox } from '@/components/ui/combobox';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { Pencil, Trash2, Plus, Search, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_OPTIONS = ['pending', 'met', 'missed', 'at_risk'];
const IMPACT_LEVELS = ['low', 'medium', 'high', 'critical'];

interface Commitment {
  id: string;
  tenant_id: number;
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  impact_level: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  tenant_name?: string;
}

interface Tenant {
  id: number;
  name: string;
}

const defaultForm = {
  tenant_id: '',
  title: '',
  description: '',
  due_date: '',
  status: 'pending',
  impact_level: 'medium',
  assigned_to: '',
};

export default function ExecutiveClientCommitments() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<Commitment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Commitment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(defaultForm);
  const { data: teamUsers = [] } = useVivacityTeamUsers();

  const getTeamUserName = (uuid: string | null) => {
    if (!uuid) return '—';
    const user = teamUsers.find(u => u.user_uuid === uuid);
    if (!user) return uuid;
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  };

  const tenantOptions = tenants.map(t => ({
    value: t.id.toString(),
    label: t.name,
  }));

  useEffect(() => { fetchRecords(); fetchTenants(); }, []);

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .neq('is_system_tenant', true)
        .order('name');
      if (error) throw error;
      setTenants(data ?? []);
    } catch {
      // Fall back to all tenants if tier column doesn't filter
      const { data } = await supabase.from('tenants').select('id, name').order('name');
      setTenants(data ?? []);
    }
  };

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('client_commitments')
        .select('*, tenants(name)')
        .order('due_date', { ascending: true });
      if (error) throw error;
      setRecords((data ?? []).map((r: any) => ({
        ...r,
        tenant_name: r.tenants?.name ?? 'Unknown',
        tenants: undefined,
      })));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const { error } = await supabase.from('client_commitments').insert([{
        tenant_id: Number(formData.tenant_id),
        title: formData.title,
        description: formData.description || null,
        due_date: formData.due_date,
        status: formData.status,
        impact_level: formData.impact_level || null,
        assigned_to: formData.assigned_to && formData.assigned_to !== 'unassigned' ? formData.assigned_to : null,
      }]);
      if (error) throw error;
      toast({ title: 'Success', description: 'Commitment created' });
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
      const { error } = await supabase.from('client_commitments').update({
        tenant_id: Number(formData.tenant_id),
        title: formData.title,
        description: formData.description || null,
        due_date: formData.due_date,
        status: formData.status,
        impact_level: formData.impact_level || null,
        assigned_to: formData.assigned_to && formData.assigned_to !== 'unassigned' ? formData.assigned_to : null,
        completed_at: formData.status === 'met' ? new Date().toISOString() : null,
      }).eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Commitment updated' });
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
      const { error } = await supabase.from('client_commitments').delete().eq('id', selected.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Commitment deleted' });
      setIsDeleteOpen(false);
      setSelected(null);
      fetchRecords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const openEdit = (r: Commitment) => {
    setSelected(r);
    setFormData({
      tenant_id: r.tenant_id.toString(),
      title: r.title,
      description: r.description ?? '',
      due_date: r.due_date,
      status: r.status,
      impact_level: r.impact_level ?? 'medium',
      assigned_to: r.assigned_to ?? '',
    });
    setIsEditOpen(true);
  };

  const filtered = records.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.tenant_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Client (Tenant) *</Label>
        <Combobox
          options={tenantOptions}
          value={formData.tenant_id}
          onValueChange={v => setFormData({ ...formData, tenant_id: v })}
          placeholder="Search clients..."
          searchPlaceholder="Type to filter clients..."
          emptyText="No clients found."
        />
      </div>
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Commitment title" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description..." />
      </div>
      <div className="space-y-2">
        <Label>Due Date *</Label>
        <Input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status *</Label>
          <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Impact Level</Label>
          <Select value={formData.impact_level} onValueChange={v => setFormData({ ...formData, impact_level: v })}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {IMPACT_LEVELS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Assigned To</Label>
        <Select value={formData.assigned_to} onValueChange={v => setFormData({ ...formData, assigned_to: v })}>
          <SelectTrigger className="bg-background"><SelectValue placeholder="Select team member" /></SelectTrigger>
          <SelectContent className="bg-background z-50 max-h-60">
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamUsers.map(u => (
              <SelectItem key={u.user_uuid} value={u.user_uuid}>
                {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <h1 className="text-[28px] font-bold">Client Commitments</h1>
            <p className="text-muted-foreground">Manage client commitments and deliverables</p>
          </div>
          <Button onClick={() => { setFormData(defaultForm); setIsCreateOpen(true); }} className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New Commitment
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
            <Input placeholder="Search commitments..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12" />
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="rounded-lg bg-card shadow-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Client</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Title</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Due Date</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Status</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Impact</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14">Assigned To</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  {searchQuery ? 'No commitments match your search' : 'No client commitments found'}
                </TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className="group hover:bg-primary/5 transition-colors">
                  <TableCell className="font-medium">{r.tenant_name}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(r.due_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                      r.status === 'met' ? 'bg-green-100 text-green-700' :
                      r.status === 'missed' ? 'bg-destructive/10 text-destructive' :
                      r.status === 'at_risk' ? 'bg-amber-100 text-amber-700' :
                      'bg-muted text-muted-foreground'
                    }`}>{r.status.replace(/_/g, ' ')}</span>
                  </TableCell>
                  <TableCell>
                    {r.impact_level && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                        r.impact_level === 'critical' ? 'bg-destructive/10 text-destructive' :
                        r.impact_level === 'high' ? 'bg-amber-100 text-amber-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{r.impact_level}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{getTeamUserName(r.assigned_to)}</TableCell>
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
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Client Commitment</DialogTitle>
              <DialogDescription>Add a new commitment for a client</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formData.tenant_id || !formData.title || !formData.due_date}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Client Commitment</DialogTitle>
              <DialogDescription>Update commitment details</DialogDescription>
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
              <AlertDialogTitle>Delete Commitment</AlertDialogTitle>
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
