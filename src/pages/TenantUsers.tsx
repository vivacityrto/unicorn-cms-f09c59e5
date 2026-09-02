import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
import { Building2, Search, Users, UserCheck, UserX, ArrowUpDown, Loader2, Download, X } from 'lucide-react';
import { type PositionTypeOption, positionTypeLabel } from '@/lib/roles/positionType';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TenantFilterDialog } from '@/components/tenant-users/TenantFilterDialog';
import { ExportColumnsDialog, type ExportColumnOption } from '@/components/tenant-users/ExportColumnsDialog';
import { useCscAssignments } from '@/hooks/useCscAssignments';
import { cn } from '@/lib/utils';
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
  position_type: string | null;
  disabled: boolean;
  archived: boolean;
  last_sign_in_at: string | null;
}

interface Tenant {
  id: number;
  name: string;
  status: string | null;
}

interface EnrichedTenant extends Tenant {
  csc_user_id: string | null;
}

interface CscFilterOption {
  user_uuid: string;
  first_name: string;
  last_name: string;
  archived: boolean;
}

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

type SortField = 'name' | 'tenant' | 'role' | 'status' | 'lastLogin' | 'position';

const ROLE_LABELS: Record<string, string> = {
  'Client Parent': 'Parent',
  'Client Child': 'Child',
  Client: 'Client',
};

const EXPORT_COLUMNS: ExportColumnOption[] = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'tenant', label: 'Tenant' },
  { key: 'position_type', label: 'Position Type' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'last_login', label: 'Last Login' },
];

export default function TenantUsers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<TenantUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [positionTypeOptions, setPositionTypeOptions] = useState<PositionTypeOption[]>([]);
  const [tenantStatusOptions, setTenantStatusOptions] = useState<{ value: string; description: string }[]>([]);
  const [cscFilterOptions, setCscFilterOptions] = useState<CscFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilters, setTenantFilters] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [updatingPositionId, setUpdatingPositionId] = useState<string | null>(null);
  const [tenantFilterDialogOpen, setTenantFilterDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const tenantIds = useMemo(() => tenants.map(t => t.id), [tenants]);
  const cscQuery = useCscAssignments(tenantIds);

  // Enriches each tenant with its CSC assignment so the "Filter by Tenant"
  // modal can narrow its own ~400-row list by status/CSC before selection —
  // CSC/status are tenant-level attributes, not per-user ones.
  const enrichedTenants = useMemo<EnrichedTenant[]>(() => {
    const cscMap = cscQuery.data || {};
    return tenants.map(t => ({
      ...t,
      csc_user_id: cscMap[t.id]?.csc_user_id ?? null,
    }));
  }, [tenants, cscQuery.data]);

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'activate' | 'deactivate' | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);

  useEffect(() => {
    fetchData();
    fetchPositionTypeOptions();
    fetchTenantStatusOptions();
    fetchCscFilterOptions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, searchQuery, tenantFilters, roleFilter, statusFilter, positionFilter, sortField, sortDirection, positionTypeOptions]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, tenantFilters, roleFilter, statusFilter, positionFilter]);

  const handlePositionTypeChange = async (user: TenantUser, value: string) => {
    if (!user.tenant_id) return;
    setUpdatingPositionId(user.user_uuid);
    try {
      const { error } = await supabase
        .from('tenant_users')
        .update({ position_type: value || null })
        .eq('tenant_id', user.tenant_id)
        .eq('user_id', user.user_uuid);

      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.user_uuid === user.user_uuid ? { ...u, position_type: value || null } : u
      ));
      toast({ title: 'Position type updated' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingPositionId(null);
    }
  };

  const fetchPositionTypeOptions = async () => {
    const { data, error } = await supabase
      .from('dd_position_type')
      .select('value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      console.error('dd_position_type fetch error:', error);
      return;
    }
    setPositionTypeOptions(data || []);
  };

  const fetchTenantStatusOptions = async () => {
    const { data, error } = await supabase
      .from('dd_status')
      .select('value, description')
      .gte('code', 100)
      .order('code');
    if (error) {
      console.error('dd_status fetch error:', error);
      return;
    }
    setTenantStatusOptions(data || []);
  };

  const fetchCscFilterOptions = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('user_uuid, first_name, last_name, staff_teams, staff_team, archived')
      .eq('disabled', false)
      .order('archived', { ascending: true })
      .order('first_name', { ascending: true });
    if (error) {
      console.error('CSC options fetch error:', error);
      return;
    }
    const cscUsers = (data || []).filter(user => {
      const hasInTeams = user.staff_teams?.includes('client_success');
      const hasInTeam = user.staff_team === 'client_success';
      return hasInTeams || hasInTeam;
    });
    setCscFilterOptions(cscUsers.map(u => ({
      user_uuid: u.user_uuid,
      first_name: u.first_name,
      last_name: u.last_name,
      archived: u.archived || false,
    })));
  };

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
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error),
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
        .select('id, name, status')
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
          tenants!tenant_id(name),
          tenant_users!tenant_users_user_id_fkey(tenant_id, position_type)
        `)
        .in('user_type', ['Client Parent', 'Client Child', 'Client'])
        .order('first_name', { ascending: true });

      if (error) throw error;

      const tenantUsers: TenantUser[] = (data || []).map((user) => {
        const membershipRows = (user.tenant_users || []) as { tenant_id: number; position_type: string | null }[];
        const membership = membershipRows.find(tu => tu.tenant_id === user.tenant_id);

        return {
          user_uuid: user.user_uuid,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email,
          avatar_url: user.avatar_url,
          user_type: user.user_type || 'Member',
          unicorn_role: user.unicorn_role || 'User',
          tenant_id: user.tenant_id,
          tenant_name: user.tenants?.name || null,
          position_type: membership?.position_type ?? null,
          disabled: user.disabled || false,
          archived: user.archived || false,
          last_sign_in_at: user.last_sign_in_at,
        };
      });

      setUsers(tenantUsers);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error),
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
    if (tenantFilters.length > 0) {
      filtered = filtered.filter(user => user.tenant_id != null && tenantFilters.includes(user.tenant_id.toString()));
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

    // Position type filter
    if (positionFilter !== 'all') {
      filtered = filtered.filter(user => user.position_type === positionFilter);
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
        case 'position':
          aVal = positionTypeLabel(a.position_type, positionTypeOptions);
          bVal = positionTypeLabel(b.position_type, positionTypeOptions);
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

  const exportCsv = (data: unknown[], filename: string) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0] as object);
    const csv = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildExportRow = (user: TenantUser): Record<string, string> => ({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    tenant: user.tenant_name || '',
    position_type: positionTypeLabel(user.position_type, positionTypeOptions),
    role: user.user_type,
    status: (user.disabled || user.archived) ? 'Inactive' : 'Active',
    last_login: user.last_sign_in_at || '',
  });

  const handleConfirmExport = (selectedKeys: string[]) => {
    const rows = filteredUsers.map(user => {
      const full = buildExportRow(user);
      const row: Record<string, string> = {};
      selectedKeys.forEach(key => { row[key] = full[key]; });
      return row;
    });
    exportCsv(rows, 'tenant_users');
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

  const activeFilterChips: FilterChip[] = [];
  if (searchQuery) {
    activeFilterChips.push({ key: 'search', label: `Search: "${searchQuery}"`, onRemove: () => setSearchQuery('') });
  }
  if (tenantFilters.length > 0) {
    const label = tenantFilters.length === 1
      ? (tenants.find(t => t.id.toString() === tenantFilters[0])?.name ?? '1 tenant')
      : `${tenantFilters.length} tenants`;
    activeFilterChips.push({ key: 'tenant', label: `Tenant: ${label}`, onRemove: () => setTenantFilters([]) });
  }
  if (roleFilter !== 'all') {
    activeFilterChips.push({ key: 'role', label: `Role: ${ROLE_LABELS[roleFilter] ?? roleFilter}`, onRemove: () => setRoleFilter('all') });
  }
  if (statusFilter !== 'all') {
    activeFilterChips.push({
      key: 'status',
      label: `User Status: ${statusFilter === 'active' ? 'Active' : 'Inactive'}`,
      onRemove: () => setStatusFilter('all'),
    });
  }
  if (positionFilter !== 'all') {
    activeFilterChips.push({
      key: 'position',
      label: `Position: ${positionTypeLabel(positionFilter, positionTypeOptions)}`,
      onRemove: () => setPositionFilter('all'),
    });
  }

  const clearAllFilters = () => {
    setSearchQuery('');
    setTenantFilters([]);
    setRoleFilter('all');
    setStatusFilter('all');
    setPositionFilter('all');
  };

  const stats = {
    total: users.length,
    active: users.filter(u => !u.disabled && !u.archived).length,
    inactive: users.filter(u => u.disabled || u.archived).length,
    parents: users.filter(u => u.user_type === 'Client Parent').length,
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
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
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or tenant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setTenantFilterDialogOpen(true)}
                className={cn(
                  'w-[220px] justify-between font-normal min-w-0',
                  tenantFilters.length === 0 && 'text-muted-foreground',
                )}
              >
                <span className="truncate">
                  {tenantFilters.length === 0
                    ? 'All Tenants'
                    : tenantFilters.length === 1
                      ? tenants.find(t => t.id.toString() === tenantFilters[0])?.name ?? '1 tenant'
                      : `${tenantFilters.length} tenants selected`}
                </span>
                <Building2 className="h-4 w-4 shrink-0 opacity-50 ml-2" />
              </Button>
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
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="User Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All User Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Position Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Position Types</SelectItem>
                  {positionTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setExportDialogOpen(true)}
                disabled={filteredUsers.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Active Filters Summary */}
            {activeFilterChips.length > 0 && (
              <div className="flex items-center flex-wrap gap-2 mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground shrink-0">Active filters:</span>
                {activeFilterChips.map((chip) => (
                  <Badge
                    key={chip.key}
                    variant="secondary"
                    className="font-normal gap-1 pr-1 max-w-[260px]"
                  >
                    <span className="truncate">{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20 shrink-0"
                      aria-label={`Remove filter: ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-sm text-primary hover:underline ml-1"
                >
                  Clear all
                </button>
              </div>
            )}

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
                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 hover:bg-transparent" onClick={() => toggleSort('position')}>
                      Position Type
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
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="max-w-[200px]">
                        {user.tenant_name ? (
                          <Badge
                            variant="outline"
                            className="font-normal max-w-full truncate inline-block"
                            title={user.tenant_name}
                          >
                            {user.tenant_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.user_type)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {user.tenant_id ? (
                          <Select
                            value={user.position_type || ''}
                            onValueChange={(value) => handlePositionTypeChange(user, value)}
                            disabled={updatingPositionId === user.user_uuid}
                          >
                            <SelectTrigger className="w-[160px] h-8">
                              <SelectValue placeholder="—">
                                {user.position_type
                                  ? positionTypeLabel(user.position_type, positionTypeOptions)
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {positionTypeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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

        {/* Tenant Filter Dialog */}
        <TenantFilterDialog
          open={tenantFilterDialogOpen}
          onOpenChange={setTenantFilterDialogOpen}
          tenants={enrichedTenants}
          statusOptions={tenantStatusOptions}
          cscOptions={cscFilterOptions}
          selected={tenantFilters}
          onApply={setTenantFilters}
        />

        {/* Export Column Selection Dialog */}
        <ExportColumnsDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          columns={EXPORT_COLUMNS}
          rowCount={filteredUsers.length}
          onConfirm={handleConfirmExport}
        />

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
  );
}
