import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserPlus, MoreVertical, Pencil, ArrowUpRight, Archive, RotateCcw, Trash2, Loader2, Contact } from 'lucide-react';
import { toast } from 'sonner';
import { isValidEmail, RELATIONSHIP_ROLE_OPTIONS, type RelationshipRole } from '@/lib/roles/relationshipRole';
import { type PositionTypeOption, positionTypeLabel } from '@/lib/roles/positionType';
import { useInvalidateUserCapacity } from '@/hooks/useUserCapacity';

interface TenantContact {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  position_type: string | null;
  status: 'active' | 'archived';
  promoted_to_user_id: string | null;
  promoted_at: string | null;
  created_at: string;
}

interface ContactFormState {
  first_name: string;
  last_name: string;
  email: string;
  position_type: string;
}

const emptyForm: ContactFormState = { first_name: '', last_name: '', email: '', position_type: '' };

interface TenantContactsSectionProps {
  tenantId: number;
  tenantName: string;
  canManage: boolean;
  positionTypeOptions: PositionTypeOption[];
}

export function TenantContactsSection({ tenantId, tenantName, canManage, positionTypeOptions }: TenantContactsSectionProps) {
  const [contacts, setContacts] = useState<TenantContact[]>([]);
  const [loading, setLoading] = useState(true);
  const invalidateCapacity = useInvalidateUserCapacity();

  const [addOpen, setAddOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<TenantContact | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [contactToDelete, setContactToDelete] = useState<TenantContact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingPositionType, setUpdatingPositionType] = useState<number | null>(null);

  const [promotingContact, setPromotingContact] = useState<TenantContact | null>(null);
  const [promoteRole, setPromoteRole] = useState<RelationshipRole>('user');
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const fetchContacts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenant_contacts')
      .select('id, first_name, last_name, email, position_type, status, promoted_to_user_id, promoted_at, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('tenant_contacts fetch error:', error);
      toast.error('Failed to load contacts');
    } else {
      setContacts((data || []) as TenantContact[]);
    }
    setLoading(false);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (contact: TenantContact) => {
    setEditingContact(contact);
    setForm({
      first_name: contact.first_name,
      last_name: contact.last_name || '',
      email: contact.email,
      position_type: contact.position_type || '',
    });
  };

  const closeDialogs = () => {
    setAddOpen(false);
    setEditingContact(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.first_name.trim()) {
      toast.error('First name is required');
      return;
    }
    if (!isValidEmail(form.email)) {
      toast.error('Enter a valid email address');
      return;
    }

    setSaving(true);
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.toLowerCase().trim(),
      position_type: form.position_type || null,
    };

    const { error } = editingContact
      ? await supabase.from('tenant_contacts').update(payload).eq('id', editingContact.id)
      : await supabase.from('tenant_contacts').insert({ ...payload, tenant_id: tenantId });

    setSaving(false);

    if (error) {
      console.error('tenant_contacts save error:', error);
      toast.error(editingContact ? 'Failed to update contact' : 'Failed to add contact');
      return;
    }

    toast.success(editingContact ? 'Contact updated' : 'Contact added');
    closeDialogs();
    fetchContacts();
  };

  const handlePositionTypeChange = async (contact: TenantContact, value: string) => {
    if (!canManage) return;
    const nextPositionType = value === '__none__' ? null : value;
    if ((contact.position_type ?? null) === nextPositionType) return;

    setUpdatingPositionType(contact.id);
    const { error } = await supabase
      .from('tenant_contacts')
      .update({ position_type: nextPositionType })
      .eq('id', contact.id);
    setUpdatingPositionType(null);

    if (error) {
      console.error('tenant_contacts position_type update error:', error);
      toast.error('Failed to update position type');
      return;
    }

    setContacts((previous) =>
      previous.map((c) => (c.id === contact.id ? { ...c, position_type: nextPositionType } : c))
    );
    toast.success(nextPositionType ? 'Position type updated' : 'Position type cleared');
  };

  const toggleArchive = async (contact: TenantContact) => {
    const nextStatus = contact.status === 'active' ? 'archived' : 'active';
    const { error } = await supabase.from('tenant_contacts').update({ status: nextStatus }).eq('id', contact.id);
    if (error) {
      toast.error('Failed to update contact status');
      return;
    }
    toast.success(nextStatus === 'archived' ? 'Contact archived' : 'Contact reactivated');
    fetchContacts();
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('tenant_contacts').delete().eq('id', contactToDelete.id);
    setDeleting(false);
    if (error) {
      toast.error('Failed to delete contact');
      return;
    }
    toast.success('Contact deleted');
    setContactToDelete(null);
    fetchContacts();
  };

  const openPromote = (contact: TenantContact) => {
    setPromoteRole('user');
    setPromotingContact(contact);
  };

  const handlePromote = async () => {
    if (!promotingContact) return;
    setPromoting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Authentication required');

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: promotingContact.email,
          first_name: promotingContact.first_name,
          last_name: promotingContact.last_name || '',
          invite_as: 'CLIENT',
          tenant_id: tenantId,
          unicorn_role: promoteRole === 'primary_contact' || promoteRole === 'secondary_contact' ? 'Admin' : 'User',
          relationship_role: promoteRole,
          skip_email: true,
          job_title: null,
        },
      });

      if (error) {
        // FunctionsHttpError for a non-2xx response — the edge function's JSON
        // body (with the real reason) is on error.context, not `data`.
        let detail = 'Could not promote this contact — the seat may be at capacity.';
        try {
          const body = await (error as { context?: Response }).context?.clone().json();
          if (body?.detail) detail = body.detail;
        } catch {
          // no JSON body available — fall back to the generic message
        }
        toast.error(detail);
        return;
      }
      if (!data?.ok) {
        toast.error(data?.detail || 'Could not promote this contact — the seat may be at capacity.');
        return;
      }

      const { error: markError } = await supabase.rpc('mark_tenant_contact_promoted', {
        p_contact_id: promotingContact.id,
        p_user_id: data.user_uuid,
      });
      if (markError) {
        console.error('mark_tenant_contact_promoted error:', markError);
      }

      toast.success(`${promotingContact.first_name} promoted to a user on ${tenantName}`);
      invalidateCapacity(tenantId);
      setPromotingContact(null);
      fetchContacts();
    } catch (err) {
      console.error('promote contact error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to promote contact');
    } finally {
      setPromoting(false);
    }
  };

  const activeContacts = contacts.filter((c) => !c.promoted_to_user_id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Contact className="h-4 w-4" />
          Contacts
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : activeContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No contacts on file. Contacts are RTO staff who aren't Unicorn users — track them here so you can swap
            them into a seat later.
          </p>
        ) : (
          <div className="divide-y">
            {activeContacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {contact.first_name} {contact.last_name || ''}
                    </span>
                    <Badge variant={contact.status === 'active' ? 'secondary' : 'outline'}>{contact.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage ? (
                    <Select
                      value={contact.position_type || '__none__'}
                      onValueChange={(value) => handlePositionTypeChange(contact, value)}
                      disabled={updatingPositionType === contact.id}
                    >
                      <SelectTrigger className="w-40 h-8 text-sm" aria-label={`Position type for ${contact.email}`}>
                        <SelectValue>
                          {contact.position_type
                            ? positionTypeLabel(contact.position_type, positionTypeOptions)
                            : 'Position type'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No position type</SelectItem>
                        {positionTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground hidden sm:inline">
                      {positionTypeLabel(contact.position_type, positionTypeOptions)}
                    </span>
                  )}
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(contact)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPromote(contact)}>
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Promote to User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleArchive(contact)}>
                          {contact.status === 'active' ? (
                            <>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </>
                          ) : (
                            <>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reactivate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setContactToDelete(contact)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={addOpen || !!editingContact} onOpenChange={(open) => !open && closeDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            <DialogDescription>
              A contact on file for {tenantName} — not a Unicorn user until promoted to a seat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="contact-first-name">First name</Label>
                <Input
                  id="contact-first-name"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="contact-last-name">Last name</Label>
                <Input
                  id="contact-last-name"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="contact-position-type">Position Type</Label>
              <Select
                value={form.position_type || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, position_type: v }))}
              >
                <SelectTrigger id="contact-position-type">
                  <SelectValue placeholder="Select a position type" />
                </SelectTrigger>
                <SelectContent>
                  {positionTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingContact ? 'Save' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote dialog */}
      <Dialog open={!!promotingContact} onOpenChange={(open) => !open && setPromotingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to User</DialogTitle>
            <DialogDescription>
              {promotingContact?.first_name} will be created as a Unicorn user on {tenantName} and will use up one
              seat, subject to the plan's user limit.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="promote-role">Role</Label>
            <Select value={promoteRole} onValueChange={(v) => setPromoteRole(v as RelationshipRole)}>
              <SelectTrigger id="promote-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromotingContact(null)} disabled={promoting}>
              Cancel
            </Button>
            <Button onClick={handlePromote} disabled={promoting}>
              {promoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {contactToDelete?.first_name} {contactToDelete?.last_name} from the contact list
              permanently. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
