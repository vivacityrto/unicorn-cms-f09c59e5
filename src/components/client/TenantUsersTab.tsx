import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  UserPlus, 
  Shield, 
  User as UserIcon, 
  Mail, 
  Clock,
  MoreVertical,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { TenantInviteDialog } from './TenantInviteDialog';

interface TenantUser {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface TenantMemberInfo {
  user_id: string;
  role: string;
  created_at: string;
  users: TenantUser;
}

interface PendingInvite {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface TenantUsersTabProps {
  tenantId: number;
  tenantName: string;
}

export function TenantUsersTab({ tenantId, tenantName }: TenantUsersTabProps) {
  const { profile, isSuperAdmin, hasTenantAdmin } = useAuth();
  const [members, setMembers] = useState<TenantMemberInfo[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<TenantMemberInfo | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // RBAC: Check permissions using helper functions
  const canManageUsers = isSuperAdmin() || hasTenantAdmin(tenantId);
  const canChangeRoles = isSuperAdmin() || hasTenantAdmin(tenantId);

  useEffect(() => {
    fetchMembers();
    fetchPendingInvites();
  }, [tenantId]);

  // Map DB role values (parent/child) to readable labels
  const getRoleLabel = (role: string) => {
    if (role === 'parent') return 'Primary Contact';
    if (role === 'child') return 'User';
    return role;
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);
      // Use explicit FK hint so PostgREST can resolve the join
      const { data, error } = await supabase
        .from('tenant_users')
        .select(`
          user_id,
          role,
          created_at,
          users!tenant_users_user_id_fkey (
            user_uuid,
            email,
            first_name,
            last_name,
            avatar_url,
            created_at
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('tenant_users fetch error:', error);
        throw error;
      }
      setMembers((data || []) as unknown as TenantMemberInfo[]);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvites = async () => {
    try {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('id, email, first_name, last_name, unicorn_role, status, expires_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingInvites(data || []);
    } catch (error) {
      console.error('Error fetching pending invites:', error);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!canChangeRoles) return;
    
    setUpdatingRole(userId);
    try {
      const { error } = await supabase
        .from('tenant_users')
        .update({ role: newRole })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      if (error) throw error;
      
      setMembers(prev => prev.map(m => 
        m.user_id === userId ? { ...m, role: newRole } : m
      ));
      toast.success('Role updated successfully');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemove) return;
    
    try {
      // Remove user from tenant_users
      const { error } = await supabase
        .from('tenant_users')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userToRemove.user_id);

      if (error) throw error;
      
      setMembers(prev => prev.filter(m => m.user_id !== userToRemove.user_id));
      toast.success('User removed from tenant');
    } catch (error) {
      console.error('Error removing user:', error);
      toast.error('Failed to remove user');
    } finally {
      setUserToRemove(null);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({ status: 'cancelled' })
        .eq('id', inviteId);

      if (error) throw error;
      
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      toast.success('Invitation cancelled');
    } catch (error) {
      console.error('Error cancelling invite:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            {members.length} user{members.length !== 1 ? 's' : ''} in this organisation
          </p>
        </div>
        {canManageUsers && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        )}
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map(invite => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {invite.first_name} {invite.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">{invite.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                    {invite.unicorn_role}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Expires {formatDate(invite.expires_at)}
                  </span>
                  {canManageUsers && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Users List */}
      <Card>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <UserIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No users in this organisation yet</p>
              {canManageUsers && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setInviteDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite First User
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {members.map(member => {
                const user = member.users;
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(user.first_name, user.last_name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {user.first_name} {user.last_name}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Role Badge/Selector */}
                      {canChangeRoles && member.user_id !== profile?.user_uuid ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.user_id, value)}
                          disabled={updatingRole === member.user_id}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue>
                              {getRoleLabel(member.role)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="parent">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Primary Contact
                              </div>
                            </SelectItem>
                            <SelectItem value="child">
                              <div className="flex items-center gap-2">
                                <UserIcon className="h-3 w-3" />
                                User
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            member.role === 'parent'
                              ? 'bg-primary/10 text-primary border-primary/30'
                              : 'bg-muted'
                          }
                        >
                          {member.role === 'parent' ? (
                            <><Shield className="h-3 w-3 mr-1" /> Primary Contact</>
                          ) : (
                            <><UserIcon className="h-3 w-3 mr-1" /> User</>
                          )}
                        </Badge>
                      )}

                      <span className="text-xs text-muted-foreground min-w-20">
                        Added {formatDate(member.created_at)}
                      </span>

                      {/* Actions Menu */}
                      {canManageUsers && member.user_id !== profile?.user_uuid && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setUserToRemove(member)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove from tenant
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <TenantInviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onSuccess={() => {
          fetchPendingInvites();
        }}
      />

      {/* Remove User Confirmation */}
      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{userToRemove?.users?.first_name} {userToRemove?.users?.last_name}</strong>{' '}
              from this organisation? They will lose access to all tenant resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
