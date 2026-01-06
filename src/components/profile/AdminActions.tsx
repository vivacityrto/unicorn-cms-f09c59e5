import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  UserCheck, 
  UserX, 
  Save,
  AlertCircle,
  Building2
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

// The 5 canonical role types
const ROLE_TYPES = [
  { value: 'superadmin_administrator', label: 'SuperAdmin - Administrator', category: 'superadmin' },
  { value: 'superadmin_team_leader', label: 'SuperAdmin - Team Leader', category: 'superadmin' },
  { value: 'superadmin_general', label: 'SuperAdmin - General', category: 'superadmin' },
  { value: 'tenant_parent', label: 'Tenant - Parent', category: 'tenant' },
  { value: 'tenant_child', label: 'Tenant - Child', category: 'tenant' },
] as const;

type RoleType = typeof ROLE_TYPES[number]['value'];

// Map existing DB values to role_type
function deriveRoleType(unicornRole: string, userType: string): RoleType {
  // SuperAdmin variants
  if (unicornRole === 'Super Admin' && (userType === 'Vivacity' || userType === 'Vivacity Team')) {
    // Check for specific variant based on user_type
    if (userType === 'Vivacity') return 'superadmin_administrator';
    if (userType === 'Vivacity Team') return 'superadmin_team_leader';
  }
  
  // Tenant variants
  if (userType === 'Client Parent' || (unicornRole === 'Admin' && userType === 'Client')) {
    return 'tenant_parent';
  }
  
  if (userType === 'Client Child' || userType === 'Client' || userType === 'Member') {
    return 'tenant_child';
  }
  
  // Default fallback
  return 'tenant_child';
}

// Map role_type back to DB fields
function roleTypeToDbFields(roleType: RoleType): { unicorn_role: string; user_type: string } {
  switch (roleType) {
    case 'superadmin_administrator':
      return { unicorn_role: 'Super Admin', user_type: 'Vivacity' };
    case 'superadmin_team_leader':
      return { unicorn_role: 'Super Admin', user_type: 'Vivacity Team' };
    case 'superadmin_general':
      return { unicorn_role: 'User', user_type: 'Vivacity Team' };
    case 'tenant_parent':
      return { unicorn_role: 'Admin', user_type: 'Client Parent' };
    case 'tenant_child':
      return { unicorn_role: 'User', user_type: 'Client Child' };
    default:
      return { unicorn_role: 'User', user_type: 'Client Child' };
  }
}

export function AdminActions({ 
  user, 
  currentUserRole, 
  currentUserType,
  currentUserTenantId,
  onUpdate 
}: AdminActionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  
  // Simplified state
  const [roleType, setRoleType] = useState<RoleType>(() => 
    deriveRoleType(user.unicorn_role, user.user_type)
  );
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    user.tenant_id?.toString() || ''
  );

  const isSuperAdmin = currentUserRole === 'Super Admin' && 
    (currentUserType === 'Vivacity' || currentUserType === 'Vivacity Team');
  
  const isClientAdmin = currentUserRole === 'Admin' && 
    (currentUserType === 'Client' || currentUserType === 'Client Parent') &&
    currentUserTenantId === user.tenant_id;

  const canManage = isSuperAdmin || isClientAdmin;
  const isTenantRole = roleType.startsWith('tenant_');
  const isSuperAdminRole = roleType.startsWith('superadmin_');

  // Derive original role type for comparison
  const originalRoleType = deriveRoleType(user.unicorn_role, user.user_type);
  
  const hasChanges = 
    roleType !== originalRoleType || 
    selectedTenantId !== (user.tenant_id?.toString() || '');

  // Validation
  const needsTenant = isTenantRole && !selectedTenantId;

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

  const handleSaveChanges = async () => {
    try {
      setLoading(true);

      const dbFields = roleTypeToDbFields(roleType);
      
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: {
          user_uuid: user.user_uuid,
          unicorn_role: dbFields.unicorn_role,
          user_type: dbFields.user_type,
          tenant_id: isTenantRole ? (selectedTenantId ? parseInt(selectedTenantId) : null) : null,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to update role');
      }

      toast({
        title: 'Success',
        description: 'User role updated successfully',
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

  const getRoleLabel = (value: RoleType) => 
    ROLE_TYPES.find(r => r.value === value)?.label || value;

  const getTenantName = (id: string) =>
    tenants.find(t => t.id.toString() === id)?.name || 'Unknown';

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
          <Shield className="h-5 w-5" />
          Admin Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section 1: Account Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {user.disabled ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            Account Status
          </h3>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${user.disabled ? 'bg-destructive' : 'bg-green-500'}`} />
              <span className="text-sm font-medium">
                {user.disabled ? 'Deactivated' : 'Active'}
              </span>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant={user.disabled ? 'default' : 'destructive'}
                  size="sm"
                  disabled={loading}
                >
                  {user.disabled ? 'Activate' : 'Deactivate'}
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
        </div>

        <Separator />

        {/* Section 2: Role Type */}
        {isSuperAdmin && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Role Type
            </h3>

            <div className="space-y-4 p-4 rounded-lg bg-background border">
              <div className="space-y-2">
                <Label htmlFor="role-type">User Role</Label>
                <Select value={roleType} onValueChange={(v) => setRoleType(v as RoleType)}>
                  <SelectTrigger id="role-type">
                    <SelectValue placeholder="Select role type" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">SuperAdmin Roles</div>
                    {ROLE_TYPES.filter(r => r.category === 'superadmin').map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">Tenant Roles</div>
                    {ROLE_TYPES.filter(r => r.category === 'tenant').map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tenant Assignment - only for tenant roles */}
              {isTenantRole && (
                <div className="space-y-2">
                  <Label htmlFor="tenant" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Tenant Assignment
                  </Label>
                  <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
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
                  
                  {needsTenant && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Tenant roles require a tenant assignment
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* SuperAdmin roles don't need tenant */}
              {isSuperAdminRole && selectedTenantId && (
                <Alert className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    SuperAdmin roles have cross-tenant access. Tenant assignment will be cleared.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Save Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  className="w-full"
                  disabled={!hasChanges || needsTenant || loading}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Role Changes</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <p>You are about to change the following for {user.first_name} {user.last_name}:</p>
                      {roleType !== originalRoleType && (
                        <div className="flex items-center gap-2 text-sm">
                          <strong>Role:</strong> 
                          <span className="text-muted-foreground">{getRoleLabel(originalRoleType)}</span>
                          →
                          <span className="font-semibold">{getRoleLabel(roleType)}</span>
                        </div>
                      )}
                      {selectedTenantId !== (user.tenant_id?.toString() || '') && isTenantRole && (
                        <div className="flex items-center gap-2 text-sm">
                          <strong>Tenant:</strong> 
                          <span className="text-muted-foreground">{user.tenant_name || 'None'}</span>
                          →
                          <span className="font-semibold">{getTenantName(selectedTenantId)}</span>
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSaveChanges}>
                    Confirm Changes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-amber-900 dark:text-amber-100">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            All admin actions are logged and audited. Use these controls responsibly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}