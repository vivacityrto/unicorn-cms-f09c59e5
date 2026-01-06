import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  UserCheck, 
  UserX, 
  Mail,
  Save,
  AlertCircle 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Tenant {
  id: number;
  name: string;
}

interface AdminActionsProps {
  user: {
    user_uuid: string;
    first_name: string;
    last_name: string;
    email: string;
    disabled: boolean;
    tenant_id: number | null;
    unicorn_role: string;
    user_type: string;
    tenant_name?: string | null;
  };
  currentUserRole: string | null;
  currentUserType: string | null;
  currentUserTenantId: number | null;
  onUpdate: () => void;
}

const VIVACITY_TENANT_ID = 319;

const VIVACITY_ROLES = [
  { value: 'SUPER_ADMIN_ADMINISTRATOR', label: 'Super Admin – Administrator' },
  { value: 'SUPER_ADMIN_TEAM_LEADER', label: 'Super Admin – Team Leader' },
  { value: 'SUPER_ADMIN_GENERAL', label: 'Super Admin – General' },
];

const CLIENT_ROLES = [
  { value: 'CLIENT_ADMIN', label: 'Client Admin' },
  { value: 'CLIENT_USER', label: 'Client User' },
];

export function AdminActions({ 
  user, 
  currentUserRole, 
  currentUserType,
  currentUserTenantId,
  onUpdate 
}: AdminActionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  
  // Role management state
  const [newRole, setNewRole] = useState(user.unicorn_role);
  const [newUserType, setNewUserType] = useState(user.user_type);
  const [newTenantId, setNewTenantId] = useState(user.tenant_id?.toString() || '');
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const isSuperAdmin = currentUserRole === 'Super Admin' && 
    (currentUserType === 'Vivacity' || currentUserType === 'Vivacity Team');
  const isClientAdmin = currentUserRole === 'Admin' && 
    (currentUserType === 'Client' || currentUserType === 'Client Parent') &&
    currentUserTenantId === user.tenant_id;

  const canManage = isSuperAdmin || isClientAdmin;
  const canManageVivacity = isSuperAdmin && user.tenant_id === VIVACITY_TENANT_ID;

  const roleOptions = user.tenant_id === VIVACITY_TENANT_ID ? VIVACITY_ROLES : CLIENT_ROLES;

  // Check if there are changes
  const hasChanges = newRole !== user.unicorn_role || 
                     newUserType !== user.user_type || 
                     newTenantId !== user.tenant_id?.toString();

  // Check for invalid combinations
  const hasInvalidCombination = 
    (newRole === 'Super Admin' && !['Vivacity', 'Vivacity Team'].includes(newUserType)) ||
    (newUserType === 'Client' && !newTenantId);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    }
  }, [isSuperAdmin]);

  const fetchTenants = async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name')
      .order('name');
    
    if (!error && data) {
      setTenants(data);
    }
  };

  if (!canManage) {
    return null;
  }

  const getTenantName = (tenantId: string) => {
    return tenants.find(t => t.id.toString() === tenantId)?.name || 'Unknown';
  };

  const handleToggleStatus = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('toggle-user-status', {
        body: {
          user_uuid: user.user_uuid,
          disabled: !user.disabled,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to update status');
      }

      toast({
        title: 'Success',
        description: `User ${user.disabled ? 'activated' : 'deactivated'} successfully`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRoleChanges = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: {
          user_uuid: user.user_uuid,
          unicorn_role: newRole,
          user_type: newUserType,
          tenant_id: newTenantId ? parseInt(newTenantId) : null,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to update role');
      }

      toast({
        title: 'Success',
        description: 'User role and permissions updated successfully',
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async () => {
    try {
      setLoading(true);

      if (!user.tenant_id || !selectedRole) {
        throw new Error('Tenant ID and role are required');
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: user.email,
          tenant_id: user.tenant_id,
          role: selectedRole,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to resend invite');
      }

      toast({
        title: 'Success',
        description: 'Invitation email resent successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Shield className="h-5 w-5" />
          Admin Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Only Super Admins can manage roles */}
        {isSuperAdmin && (
          <>
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="font-semibold text-sm">Role & Access Management</h3>
              
              {/* System Role */}
              <div className="space-y-2">
                <Label htmlFor="system-role">System Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="system-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="User">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* User Type */}
              <div className="space-y-2">
                <Label htmlFor="user-type">User Type</Label>
                <Select value={newUserType} onValueChange={setNewUserType}>
                  <SelectTrigger id="user-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vivacity">Vivacity</SelectItem>
                    <SelectItem value="Vivacity Team">Vivacity Team</SelectItem>
                    <SelectItem value="Client">Client</SelectItem>
                    <SelectItem value="Client Parent">Client Parent</SelectItem>
                    <SelectItem value="Member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tenant Assignment (for Client users) */}
              {newUserType === 'Client' && (
                <div className="space-y-2">
                  <Label htmlFor="tenant">Assign to Tenant</Label>
                  <Select value={newTenantId} onValueChange={setNewTenantId}>
                    <SelectTrigger id="tenant">
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id.toString()}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Validation Warnings */}
              {newRole === 'Super Admin' && !['Vivacity', 'Vivacity Team'].includes(newUserType) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Super Admin role requires Vivacity user type
                  </AlertDescription>
                </Alert>
              )}

              {newUserType === 'Client' && !newTenantId && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Client user type requires a tenant assignment
                  </AlertDescription>
                </Alert>
              )}

              {/* Save Changes Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="default" 
                    className="w-full"
                    disabled={!hasChanges || hasInvalidCombination || loading}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save Role Changes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Role Changes</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>You are about to change the following for {user.first_name} {user.last_name}:</p>
                        {newRole !== user.unicorn_role && (
                          <div className="flex items-center gap-2 text-sm">
                            <strong>Role:</strong> 
                            <span className="text-muted-foreground">{user.unicorn_role}</span>
                            →
                            <span className="font-semibold">{newRole}</span>
                          </div>
                        )}
                        {newUserType !== user.user_type && (
                          <div className="flex items-center gap-2 text-sm">
                            <strong>Type:</strong> 
                            <span className="text-muted-foreground">{user.user_type}</span>
                            →
                            <span className="font-semibold">{newUserType}</span>
                          </div>
                        )}
                        {newTenantId !== user.tenant_id?.toString() && (
                          <div className="flex items-center gap-2 text-sm">
                            <strong>Tenant:</strong> 
                            <span className="text-muted-foreground">{user.tenant_name || 'None'}</span>
                            →
                            <span className="font-semibold">{getTenantName(newTenantId)}</span>
                          </div>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSaveRoleChanges}>
                      Confirm Changes
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}

        {/* Status Toggle */}
        <div className="space-y-2">
          <Label>Account Status</Label>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={user.disabled ? 'default' : 'destructive'}
                className="w-full"
                disabled={loading}
              >
                {user.disabled ? (
                  <>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Activate User
                  </>
                ) : (
                  <>
                    <UserX className="mr-2 h-4 w-4" />
                    Deactivate User
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {user.disabled ? 'Activate' : 'Deactivate'} User?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {user.disabled 
                    ? `This will restore access for ${user.first_name} ${user.last_name}.`
                    : `This will prevent ${user.first_name} ${user.last_name} from accessing the system.`
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleToggleStatus}>
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Role Assignment - only for Super Admin on Vivacity users or matching tenant */}
        {(canManageVivacity || (isClientAdmin && user.tenant_id !== VIVACITY_TENANT_ID)) && (
          <div className="space-y-2">
            <Label htmlFor="role">Assign Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Resend Invite */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResendInvite}
          disabled={loading || !selectedRole}
        >
          <Mail className="mr-2 h-4 w-4" />
          Resend Invitation
        </Button>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-amber-100 border border-amber-300 rounded-lg text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            All admin actions are logged and audited. Use these controls responsibly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
