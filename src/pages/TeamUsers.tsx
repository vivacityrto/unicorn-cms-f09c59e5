import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Users, Search, Shield, UserCheck, UserX, UserPlus, Clock, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import { InviteUserDialog } from '@/components/InviteUserDialog';
interface TeamUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  unicorn_role: string;
  superadmin_level: string | null;
  disabled: boolean;
  archived: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  isPending?: boolean;
  inviteId?: string;
  inviteTenantId?: number;
}

const SUPERADMIN_LEVELS = [
  { value: 'all', label: 'All Levels' },
  { value: 'Administrator', label: 'Administrator' },
  { value: 'Team Leader', label: 'Team Leader' },
  { value: 'General', label: 'General' },
];

export default function TeamUsers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, searchQuery, levelFilter, statusFilter]);

  const fetchTeamUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch users who are SuperAdmins (global_role = 'SuperAdmin' or unicorn_role = 'Super Admin')
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_uuid,
          first_name,
          last_name,
          email,
          avatar_url,
          unicorn_role,
          superadmin_level,
          disabled,
          archived,
          last_sign_in_at,
          created_at,
          global_role,
          user_type
        `)
        .or('global_role.eq.SuperAdmin,unicorn_role.eq.Super Admin,user_type.eq.Vivacity Team,user_type.eq.Vivacity')
        .order('first_name', { ascending: true });

      if (error) throw error;

      // Also fetch pending invitations for Vivacity team (tenant_id = 319)
      const { data: pendingInvites, error: invitesError } = await supabase
        .from('user_invitations')
        .select('id, email, first_name, last_name, unicorn_role, created_at, status, tenant_id')
        .eq('tenant_id', 319)
        .eq('status', 'pending')
        .is('accepted_at', null);

      if (invitesError) throw invitesError;

      const teamUsers: TeamUser[] = (data || []).map((user: any) => ({
        user_uuid: user.user_uuid,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email,
        avatar_url: user.avatar_url,
        unicorn_role: user.unicorn_role || 'User',
        superadmin_level: user.superadmin_level || null,
        disabled: user.disabled || false,
        archived: user.archived || false,
        last_sign_in_at: user.last_sign_in_at,
        created_at: user.created_at,
        isPending: false,
      }));

      // Filter out invites for emails that already exist as users
      // Also deduplicate by email - keep only the most recent invite per email
      const existingEmails = new Set(teamUsers.map(u => u.email.toLowerCase()));
      
      const emailToInvite = new Map<string, typeof pendingInvites[0]>();
      (pendingInvites || []).forEach(invite => {
        const email = invite.email.toLowerCase();
        if (existingEmails.has(email)) return; // Skip if user already exists
        
        const existing = emailToInvite.get(email);
        if (!existing || new Date(invite.created_at) > new Date(existing.created_at)) {
          emailToInvite.set(email, invite);
        }
      });
      
      const pendingUsers: TeamUser[] = Array.from(emailToInvite.values())
        .map((invite: any) => ({
          user_uuid: `invite-${invite.id}`,
          first_name: invite.first_name || '',
          last_name: invite.last_name || '',
          email: invite.email,
          avatar_url: null,
          unicorn_role: invite.unicorn_role || 'User',
          superadmin_level: null,
          disabled: false,
          archived: false,
          last_sign_in_at: null,
          created_at: invite.created_at,
          isPending: true,
          inviteId: invite.id,
          inviteTenantId: invite.tenant_id,
        }));

      setUsers([...teamUsers, ...pendingUsers]);
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

  const applyFilters = () => {
    let filtered = [...users];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(user =>
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Level filter
    if (levelFilter !== 'all') {
      filtered = filtered.filter(user => user.superadmin_level === levelFilter);
    }

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(user => !user.disabled && !user.archived && !user.isPending);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(user => user.disabled || user.archived);
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(user => user.isPending);
    }

    setFilteredUsers(filtered);
  };

  const handleResendInvite = async (user: TeamUser) => {
    if (!user.inviteId) return;
    
    setResendingInvite(user.inviteId);
    try {
      const { data, error } = await supabase.functions.invoke('resend-invite', {
        body: { invitation_id: user.inviteId },
      });

      if (error) throw error;
      
      if (!data.ok) {
        throw new Error(data.detail || 'Failed to resend invitation');
      }

      toast({
        title: 'Invitation Resent',
        description: `A new invitation has been sent to ${user.email}`,
      });
    } catch (error: any) {
      console.error('Error resending invite:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resend invitation',
        variant: 'destructive',
      });
    } finally {
      setResendingInvite(null);
    }
  };

  const handleCancelInvite = async (user: TeamUser) => {
    if (!user.inviteId) return;
    
    setCancellingInvite(user.inviteId);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-invite', {
        body: { invitation_id: user.inviteId },
      });

      if (error) throw error;
      
      if (!data.ok) {
        throw new Error(data.detail || 'Failed to cancel invitation');
      }

      toast({
        title: 'Invitation Cancelled',
        description: `The invitation for ${user.email} has been revoked`,
      });
      
      // Refresh the list to remove the cancelled invite
      fetchTeamUsers();
    } catch (error: any) {
      console.error('Error cancelling invite:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel invitation',
        variant: 'destructive',
      });
    } finally {
      setCancellingInvite(null);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getLevelBadge = (level: string | null) => {
    switch (level) {
      case 'Administrator':
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">Administrator</Badge>;
      case 'Team Leader':
        return <Badge className="bg-cyan-500 hover:bg-cyan-600 text-white">Team Leader</Badge>;
      case 'General':
        return <Badge variant="outline" className="border-muted-foreground/50">General</Badge>;
      default:
        return <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Not Set</Badge>;
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => !u.disabled && !u.archived && !u.isPending).length,
    inactive: users.filter(u => u.disabled || u.archived).length,
    pending: users.filter(u => u.isPending).length,
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-7 w-7 text-purple-600" />
              Team Users
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage Vivacity team members and SuperAdmin users
            </p>
          </div>
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Team</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive</CardTitle>
              <UserX className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.inactive}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by level" />
                </SelectTrigger>
                <SelectContent>
                  {SUPERADMIN_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No team users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.user_uuid}
                      className={cn(
                        "hover:bg-muted/50",
                        user.isPending && "opacity-75"
                      )}
                    >
                      <TableCell 
                        className={cn(!user.isPending && "cursor-pointer")}
                        onClick={() => !user.isPending && navigate(`/user-profile/${user.user_uuid}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {getInitials(user.first_name, user.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{user.unicorn_role}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>{getLevelBadge(user.superadmin_level)}</TableCell>
                      <TableCell>
                        {user.isPending ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        ) : (
                          <Badge variant={user.disabled || user.archived ? 'destructive' : 'default'}>
                            {user.disabled || user.archived ? 'Inactive' : 'Active'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.isPending ? 'Invited' : formatDate(user.last_sign_in_at)}
                      </TableCell>
                      <TableCell>
                        {user.isPending && user.inviteId && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleResendInvite(user)}
                                disabled={resendingInvite === user.inviteId || cancellingInvite === user.inviteId}
                              >
                                <RefreshCw className={cn(
                                  "h-4 w-4 mr-2",
                                  resendingInvite === user.inviteId && "animate-spin"
                                )} />
                                {resendingInvite === user.inviteId ? 'Sending...' : 'Resend Invite'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCancelInvite(user)}
                                disabled={resendingInvite === user.inviteId || cancellingInvite === user.inviteId}
                                className="text-destructive focus:text-destructive"
                              >
                                <X className={cn(
                                  "h-4 w-4 mr-2",
                                  cancellingInvite === user.inviteId && "animate-spin"
                                )} />
                                {cancellingInvite === user.inviteId ? 'Cancelling...' : 'Cancel Invite'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Invite User Dialog */}
        <InviteUserDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          onSuccess={fetchTeamUsers}
        />
      </div>
    </DashboardLayout>
  );
}
