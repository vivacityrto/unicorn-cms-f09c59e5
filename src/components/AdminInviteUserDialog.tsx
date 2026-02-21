import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus } from 'lucide-react';

interface AdminInviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  tenantId: number;
  tenantName: string;
}

type AdminRole = 'Admin' | 'User';

const ADMIN_ROLES: { value: AdminRole; label: string; description: string }[] = [
  { value: 'Admin', label: 'Admin', description: 'Full administrative access' },
  { value: 'User', label: 'General User', description: 'Standard access to features' },
];

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
  const [roleLevel, setRoleLevel] = useState<AdminRole>('User');
  const [sendInvitation, setSendInvitation] = useState(false);

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRoleLevel('User');
    setSendInvitation(false);
    setIsSending(false);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!email || !firstName) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
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
          unicorn_role: roleLevel,
          skip_email: !sendInvitation,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to add user');
      }

      if (!data?.ok) {
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
    } catch (error: any) {
      console.error('Add user error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add user',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const canSubmit = email && firstName && !isSending;

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
                placeholder="John"
                autoFocus
              />
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
              options={ADMIN_ROLES.map(r => ({
                value: r.value,
                label: `${r.label}  - ${r.description}`,
              }))}
              value={roleLevel}
              onValueChange={(value) => setRoleLevel(value as AdminRole)}
              placeholder="Select role..."
              searchPlaceholder="Search roles..."
              emptyText="No roles found."
            />
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
