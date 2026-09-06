import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus } from 'lucide-react';
import {
  type RelationshipRole,
  RELATIONSHIP_ROLE_OPTIONS,
  isValidEmail,
  unicornRoleFromRelationship,
} from '@/lib/roles/relationshipRole';

interface AdminInviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  tenantId: number;
  tenantName: string;
}

export function AdminInviteUserDialog({
  open,
  onOpenChange,
  onSuccess,
  tenantId,
  tenantName,
}: AdminInviteUserDialogProps) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [relationshipRole, setRelationshipRole] = useState<RelationshipRole>('user');
  const [sendInvitation, setSendInvitation] = useState(false);

  // Existing role-slot occupancy for this tenant
  const [primaryTaken, setPrimaryTaken] = useState(false);
  const [secondaryTaken, setSecondaryTaken] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tenant_users')
        .select('relationship_role, primary_contact, secondary_contact, role')
        .eq('tenant_id', tenantId);
      if (cancelled || error) return;
      const rows = data ?? [];
      const hasPrimary = rows.some((r) =>
        r.relationship_role === 'primary_contact' ||
        (!r.relationship_role && (r.primary_contact === true || r.role === 'parent')),
      );
      const hasSecondary = rows.some((r) =>
        r.relationship_role === 'secondary_contact' ||
        (!r.relationship_role && r.secondary_contact === true),
      );
      setPrimaryTaken(hasPrimary);
      setSecondaryTaken(hasSecondary);
    })();
    return () => { cancelled = true; };
  }, [open, tenantId]);

  /**
   * Smart paste: detect "Name <email>", "email", or "First Last" pasted into
   * the First Name field and distribute across First/Last/Email accordingly.
   * Returns true if the paste was handled (caller should preventDefault).
   */
  const handleSmartPaste = (text: string): boolean => {
    const raw = text.trim();
    if (!raw) return false;

    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

    const nameEmailMatch = raw.match(/^(.+?)\s*[<(]\s*([^<>()\s]+@[^<>()\s]+)\s*[>)]?\s*$/i);
    if (nameEmailMatch && emailRegex.test(nameEmailMatch[2])) {
      const namePart = nameEmailMatch[1].trim().replace(/^["']|["']$/g, '').trim();
      const emailPart = nameEmailMatch[2].trim();
      const parts = namePart.split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' '));
      setEmail(emailPart);
      return true;
    }

    if (emailRegex.test(raw) && !raw.includes(' ')) {
      setEmail(raw);
      if (!firstName) {
        const local = raw.split('@')[0].split(/[._-]/)[0];
        if (local) setFirstName(local.charAt(0).toUpperCase() + local.slice(1));
      }
      return true;
    }

    if (!emailRegex.test(raw) && /\s/.test(raw)) {
      const parts = raw.split(/\s+/);
      setFirstName(parts[0]);
      setLastName(parts.slice(1).join(' '));
      return true;
    }

    return false;
  };

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRelationshipRole('user');
    setSendInvitation(false);
    setIsSending(false);
    setPrimaryTaken(false);
    setSecondaryTaken(false);
    onOpenChange(false);
  };

  const roleSlotTaken =
    (relationshipRole === 'primary_contact' && primaryTaken) ||
    (relationshipRole === 'secondary_contact' && secondaryTaken);

  const slotTakenMessage =
    relationshipRole === 'primary_contact' && primaryTaken
      ? 'This organisation already has a primary contact. Demote them first to invite a new one.'
      : relationshipRole === 'secondary_contact' && secondaryTaken
      ? 'This organisation already has a secondary contact. Demote them first to invite a new one.'
      : null;

  const handleSubmit = async () => {
    if (!email || !firstName) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidEmail(email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    if (roleSlotTaken) {
      toast({
        title: 'Role already taken',
        description: slotTakenMessage ?? 'That role is already assigned.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: (lastName.trim() || '-'),
          invite_as: 'CLIENT',
          tenant_id: tenantId,
          unicorn_role: unicornRoleFromRelationship(relationshipRole),
          relationship_role: relationshipRole,
          skip_email: !sendInvitation,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to add user');
      }

      if (!data?.ok) {
        if (data?.code === 'PRIMARY_EXISTS' || data?.code === 'SECONDARY_EXISTS') {
          toast({
            title: 'Role already taken',
            description: data?.detail || 'This organisation already has a contact in that role.',
            variant: 'destructive',
          });
          return; // keep dialog open
        }
        throw new Error(data?.detail || data?.code || 'Failed to add user');
      }

      toast({
        title: 'Success',
        description: sendInvitation
          ? `Invitation sent to ${email}`
          : `${firstName} added to ${tenantName}`,
      });

      handleClose();
      onSuccess?.();
    } catch (error: unknown) {
      console.error('Add user error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add user',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const canSubmit = email && firstName && !isSending && !roleSlotTaken;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] border-[3px] border-[#dfdfdf]">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Invite a new user to <strong>{tenantName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="admin-firstName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">First Name *</Label>
              <Input
                id="admin-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (handleSmartPaste(pasted)) {
                    e.preventDefault();
                  }
                }}
                placeholder="John"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground leading-tight normal-case font-normal">
                Tip: paste <code className="font-mono">Name &lt;email@example.com&gt;</code> to auto-fill all fields.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-lastName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Name</Label>
              <Input
                id="admin-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email *</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-role" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</Label>
            <Combobox
              options={RELATIONSHIP_ROLE_OPTIONS.map((opt) => {
                const taken =
                  (opt.value === 'primary_contact' && primaryTaken) ||
                  (opt.value === 'secondary_contact' && secondaryTaken);
                return {
                  value: opt.value,
                  label: `${opt.label}${taken ? ' (already assigned)' : ''}  - ${opt.description}`,
                };
              })}
              value={relationshipRole}
              onValueChange={(value) => setRelationshipRole(value as RelationshipRole)}
              placeholder="Select role..."
              searchPlaceholder="Search roles..."
              emptyText="No roles found."
            />
            {slotTakenMessage && (
              <p className="text-[11px] text-destructive leading-tight">{slotTakenMessage}</p>
            )}
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="sendInvitation"
              checked={sendInvitation}
              onCheckedChange={(checked) => setSendInvitation(checked === true)}
            />
            <Label
              htmlFor="sendInvitation"
              className="text-sm font-normal cursor-pointer"
            >
              Send Invitation
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sendInvitation ? 'Send Invitation' : 'Add User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
