import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface AdminInviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  tenantId: number;
  tenantName: string;
}

type AdminRole = 'Admin' | 'User';

const ADMIN_ROLES: { value: AdminRole; label: string }[] = [
  { value: 'Admin', label: 'Admin' },
  { value: 'User', label: 'User' },
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

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRoleLevel('User');
    setIsSending(false);
    onOpenChange(false);
  };

  const handleSendInvite = async () => {
    if (!email || !firstName || !lastName) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          invite_as: 'client',
          tenant_id: tenantId,
          unicorn_role: roleLevel,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        console.error('Invite error:', error);
        throw new Error(error.message || 'Failed to send invitation');
      }

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to send invitation');
      }

      toast({
        title: 'Success',
        description: `Invitation sent to ${email}`,
      });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      console.error('Send invite error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send invitation',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const canSend = email && firstName && lastName && !isSending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Invite User to {tenantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tenant">Tenant</Label>
            <Input
              id="tenant"
              value={tenantName}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">User Role *</Label>
            <Combobox
              options={ADMIN_ROLES}
              value={roleLevel}
              onValueChange={(value) => setRoleLevel(value as AdminRole)}
              placeholder="Select role..."
              searchPlaceholder="Search roles..."
              emptyText="No roles found."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Enter first name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Enter last name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSendInvite} disabled={!canSend}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
