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
import { Building2, Users, Mail, Send, Shield, UserCog, User, UserPlus, Database, Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type UserSelection = 'vivacity' | 'client' | 'import' | null;
type UnicornRole = 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User' | null;

interface Unicorn1User {
  ID: number;
  FirstName: string | null;
  LastName: string | null;
  email: string | null;
  JobTitle: string | null;
  Phone: string | null;
  PhoneNumber: string | null;
  Discriminator: string | null;
  Archived: boolean;
  Disabled: boolean;
  mapped_user_uuid: string | null;
}

const VIVACITY_ROLES = [
  { value: 'Super Admin', label: 'Super Admin', icon: Shield },
  { value: 'Team Leader', label: 'Team Leader', icon: UserCog },
  { value: 'Team Member', label: 'Team Member', icon: User },
];

const CLIENT_ROLES = [
  { value: 'Admin', label: 'Admin', icon: Shield },
  { value: 'User', label: 'User', icon: User },
];

const VIVACITY_TENANT_ID = 6372;

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'selection' | 'role' | 'details' | 'import'>('selection');
  const [userType, setUserType] = useState<UserSelection>(null);
  const [roleLevel, setRoleLevel] = useState<UnicornRole>(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [sendInvitation, setSendInvitation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Import from Unicorn 1 state
  const [importSearch, setImportSearch] = useState('');
  const [importResults, setImportResults] = useState<Unicorn1User[]>([]);
  const [importSearching, setImportSearching] = useState(false);
  const [selectedImportUser, setSelectedImportUser] = useState<Unicorn1User | null>(null);
  const [importRoleLevel, setImportRoleLevel] = useState<UnicornRole>('Team Member');
  const [importing, setImporting] = useState(false);

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
    enabled: open && (userType === 'client' || userType === 'import'),
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
    setImportSearch('');
    setImportResults([]);
    setSelectedImportUser(null);
    setImportRoleLevel('Team Member');
    onOpenChange(false);
  };

  const handleSelection = (type: UserSelection) => {
    setUserType(type);
    setRoleLevel(null);
    if (type === 'vivacity') {
      setTenantId(VIVACITY_TENANT_ID);
      setStep('role');
    } else if (type === 'client') {
      setTenantId(null);
      setStep('role');
    } else if (type === 'import') {
      setTenantId(VIVACITY_TENANT_ID);
      setStep('import');
    }
  };

  const handleRoleSelection = () => {
    if (roleLevel) {
      setStep('details');
    }
  };

  // Search unicorn1 users
  useEffect(() => {
    if (step !== 'import' || importSearch.length < 2) {
      setImportResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setImportSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('search-unicorn1-users', {
          body: { search: importSearch, unmapped_only: true },
        });
        if (error) throw error;
        setImportResults(data?.users || []);
      } catch (err: any) {
        console.error('Search error:', err);
        toast({ title: 'Search failed', description: err.message, variant: 'destructive' });
      } finally {
        setImportSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [importSearch, step]);

  // Import selected user from unicorn1
  const handleImportUser = async () => {
    if (!selectedImportUser || !importRoleLevel) return;

    setImporting(true);
    try {
      const u = selectedImportUser;
      const isStaff = u.Discriminator === 'Staff';
      const targetTenantId = isStaff ? VIVACITY_TENANT_ID : tenantId;

      if (!isStaff && !tenantId) {
        toast({ title: 'Select a tenant', description: 'Non-staff users need a tenant assigned.', variant: 'destructive' });
        setImporting(false);
        return;
      }

      // Call invite-user edge function with skip_email to create user directly
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: (u.email || `legacy-${u.ID}@placeholder.local`).trim().toLowerCase(),
          first_name: (u.FirstName || 'Unknown').trim(),
          last_name: (u.LastName || '-').trim(),
          invite_as: isStaff ? 'VIVACITY' : 'CLIENT',
          tenant_id: targetTenantId,
          unicorn_role: importRoleLevel,
          skip_email: true,
          job_title: u.JobTitle || null,
          phone_number: u.PhoneNumber || u.Phone || null,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.ok === false) throw new Error(data.detail || data.code || 'Import failed');

      // Update unicorn1.users to set mapped_user_uuid
      if (data?.user_uuid) {
        await (supabase as any)
          .schema('unicorn1')
          .from('users')
          .update({ mapped_user_uuid: data.user_uuid })
          .eq('ID', u.ID);
      }

      toast({
        title: 'User imported',
        description: `${u.FirstName} ${u.LastName} has been imported from Unicorn 1.`,
      });

      // Remove from results
      setImportResults(prev => prev.filter(r => r.ID !== u.ID));
      setSelectedImportUser(null);
      onSuccess?.();
    } catch (err: any) {
      console.error('Import error:', err);
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleSendInvite = async () => {
    if (!email || !firstName || !userType || !roleLevel || !tenantId) return;

    setIsLoading(true);
    try {
      if (userType === 'client' && !tenantId) {
        throw new Error('Please select a tenant for client invites');
      }

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

      if (inviteError) {
        errorMsg = inviteError.message || 'Failed to send invitation';
        inviteStatus = 'failed';
      } else if (inviteData?.ok === false) {
        if (inviteData?.code === 'INVITE_EXISTS') {
          errorMsg = `A pending invitation already exists for ${email}. Please wait for them to accept or check the Team Users list.`;
        } else {
          errorMsg = inviteData?.detail || inviteData?.message || inviteData?.code || 'Unknown error';
        }
        inviteStatus = 'failed';
      } else {
        inviteStatus = 'sent';
      }

      if (inviteStatus === 'failed') {
        throw new Error(errorMsg || 'Failed to send invitation');
      }

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
            {step === 'import' && 'Search and import a user from Unicorn 1.0'}
          </DialogDescription>
        </DialogHeader>

        {step === 'selection' ? (
          <div className="grid grid-cols-3 gap-3 py-4">
            <Card
              className="p-4 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary"
              onClick={() => handleSelection('vivacity')}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Vivacity Team</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Super Admin role
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-4 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary"
              onClick={() => handleSelection('client')}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-secondary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Client</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    To be configured
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-4 cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary"
              onClick={() => handleSelection('import')}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Database className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">From Unicorn 1</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Import legacy user
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : step === 'import' ? (
          <div className="space-y-4 py-2">
            {/* Search */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Search Unicorn 1 Users
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={importSearch}
                  onChange={e => setImportSearch(e.target.value)}
                  placeholder="Search by name or email (min 2 chars)..."
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            {/* Results */}
            <ScrollArea className="h-[200px] border rounded-md">
              {importSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : importResults.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {importSearch.length >= 2 ? 'No unmapped users found' : 'Type to search...'}
                </div>
              ) : (
                <div className="divide-y">
                  {importResults.map(u => (
                    <div
                      key={u.ID}
                      className={cn(
                        "px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
                        selectedImportUser?.ID === u.ID && "bg-primary/10 border-l-2 border-primary"
                      )}
                      onClick={() => setSelectedImportUser(u)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{u.FirstName} {u.LastName}</p>
                          <p className="text-xs text-muted-foreground">{u.email || 'No email'}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                            {u.Discriminator}
                          </span>
                          {u.Archived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                              Archived
                            </span>
                          )}
                        </div>
                      </div>
                      {u.JobTitle && <p className="text-[11px] text-muted-foreground">{u.JobTitle}</p>}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Selected user details */}
            {selectedImportUser && (
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <p className="text-sm font-medium">
                  Importing: {selectedImportUser.FirstName} {selectedImportUser.LastName}
                </p>
                <p className="text-xs text-muted-foreground">{selectedImportUser.email}</p>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Role
                  </Label>
                  <Combobox
                    options={[...VIVACITY_ROLES, ...CLIENT_ROLES].map(r => ({
                      value: r.value,
                      label: r.label,
                    }))}
                    value={importRoleLevel || ''}
                    onValueChange={v => setImportRoleLevel(v as UnicornRole)}
                    placeholder="Select role..."
                    searchPlaceholder="Search roles..."
                    emptyText="No roles found."
                    className="h-9"
                  />
                </div>

                {selectedImportUser.Discriminator !== 'Staff' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tenant
                    </Label>
                    <Combobox
                      options={tenants?.map(t => ({
                        value: t.id.toString(),
                        label: t.name,
                      })) || []}
                      value={tenantId?.toString() || ''}
                      onValueChange={v => setTenantId(v ? parseInt(v) : null)}
                      placeholder="Select tenant..."
                      searchPlaceholder="Search tenants..."
                      emptyText="No tenants found."
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('selection');
                  setImportSearch('');
                  setImportResults([]);
                  setSelectedImportUser(null);
                }}
                disabled={importing}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleImportUser}
                disabled={!selectedImportUser || !importRoleLevel || importing}
                className="flex-1"
              >
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                ) : (
                  <><Database className="h-4 w-4 mr-2" />Import User</>
                )}
              </Button>
            </div>
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
                    Vivacity Coaching & Consulting (ID: {VIVACITY_TENANT_ID})
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
