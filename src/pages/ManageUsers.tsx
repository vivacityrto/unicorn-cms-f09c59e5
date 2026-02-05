import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Users, UserCheck, UserX, Search, ArrowUpDown, Edit, Trash2, UserX as UserXIcon, Save, UserPlus, Building2, ChevronLeft, ChevronRight, Filter, UsersRound, UserMinus } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { InviteUserDialog } from '@/components/InviteUserDialog';
import { AdminInviteUserDialog } from '@/components/AdminInviteUserDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';


interface User {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string | null;
  user_type: 'Vivacity Team' | 'Client Parent' | 'Client Child' | 'Client' | 'Member';
  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User';
  tenant_id: string | null;
  disabled: boolean;
  archived: boolean;
  tenant_name?: string | null;
  avatar_url?: string | null;
}

export default function ManageUsers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantIdParam = searchParams.get('tenant');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'email' | 'user_type' | 'mobile_phone'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tenantName, setTenantName] = useState<string>('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    mobile_phone: '',
    job_title: '',
    timezone: '',
    bio: '',
    user_type: '',
    unicorn_role: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
  } | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    open: boolean;
    userId: string;
    newRole: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User';
  } | null>(null);
  const { profile } = useAuth();
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';
  const isAdmin = profile?.unicorn_role === 'Admin';
  const [isAdminInviteDialogOpen, setIsAdminInviteDialogOpen] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');

  const filterOptions = [
    { value: 'all', label: 'All Types', icon: Filter, color: '' },
    { value: 'Vivacity Team', label: 'Vivacity Team', icon: Building2, color: 'text-purple-600' },
    { value: 'Client Parent', label: 'Client Parent', icon: UsersRound, color: 'text-blue-600' },
    { value: 'Client Child', label: 'Client Child', icon: Users, color: 'text-cyan-600' },
    { value: 'active', label: 'Active', icon: UserCheck, color: 'text-green-600' },
    { value: 'inactive', label: 'Inactive', icon: UserMinus, color: 'text-red-600' }
  ];

  const filteredFilterOptions = filterOptions.filter(option => 
    option.label.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  const getCurrentFilterLabel = () => {
    if (statusFilter !== 'all') {
      return filterOptions.find(o => o.value === statusFilter)?.label || 'All Types';
    }
    if (userTypeFilter !== 'all') {
      return filterOptions.find(o => o.value === userTypeFilter)?.label || 'All Types';
    }
    return 'All Types';
  };

  const getCurrentFilterValue = () => {
    if (statusFilter !== 'all') return statusFilter;
    if (userTypeFilter !== 'all') return userTypeFilter;
    return 'all';
  };

  useEffect(() => {
    fetchUsers();
    fetchCurrentUserRole();
  }, [profile?.tenant_id, tenantIdParam]);

  useEffect(() => {
    applyFiltersAndSort();
    setCurrentPage(1);
  }, [users, searchQuery, userTypeFilter, statusFilter, sortField, sortDirection]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Determine which tenant to filter by
      const filterTenantId = tenantIdParam || (profile?.unicorn_role === 'Admin' ? profile?.tenant_id : null);

      // If filtering by tenant, fetch tenant name first
      if (filterTenantId) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', Number(filterTenantId))
          .single();
        
        if (tenantData) {
          setTenantName(tenantData.name);
        }
      }

      // Build query with optional tenant filter
      let query = supabase
        .from('users')
        .select(`
          user_uuid,
          first_name,
          last_name,
          email,
          mobile_phone,
          user_type,
          unicorn_role,
          tenant_id,
          disabled,
          archived,
          avatar_url,
          tenants!tenant_id (
            name
          )
        `);

      // Apply tenant filter if provided or if user is Admin
      if (filterTenantId) {
        query = query.eq('tenant_id', Number(filterTenantId));
      }

      const { data: usersData, error: usersError } = await query.order('first_name', { ascending: true });

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      console.log('Fetched users data:', usersData);
      
      // Enrich users with tenant names from the joined data
      const enrichedUsers: User[] = (usersData || []).map((user: any) => ({
        user_uuid: user.user_uuid,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email,
        mobile_phone: user.mobile_phone,
        user_type: (user.user_type || 'Member') as 'Vivacity Team' | 'Client Parent' | 'Client Child' | 'Client' | 'Member',
        unicorn_role: (user.unicorn_role || 'User') as 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User',
        tenant_id: user.tenant_id,
        disabled: user.disabled || false,
        archived: user.archived || false,
        avatar_url: user.avatar_url,
        tenant_name: user.tenants?.name || null,
      }));

      console.log('Enriched users:', enrichedUsers);
      
      setUsers(enrichedUsers);
    } catch (error: any) {
      console.error('Fetch users error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('unicorn_role')
          .eq('user_uuid', user.id)
          .single();
        
        if (error) throw error;
        setCurrentUserRole(data?.unicorn_role || '');
      }
    } catch (error: any) {
      console.error('Error fetching current user role:', error);
    }
  };

  const handleRoleChange = (userId: string, newRole: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User') => {
    setRoleChangeDialog({
      open: true,
      userId,
      newRole,
    });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeDialog) return;

    try {
      const isVivacityRole = ['Super Admin', 'Team Leader', 'Team Member']
        .includes(roleChangeDialog.newRole);
      
      // For Vivacity Team roles, verify auth account exists
      if (isVivacityRole) {
        const { data: hasAuth, error: authCheckError } = await supabase.rpc('has_auth_account', {
          p_user_uuid: roleChangeDialog.userId
        });
        
        if (authCheckError) {
          console.error('Auth check error:', authCheckError);
          throw new Error('Failed to verify auth account status');
        }
        
        if (!hasAuth) {
          toast({
            title: 'Auth Account Required',
            description: 'This user must have an auth account for Vivacity Team roles. Send them an invite first.',
            variant: 'destructive',
          });
          setRoleChangeDialog(null);
          return;
        }
      }
      
      const { error } = await supabase
        .from('users')
        .update({ unicorn_role: roleChangeDialog.newRole })
        .eq('user_uuid', roleChangeDialog.userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setRoleChangeDialog(null);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...users];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(user => 
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.tenant_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // User type filter
    if (userTypeFilter !== 'all') {
      filtered = filtered.filter(user => user.user_type === userTypeFilter);
    }

    // Status filter (Active/Inactive)
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        filtered = filtered.filter(user => !user.disabled && !user.archived);
      } else if (statusFilter === 'inactive') {
        filtered = filtered.filter(user => user.disabled || user.archived);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string, bVal: string;
      
      switch (sortField) {
        case 'name':
          aVal = `${a.first_name} ${a.last_name}`;
          bVal = `${b.first_name} ${b.last_name}`;
          break;
        case 'email':
          aVal = a.email;
          bVal = b.email;
          break;
        case 'user_type':
          aVal = a.user_type;
          bVal = b.user_type;
          break;
        case 'mobile_phone':
          aVal = a.mobile_phone || '';
          bVal = b.mobile_phone || '';
          break;
        default:
          aVal = '';
          bVal = '';
      }

      const comparison = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredUsers(filtered);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setDeleteDialog({
      open: true,
      userId,
      userName,
    });
  };

  const confirmDeleteUser = async () => {
    if (!deleteDialog) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          user_uuid: deleteDialog.userId,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to delete user');
      }

      // Immediately update local state to remove the user
      setUsers(prevUsers => prevUsers.filter(u => u.user_uuid !== deleteDialog.userId));
      setFilteredUsers(prevFiltered => prevFiltered.filter(u => u.user_uuid !== deleteDialog.userId));

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      
      setDeleteDialog(null);
      
      // Fetch fresh data in background
      await fetchUsers();
    } catch (error: any) {
      console.error('Delete user error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
      setDeleteDialog(null);
    }
  };

  const handleEditUser = async (user: User) => {
    setEditingUser(user);
    
    // Fetch full user details including job_title, timezone, bio, user_type, unicorn_role
    const { data, error } = await supabase
      .from('users')
      .select('first_name, last_name, mobile_phone, job_title, timezone, bio, user_type, unicorn_role')
      .eq('user_uuid', user.user_uuid)
      .single();
    
    if (!error && data) {
      setEditFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        mobile_phone: data.mobile_phone || '',
        job_title: data.job_title || '',
        timezone: data.timezone || 'Australia/Sydney',
        bio: data.bio || '',
        user_type: data.user_type || '',
        unicorn_role: data.unicorn_role || '',
      });
    } else {
      setEditFormData({
        first_name: user.first_name,
        last_name: user.last_name,
        mobile_phone: user.mobile_phone || '',
        job_title: '',
        timezone: 'Australia/Sydney',
        bio: '',
        user_type: user.user_type || '',
        unicorn_role: user.unicorn_role || '',
      });
    }
    
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const { data, error } = await supabase.functions.invoke('update-user-profile', {
        body: {
          user_uuid: editingUser.user_uuid,
          first_name: editFormData.first_name,
          last_name: editFormData.last_name,
          mobile_phone: editFormData.mobile_phone || null,
          job_title: editFormData.job_title || null,
          timezone: editFormData.timezone || null,
          bio: editFormData.bio || null,
          user_type: editFormData.user_type || null,
          unicorn_role: editFormData.unicorn_role || null,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || 'Failed to update user');
      }

      toast({
        title: 'Success',
        description: 'User updated successfully',
      });

      setIsEditDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const totalUsers = users.length;
  const activeUsers = users.filter(u => !u.disabled && !u.archived).length;
  const inactiveUsers = users.filter(u => u.disabled || u.archived).length;
  const vivacityUsers = users.filter(u => u.user_type === 'Vivacity Team').length;

  const getUserTypeBadgeVariant = (userType: string): 'outline' => {
    // All user types now use outline variant for consistency
    return 'outline';
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'Super Admin':
        return 'default';
      case 'Team Leader':
        return 'secondary';
      case 'Team Member':
        return 'outline';
      case 'Admin':
        return 'secondary';
      case 'User':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-[28px] font-bold">Manage Users</h1>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Manage Users
            {tenantName && <span className="text-primary"> - {tenantName}</span>}
          </h1>
          <p className="text-muted-foreground">
            {tenantIdParam 
              ? `Viewing users for this tenant organization` 
              : 'View and manage all system users'}
          </p>
        </div>
        <div className="flex gap-2">
          {tenantIdParam && (
            <Button 
              variant="outline"
              onClick={() => navigate('/manage-tenants')}
            >
              Back to Tenants
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => {
                      if (isAdmin) {
                        setIsAdminInviteDialogOpen(true);
                      } else {
                        setIsInviteDialogOpen(true);
                      }
                    }}
                    className={isTeamLeader ? "bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"}
                    disabled={isTeamLeader}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </span>
              </TooltipTrigger>
              {isTeamLeader && (
                <TooltipContent>
                  <p>Please contact Super Admins.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          onClick={() => {
            setStatusFilter('all');
            setUserTypeFilter('all');
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Users</span>
            <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{totalUsers}</p>
          <p className="text-xs text-muted-foreground">Registered users</p>
        </div>

        <div 
          onClick={() => {
            setStatusFilter('active');
            setUserTypeFilter('all');
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: '50ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Active</span>
            <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{activeUsers}</p>
          <p className="text-xs text-muted-foreground">Currently active</p>
        </div>

        <div 
          onClick={() => {
            setStatusFilter('inactive');
            setUserTypeFilter('all');
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Inactive</span>
            <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
              <UserX className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{inactiveUsers}</p>
          <p className="text-xs text-muted-foreground">Deactivated users</p>
        </div>

        <div 
          onClick={() => {
            setUserTypeFilter('Vivacity Team');
            setStatusFilter('all');
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: '150ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Vivacity Users</span>
            <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
              <Building2 className="h-5 w-5 text-purple-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{vivacityUsers}</p>
          <p className="text-xs text-muted-foreground">Team members</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            style={{ height: '48px' }}
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full md:w-[220px] h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm justify-between">
              <span className="text-foreground">{getCurrentFilterLabel()}</span>
              <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2 min-w-[220px] rounded-lg shadow-lg border-border/50 bg-popover z-50" align="start">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search..." 
                value={filterSearchQuery} 
                onChange={e => setFilterSearchQuery(e.target.value)} 
                className="pl-9 h-9 text-sm rounded-md" 
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {filteredFilterOptions.map((option, index) => {
                const Icon = option.icon;
                const isSelected = getCurrentFilterValue() === option.value;
                return (
                  <div key={option.value}>
                    <div 
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2",
                        isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                      )} 
                      onClick={() => {
                        if (option.value === 'active' || option.value === 'inactive') {
                          setStatusFilter(option.value);
                          setUserTypeFilter('all');
                        } else {
                          setUserTypeFilter(option.value);
                          setStatusFilter('all');
                        }
                        setFilterSearchQuery("");
                      }}
                    >
                      {Icon && <Icon className={cn("h-4 w-4", option.color)} />}
                      {option.label}
                    </div>
                    {index < filteredFilterOptions.length - 1 && (
                      <div className="mx-2 my-1 border-b border-border/50" />
                    )}
                  </div>
                );
              })}
              {filteredFilterOptions.length === 0 && filterSearchQuery && (
                <p className="text-xs text-muted-foreground text-center py-2">No filters found</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Users Table */}
      <div className="rounded-lg border-0 bg-card shadow-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 hover:bg-transparent">
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Role</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 hover:bg-transparent"
                  onClick={() => toggleSort('name')}
                >
                  Full Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 hover:bg-transparent"
                  onClick={() => toggleSort('email')}
                >
                  Email
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Tenant</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 hover:bg-transparent"
                  onClick={() => toggleSort('user_type')}
                >
                  User Type
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 hover:bg-transparent"
                  onClick={() => toggleSort('mobile_phone')}
                >
                  Mobile Phone
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r">Status</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((user, index) => (
                 <TableRow 
                  key={user.user_uuid}
                  className="group hover:bg-primary/5 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20 animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={() => navigate(`/user-profile/${user.user_uuid}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="py-6 border-r border-border/50">
                    {currentUserRole === 'Super Admin' ? (
                      <Combobox
                        options={[
                          { value: 'Super Admin', label: 'Super Admin' },
                          { value: 'Team Leader', label: 'Team Leader' },
                          { value: 'Team Member', label: 'Team Member' },
                          { value: 'Admin', label: 'Admin' },
                          { value: 'User', label: 'User' }
                        ]}
                        value={user.unicorn_role}
                        onValueChange={(newRole) => handleRoleChange(user.user_uuid, newRole as 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User')}
                        placeholder="Select role..."
                        searchPlaceholder="Search roles..."
                        emptyText="No roles found."
                        className="w-[160px]"
                      />
                    ) : (
                      <Badge variant={getRoleBadgeVariant(user.unicorn_role)}>
                        {user.unicorn_role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground whitespace-nowrap py-6 border-r border-border/50">
                    {user.first_name || user.last_name ? `${user.first_name} ${user.last_name}`.trim() : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm py-6 border-r border-border/50">
                    {user.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm py-6 border-r border-border/50">
                    <div className="truncate max-w-[200px]">{user.tenant_name || '—'}</div>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    <Badge variant={getUserTypeBadgeVariant(user.user_type)}>
                      {user.user_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm py-6 border-r border-border/50">
                    {user.mobile_phone || '—'}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50">
                    {user.disabled || user.archived ? (
                      <Badge 
                        variant="outline"
                        className="text-[0.75rem] font-medium py-[2px] px-[0.625rem] rounded-[11px]"
                        style={{
                          borderColor: '#DC2626',
                          color: '#DC2626',
                          backgroundColor: '#DC262610',
                          borderWidth: '1.5px'
                        }}
                      >
                        Inactive
                      </Badge>
                    ) : (
                      <Badge 
                        variant="outline" 
                        className="text-[0.75rem] font-medium py-[2px] px-[0.625rem] rounded-[11px]"
                        style={{
                          borderColor: '#16A34A',
                          color: '#16A34A',
                          backgroundColor: '#16A34A10',
                          borderWidth: '1.5px'
                        }}
                      >
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-6 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditUser(user);
                        }}
                        className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(user.user_uuid, `${user.first_name} ${user.last_name}`.trim());
                        }}
                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {filteredUsers.length === 0 && (
        <div className="rounded-lg border-0 bg-card shadow-lg p-8 text-center">
          <p className="text-muted-foreground">No users found</p>
        </div>
      )}

      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredUsers.length)}–{Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.ceil(filteredUsers.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                  return false;
                })
                .map((page, index, array) => {
                  if (index > 0 && array[index - 1] !== page - 1) {
                    return [
                      <PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-4">...</span>
                      </PaginationItem>,
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ];
                  }
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredUsers.length / itemsPerPage), p + 1))}
                  className={currentPage === Math.ceil(filteredUsers.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
          </DialogHeader>
          {editingUser && currentUserRole === 'Super Admin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-first-name">First Name *</Label>
                  <Input
                    id="edit-first-name"
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-last-name">Last Name *</Label>
                  <Input
                    id="edit-last-name"
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    value={editingUser.email}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    value={editFormData.mobile_phone}
                    onChange={(e) => setEditFormData({ ...editFormData, mobile_phone: e.target.value })}
                    placeholder="e.g., 0412 345 678"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-job-title">Job Title</Label>
                  <Input
                    id="edit-job-title"
                    value={editFormData.job_title}
                    onChange={(e) => setEditFormData({ ...editFormData, job_title: e.target.value })}
                    placeholder="e.g., Compliance Manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-timezone">Timezone</Label>
                  <Select
                    value={editFormData.timezone}
                    onValueChange={(value) => setEditFormData({ ...editFormData, timezone: value })}
                  >
                    <SelectTrigger id="edit-timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia/Sydney">Sydney (AEDT/AEST)</SelectItem>
                      <SelectItem value="Australia/Melbourne">Melbourne (AEDT/AEST)</SelectItem>
                      <SelectItem value="Australia/Brisbane">Brisbane (AEST)</SelectItem>
                      <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                      <SelectItem value="Australia/Adelaide">Adelaide (ACDT/ACST)</SelectItem>
                      <SelectItem value="Australia/Darwin">Darwin (ACST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-user-type">User Type</Label>
                  <Select
                    value={editFormData.user_type}
                    onValueChange={(value) => setEditFormData({ ...editFormData, user_type: value })}
                  >
                    <SelectTrigger id="edit-user-type">
                      <SelectValue placeholder="Select user type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vivacity Team">Vivacity Team</SelectItem>
                      <SelectItem value="Client Parent">Client Parent</SelectItem>
                      <SelectItem value="Client Child">Client Child</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unicorn-role">System Role</Label>
                  <Select
                    value={editFormData.unicorn_role}
                    onValueChange={(value) => setEditFormData({ ...editFormData, unicorn_role: value })}
                  >
                    <SelectTrigger id="edit-unicorn-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Super Admin">Super Admin</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="User">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-bio">Bio</Label>
                <Textarea
                  id="edit-bio"
                  value={editFormData.bio}
                  onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
              </div>
            </div>
          )}
          {editingUser && currentUserRole !== 'Super Admin' && (
            <div className="text-center py-8 text-muted-foreground">
              Only Super Admins can edit user profiles.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            {currentUserRole === 'Super Admin' && (
              <Button onClick={handleSaveEdit}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <InviteUserDialog 
        open={isInviteDialogOpen} 
        onOpenChange={setIsInviteDialogOpen}
        onSuccess={fetchUsers}
      />

      {/* Admin Invite User Dialog */}
      {isAdmin && profile?.tenant_id && (
        <AdminInviteUserDialog
          open={isAdminInviteDialogOpen}
          onOpenChange={setIsAdminInviteDialogOpen}
          onSuccess={fetchUsers}
          tenantId={profile.tenant_id}
          tenantName={tenantName || 'Your Organization'}
        />
      )}

      {/* Role Change Confirmation Dialog */}
      <AlertDialog open={roleChangeDialog?.open || false} onOpenChange={(open) => !open && setRoleChangeDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this user's role? This action will apply the change immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialog?.open || false} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteDialog?.userName}? This action cannot be undone and will permanently remove the user from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
