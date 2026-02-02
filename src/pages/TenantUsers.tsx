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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Building2, Search, Users, UserCheck, UserX, ArrowUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

interface TenantUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  user_type: string;
  unicorn_role: string;
  tenant_id: number | null;
  tenant_name: string | null;
  disabled: boolean;
  archived: boolean;
  last_sign_in_at: string | null;
}

interface Tenant {
  id: number;
  name: string;
}

type SortField = 'name' | 'tenant' | 'role' | 'status' | 'lastLogin';

export default function TenantUsers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<TenantUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'activate' | 'deactivate' | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, searchQuery, tenantFilter, roleFilter, statusFilter, sortField, sortDirection]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, tenantFilter, roleFilter, statusFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelection = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.user_uuid)));
    }
  };

  const handleBulkAction = async () => {
    if (!bulkActionType || selectedIds.size === 0) return;
    
    setProcessingBulk(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-user-action', {
        body: {
          user_uuids: Array.from(selectedIds),
          action: bulkActionType,
        },
      });
      
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || 'Bulk action failed');
      
      toast({
        title: 'Bulk Action Complete',
        description: `${data.successCount} users ${bulkActionType === 'activate' ? 'activated' : 'deactivated'} successfully`,
      });
      
      setSelectedIds(new Set());
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingBulk(false);
      setBulkActionDialogOpen(false);
      setBulkActionType(null);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch tenants
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      
      setTenants(tenantsData || []);

      // Fetch tenant users - include only client user types
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_uuid,
          first_name,
          last_name,
          email,
          avatar_url,
          user_type,
          unicorn_role,
          tenant_id,
          disabled,
          archived,
          last_sign_in_at,
          tenants!tenant_id(name)
        `)
        .in('user_type', ['Client Parent', 'Client Child', 'Client'])
        .order('first_name', { ascending: true });

      if (error) throw error;

      const tenantUsers: TenantUser[] = (data || []).map((user: any) => ({
        user_uuid: user.user_uuid,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email,
        avatar_url: user.avatar_url,
        user_type: user.user_type || 'Member',
        unicorn_role: user.unicorn_role || 'User',
        tenant_id: user.tenant_id,
        tenant_name: user.tenants?.name || null,
        disabled: user.disabled || false,
        archived: user.archived || false,
        last_sign_in_at: user.last_sign_in_at,
      }));

      setUsers(tenantUsers);
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
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.tenant_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Tenant filter
    if (tenantFilter !== 'all') {
      filtered = filtered.filter(user => user.tenant_id === Number(tenantFilter));
    }

    // Role filter (Parent/Child)
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.user_type === roleFilter);
    }

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(user => !user.disabled && !user.archived);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(user => user.disabled || user.archived);
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'name':
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'tenant':
          aVal = a.tenant_name?.toLowerCase() || '';
          bVal = b.tenant_name?.toLowerCase() || '';
          break;
        case 'role':
          aVal = a.user_type;
          bVal = b.user_type;
          break;
        case 'status':
          aVal = (a.disabled || a.archived) ? 1 : 0;
          bVal = (b.disabled || b.archived) ? 1 : 0;
          break;
        case 'lastLogin':
          aVal = a.last_sign_in_at || '';
          bVal = b.last_sign_in_at || '';
          break;
        default:
          aVal = '';
          bVal = '';
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

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

  const getRoleBadge = (userType: string) => {
    switch (userType) {
      case 'Client Parent':
        return <Badge className="bg-blue-600 hover:bg-blue-700">Parent</Badge>;
      case 'Client Child':
        return <Badge variant="secondary">Child</Badge>;
      case 'Client':
        return <Badge variant="outline">Client</Badge>;
      default:
        return <Badge variant="outline">{userType}</Badge>;
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => !u.disabled && !u.archived).length,
    inactive: users.filter(u => u.disabled || u.archived).length,
    parents: users.filter(u => u.user_type === 'Client Parent').length,
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
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
        <div>
          <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-blue-600" />
            Tenant Users
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage client users linked to tenants
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parent Accounts</CardTitle>
              <Building2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.parents}</div>
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
                  placeholder="Search by name, email, or tenant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="Client Parent">Parent</SelectItem>
                  <SelectItem value="Client Child">Child</SelectItem>
                  <SelectItem value="Client">Client</SelectItem>
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

            {/* Bulk Action Toolbar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkActionType('activate');
                    setBulkActionDialogOpen(true);
                  }}
                >
                  <UserCheck className="h-4 w-4 mr-1" />
                  Activate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkActionType('deactivate');
                    setBulkActionDialogOpen(true);
                  }}
                >
                  <UserX className="h-4 w-4 mr-1" />
                  Deactivate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('name')}>
                      User
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('tenant')}>
                      Tenant
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('role')}>
                      Role
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('status')}>
                      Status
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('lastLogin')}>
                      Last Login
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No tenant users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.user_uuid}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/user-profile/${user.user_uuid}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(user.user_uuid)}
                          onCheckedChange={() => toggleSelection(user.user_uuid)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
                              {getInitials(user.first_name, user.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-medium">
                            {user.first_name} {user.last_name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {user.tenant_name ? (
                          <Badge variant="outline" className="font-normal">
                            {user.tenant_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.user_type)}</TableCell>
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

        {/* Bulk Action Confirmation Dialog */}
        <AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkActionType === 'activate' ? 'Activate' : 'Deactivate'} {selectedIds.size} Users?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will {bulkActionType === 'activate' ? 'enable' : 'disable'} access for {selectedIds.size} selected users.
                This action is logged for audit purposes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processingBulk}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkAction}
                disabled={processingBulk}
                className={bulkActionType === 'deactivate' ? 'bg-destructive hover:bg-destructive/90' : ''}
              >
                {processingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
