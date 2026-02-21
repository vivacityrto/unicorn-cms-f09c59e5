import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Mail, Send, Shield, UserCog, User, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type UserSelection = 'vivacity' | 'client' | null;
type UnicornRole = 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User' | null;

const VIVACITY_ROLES = [
  { value: 'Super Admin', label: 'Super Admin', icon: Shield },
  { value: 'Team Leader', label: 'Team Leader', icon: UserCog },
  { value: 'Team Member', label: 'Team Member', icon: User },
];

const CLIENT_ROLES = [
  { value: 'Admin', label: 'Admin', icon: Shield },
  { value: 'User', label: 'User', icon: User },
];

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'selection' | 'role' | 'details'>('selection');
  const [userType, setUserType] = useState<UserSelection>(null);
  const [roleLevel, setRoleLevel] = useState<UnicornRole>(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [sendInvitation, setSendInvitation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const VIVACITY_TENANT_ID = 319;

  // Fetch tenants for client invites
  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open && userType === 'client',
  });

  const handleClose = () => {
    setStep('selection');
    setUserType(null);
    setRoleLevel(null);
    setEmail('');
    setFirstName('');
    setLastName('');
    setTenantId(null);
    setSendInvitation(false);
    onOpenChange(false);
  };

  const handleSelection = (type: UserSelection) => {
    setUserType(type);
    setRoleLevel(null);
    // Auto-set tenant for Vivacity
    if (type === 'vivacity') {
      setTenantId(VIVACITY_TENANT_ID);
    } else {
      setTenantId(null);
    }
    setStep('role');
  };

  const handleRoleSelection = () => {
    if (roleLevel) {
      setStep('details');
    }
  };

  const handleSendInvite = async () => {
    if (!email || !firstName || !userType || !roleLevel || !tenantId) return;

    setIsLoading(true);
    try {
      // Validate tenant selection for client invites
      if (userType === 'client' && !tenantId) {
        throw new Error('Please select a tenant for client invites');
      }

      // Call the edge function to invite the user
      const payload = {
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim() || '-',
        invite_as: userType?.toUpperCase() as 'VIVACITY' | 'CLIENT',
        tenant_id: tenantId,
        unicorn_role: roleLevel,
        skip_email: !sendInvitation,
      };

      const { data: inviteData, error: inviteError } = await supabase.functions.invoke('invite-user', {
        body: payload,
      });

      let inviteStatus = 'failed';
      let errorMsg: string | null = null;
      let inviteUrl: string | null = null;

      if (inviteError) {
        errorMsg = inviteError.message || 'Failed to send invitation';
        inviteStatus = 'failed';
      } else if (inviteData?.ok === false) {
        // Handle specific error codes with friendly messages
        if (inviteData?.code === 'INVITE_EXISTS') {
          errorMsg = `A pending invitation already exists for ${email}. Please wait for them to accept or check the Team Users list.`;
        } else {
          errorMsg = inviteData?.detail || inviteData?.message || inviteData?.code || 'Unknown error';
        }
        inviteStatus = 'failed';
      } else {
        inviteStatus = 'sent';
        inviteUrl = inviteData?.inviteUrl || null;
      }

      // Throw error if invite failed
      if (inviteStatus === 'failed') {
        throw new Error(errorMsg || 'Failed to send invitation');
      }

      // Silent success - email is sent via MailGun, no need for UI notification
      handleClose();
      onSuccess?.();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send invitation',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if we can send the invite
  const canSend = email && firstName && roleLevel && tenantId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] border-[3px] border-[#dfdfdf]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Invite User</DialogTitle>
          <DialogDescription>
            {step === 'selection' && 'Select the type of user you want to invite'}
            {step === 'role' && `Select the user's role level${userType === 'vivacity' ? ' in the Vivacity team' : ' for this client'}`}
            {step === 'details' && 'Enter the user details to send the invitation'}
          </DialogDescription>
        </DialogHeader>

        {step === 'selection' ? (
          <div className="grid grid-cols-2 gap-4 py-4">
            <Card
              className="p-6 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary"
              onClick={() => handleSelection('vivacity')}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Vivacity Team</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Super Admin role
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-6 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary"
              onClick={() => handleSelection('client')}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-secondary" />
                </div>
                <div>
                  <h3 className="font-semibold">Client</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    To be configured
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : step === 'role' ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              {userType === 'vivacity' ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              <span>Inviting as: <strong className="text-foreground">{userType === 'vivacity' ? 'Vivacity Team' : 'Client'}</strong></span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-base font-medium">Select User Level</Label>
              <Combobox
                options={(userType === 'vivacity' ? VIVACITY_ROLES : CLIENT_ROLES).map(role => ({
                  value: role.value,
                  label: role.label
                }))}
                value={roleLevel || ''}
                onValueChange={(value) => setRoleLevel(value as UnicornRole)}
                placeholder="Choose a role level"
                searchPlaceholder="Search roles..."
                emptyText="No roles found."
                className="h-11"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setStep('selection')}
                disabled={isLoading}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleRoleSelection}
                disabled={!roleLevel || isLoading}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Mail className="h-4 w-4" />
              <span>Inviting as: <strong className="text-foreground">{userType === 'vivacity' ? 'Vivacity Team' : 'Client'}</strong></span>
              <span className="mx-1">•</span>
              <span>Role: <strong className="text-foreground">
                {roleLevel && (userType === 'vivacity' ? VIVACITY_ROLES : CLIENT_ROLES).find(r => r.value === roleLevel)?.label}
              </strong></span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {userType === 'client' && (
                <div className="space-y-2">
                  <Label htmlFor="tenant">Tenant *</Label>
                  <Combobox
                    options={tenants?.map((tenant) => ({
                      value: tenant.id.toString(),
                      label: tenant.name
                    })) || []}
                    value={tenantId?.toString() || ''}
                    onValueChange={(v) => setTenantId(v ? parseInt(v) : null)}
                    placeholder="Select a tenant..."
                    searchPlaceholder="Search tenants..."
                    emptyText="No tenants found."
                    className="h-11"
                  />
                </div>
              )}

              {userType === 'vivacity' && (
                <div className="space-y-2">
                  <Label>Tenant</Label>
                  <div className="px-3 py-2 bg-muted rounded-md text-sm">
                    Vivacity Team (ID: {VIVACITY_TENANT_ID})
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="sendInvitationMain"
                checked={sendInvitation}
                onCheckedChange={(checked) => setSendInvitation(checked === true)}
              />
              <Label
                htmlFor="sendInvitationMain"
                className="text-sm font-normal cursor-pointer"
              >
                Send Invitation
              </Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setStep('role')}
                disabled={isLoading}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleSendInvite}
                disabled={!canSend || isLoading}
                className="flex-1"
              >
                {sendInvitation ? (
                  <><Send className="h-4 w-4 mr-2" />{isLoading ? 'Sending...' : 'Send Invitation'}</>
                ) : (
                  <><UserPlus className="h-4 w-4 mr-2" />{isLoading ? 'Adding...' : 'Add User'}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
