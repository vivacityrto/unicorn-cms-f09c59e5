import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { 
  Building2, 
  Users, 
  Search, 
  Plus,
  Edit,
  Trash2,
  Mail,
  Shield
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TenantInfo {
  id: number;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

interface UserDetails {
  mobile_phone: string | null;
  rto_name: string | null;
  email: string;
  abn: string | null;
  acn: string | null;
  website: string | null;
  lms: string | null;
  accounting_system: string | null;
  street_address: string | null;
  state: string | number | null;
  legal_name: string | null;
}

interface TeamUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  unicorn_role: string;
  user_type: string;
  disabled: boolean;
  created_at: string;
}

export default function TeamSettings() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'first_name' | 'email' | 'created_at'>('first_name');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    disabledUsers: 0,
  });
  const { toast } = useToast();
  const { profile, user } = useAuth();

  useEffect(() => {
    if (profile?.tenant_id) {
      fetchTenantInfo();
      fetchTeamUsers();
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [users, searchQuery, sortField]);

  const fetchTenantInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile?.tenant_id)
        .maybeSingle();

      if (error) throw error;
      setTenant(data);

      // Fetch current user details for mobile_phone, RTO info, and all tenant-related fields
      if (user?.id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('mobile_phone, rto_name, email, abn, acn, website, lms, accounting_system, street_address, state, legal_name')
          .eq('user_uuid', user.id)
          .maybeSingle();

        if (userError) {
          console.error('Error fetching user details:', userError);
        } else {
          setUserDetails(userData);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchTeamUsers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', profile?.tenant_id)
        .order('first_name');

      if (error) throw error;

      setUsers(data || []);

      // Calculate stats
      const active = (data || []).filter(u => !u.disabled).length;
      setStats({
        totalUsers: (data || []).length,
        activeUsers: active,
        disabledUsers: (data || []).length - active,
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

  const applyFiltersAndSort = () => {
    let filtered = [...users];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (user) =>
          user.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortField === 'first_name') {
        return (a.first_name || '').localeCompare(b.first_name || '');
      } else if (sortField === 'email') {
        return (a.email || '').localeCompare(b.email || '');
      } else if (sortField === 'created_at') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });

    setFilteredUsers(filtered);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('user_uuid', userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });

      fetchTeamUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold">Manage Team</h1>
        <p className="text-muted-foreground">Manage your organization and team members</p>
      </div>

      {/* Tenant Details Card - Modern 4-box design */}
      {tenant && (
        <Card className="animate-scale-in border-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold">Tenant Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-semibold text-muted-foreground">Organization</h3>
                </div>
                <p className="text-lg font-bold">{tenant.name}</p>
                <p className="text-xs text-muted-foreground mt-1">/{tenant.slug}</p>
              </div>

              <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-blue-500" />
                  <h3 className="text-sm font-semibold text-muted-foreground">Status</h3>
                </div>
                <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'} className="text-sm">
                  {tenant.status}
                </Badge>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 p-4 rounded-lg border border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-5 w-5 text-green-500" />
                  <h3 className="text-sm font-semibold text-muted-foreground">Contact</h3>
                </div>
                <p className="text-sm font-bold truncate">{userDetails?.email || user?.email || 'N/A'}</p>
                {userDetails?.mobile_phone && (
                  <p className="text-xs text-muted-foreground mt-1">{userDetails.mobile_phone}</p>
                )}
              </div>

              <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-4 rounded-lg border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  <h3 className="text-sm font-semibold text-muted-foreground">Team Size</h3>
                </div>
                <p className="text-lg font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.activeUsers} active</p>
              </div>
            </div>

            {/* Additional Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t">
              {userDetails?.rto_name && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">RTO Name</h3>
                  <p className="text-base font-semibold">{userDetails.rto_name}</p>
                </div>
              )}

              {userDetails?.legal_name && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Legal Name</h3>
                  <p className="text-base font-semibold">{userDetails.legal_name}</p>
                </div>
              )}

              {userDetails?.abn && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">ABN</h3>
                  <p className="text-base font-semibold">{userDetails.abn}</p>
                </div>
              )}

              {userDetails?.acn && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">ACN</h3>
                  <p className="text-base font-semibold">{userDetails.acn}</p>
                </div>
              )}

              {userDetails?.website && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Website</h3>
                  <p className="text-base font-semibold">
                    <a href={userDetails.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {userDetails.website}
                    </a>
                  </p>
                </div>
              )}

              {userDetails?.street_address && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Address</h3>
                  <p className="text-base font-semibold">{userDetails.street_address}</p>
                </div>
              )}

              {userDetails?.state && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">State</h3>
                  <p className="text-base font-semibold">{userDetails.state}</p>
                </div>
              )}

              {userDetails?.lms && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">LMS</h3>
                  <p className="text-base font-semibold">{userDetails.lms}</p>
                </div>
              )}

              {userDetails?.accounting_system && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Accounting System</h3>
                  <p className="text-base font-semibold">{userDetails.accounting_system}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tenant Info Cards */}
      {tenant && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="animate-scale-in">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Organization</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tenant.name}</div>
                <p className="text-xs text-muted-foreground">/{tenant.slug}</p>
                <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'} className="mt-2">
                  {tenant.status}
                </Badge>
              </CardContent>
            </Card>

            <Card className="animate-scale-in" style={{ animationDelay: '50ms' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground">{stats.activeUsers} active</p>
              </CardContent>
            </Card>

            <Card className="animate-scale-in" style={{ animationDelay: '100ms' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Your Role</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{profile?.unicorn_role}</div>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </CardContent>
            </Card>
          </div>

          {/* Organization Details Card */}
          <Card className="animate-scale-in" style={{ animationDelay: '150ms' }}>
            <CardHeader>
              <CardTitle className="text-xl">Organization Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Organization Name</h3>
                  <p className="text-base font-semibold">{tenant.name}</p>
                </div>

                {userDetails?.rto_name && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">RTO Name</h3>
                    <p className="text-base font-semibold">{userDetails.rto_name}</p>
                  </div>
                )}

                {userDetails?.legal_name && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Legal Name</h3>
                    <p className="text-base font-semibold">{userDetails.legal_name}</p>
                  </div>
                )}

                {userDetails?.abn && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">ABN</h3>
                    <p className="text-base font-semibold">{userDetails.abn}</p>
                  </div>
                )}

                {userDetails?.acn && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">ACN</h3>
                    <p className="text-base font-semibold">{userDetails.acn}</p>
                  </div>
                )}

                {userDetails?.email && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Contact Email</h3>
                    <p className="text-base font-semibold">{userDetails.email}</p>
                  </div>
                )}

                {userDetails?.mobile_phone && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Phone Number</h3>
                    <p className="text-base font-semibold">{userDetails.mobile_phone}</p>
                  </div>
                )}

                {userDetails?.rto_name && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">RTO Name</h3>
                    <p className="text-base font-semibold">{userDetails.rto_name}</p>
                  </div>
                )}

                {userDetails?.website && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Website</h3>
                    <p className="text-base font-semibold">
                      <a href={userDetails.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {userDetails.website}
                      </a>
                    </p>
                  </div>
                )}

                {userDetails?.street_address && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Street Address</h3>
                    <p className="text-base font-semibold">{userDetails.street_address}</p>
                  </div>
                )}

                {userDetails?.state && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">State</h3>
                    <p className="text-base font-semibold">{userDetails.state}</p>
                  </div>
                )}

                {userDetails?.lms && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">LMS</h3>
                    <p className="text-base font-semibold">{userDetails.lms}</p>
                  </div>
                )}

                {userDetails?.accounting_system && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Accounting System</h3>
                    <p className="text-base font-semibold">{userDetails.accounting_system}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team Members Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Team Members</h2>
          <Button
            onClick={() => toast({ title: 'Add User', description: 'Add user functionality coming soon' })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={sortField} onValueChange={(value: any) => setSortField(value)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_name">Name</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="created_at">Date Added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No team members found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.user_uuid}>
                      <TableCell className="font-medium">
                        {user.first_name} {user.last_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.unicorn_role}</Badge>
                      </TableCell>
                      <TableCell>{user.user_type}</TableCell>
                      <TableCell>
                        <Badge variant={user.disabled ? 'destructive' : 'default'}>
                          {user.disabled ? 'Disabled' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toast({ title: 'Edit User', description: 'Edit functionality coming soon' })}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {profile?.unicorn_role === 'Super Admin' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user.user_uuid)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
