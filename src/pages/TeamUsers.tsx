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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Users, Search, Shield, UserCheck, UserX, UserPlus } from 'lucide-react';
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
      }));

      setUsers(teamUsers);
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
      filtered = filtered.filter(user => !user.disabled && !user.archived);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(user => user.disabled || user.archived);
    }

    setFilteredUsers(filtered);
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
        return <Badge className="bg-purple-600 hover:bg-purple-700">Administrator</Badge>;
      case 'Team Leader':
        return <Badge className="bg-blue-600 hover:bg-blue-700">Team Leader</Badge>;
      case 'General':
        return <Badge variant="secondary">General</Badge>;
      default:
        return <Badge variant="outline">Not Set</Badge>;
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => !u.disabled && !u.archived).length,
    inactive: users.filter(u => u.disabled || u.archived).length,
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
        <div className="grid gap-4 md:grid-cols-3">
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
              <CardTitle className="text-sm font-medium">Inactive</CardTitle>
              <UserX className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.inactive}</div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No team users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.user_uuid}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/user-profile/${user.user_uuid}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="bg-purple-100 text-purple-700 text-sm">
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
                        <Badge variant={user.disabled || user.archived ? 'destructive' : 'default'}>
                          {user.disabled || user.archived ? 'Inactive' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(user.last_sign_in_at)}
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
