import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Users, Search, CheckCircle2, XCircle, Activity, Link as LinkIcon, AlertCircle, Calendar, Package2, UserPlus, Archive } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AddTenantDialog } from "@/components/AddTenantDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { CSCQuickAssignDialog } from "@/components/client/CSCQuickAssignDialog";
interface Tenant {
  id: number;
  name: string;
  slug: string;
  status: string;
  risk_level: string;
  created_at: string;
  member_count: number;
  csc_name?: string | null;
  csc_avatar?: string | null;
  csc_user_id?: string | null;
  csc_archived?: boolean;
  package_name?: string | null;
  package_full_text?: string | null;
  package_id?: number | null;
  state?: string | null;
}

interface CSCFilterOption {
  user_uuid: string;
  first_name: string;
  last_name: string;
  archived: boolean;
}
export default function ManageTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active"); // Default to active
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [cscFilter, setCscFilter] = useState<string>("all");
  const [cscFilterOptions, setCscFilterOptions] = useState<CSCFilterOption[]>([]);
  const [packages, setPackages] = useState<{
    id: number;
    name: string;
    created_at?: string;
  }[]>([]);
  const [sortField, setSortField] = useState<"status" | "member_count" | "created_at">("status");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [connectedTenantIds, setConnectedTenantIds] = useState<number[]>([]);
  const [assignedTenants, setAssignedTenants] = useState<Record<number, { userId: string; userName: string }>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    tenant: Tenant | null;
  }>({
    open: false,
    tenant: null
  });
  const [connectAllDialog, setConnectAllDialog] = useState(false);
  const [addTenantDialog, setAddTenantDialog] = useState(false);
  const [cscAssignDialog, setCscAssignDialog] = useState<{ open: boolean; tenant: Tenant | null }>({
    open: false,
    tenant: null
  });
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalMembers: 0
  });
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const {
    profile
  } = useAuth();
  const isSuperAdmin = profile?.unicorn_role === "Super Admin";
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  useEffect(() => {
    fetchTenants();
    fetchPackages();
    fetchCSCOptions();
    checkConnectedTenant();
  }, []);
  const checkConnectedTenant = async () => {
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      
      // Get current user's connections
      const {
        data,
        error
      } = await supabase.from("connected_tenants").select("tenant_id").eq("user_uuid", session.session.user.id);
      if (error && error.code !== "PGRST116") {
        console.error("Error checking connection:", error);
      }
      if (data && data.length > 0) {
        setConnectedTenantIds(data.map(item => item.tenant_id));
      }

      // Get all tenant assignments (for other users)
      const { data: allAssignments } = await supabase
        .from("connected_tenants")
        .select("tenant_id, user_uuid")
        .neq("user_uuid", session.session.user.id);

      if (allAssignments && allAssignments.length > 0) {
        // Get user details for those assignments
        const userUuids = allAssignments.map(a => a.user_uuid);
        const { data: usersData } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name")
          .in("user_uuid", userUuids);

        const assignmentsMap: Record<number, { userId: string; userName: string }> = {};
        allAssignments.forEach(assignment => {
          const user = usersData?.find(u => u.user_uuid === assignment.user_uuid);
          if (user) {
            assignmentsMap[assignment.tenant_id] = {
              userId: assignment.user_uuid,
              userName: `${user.first_name} ${user.last_name}`
            };
          }
        });
        setAssignedTenants(assignmentsMap);
      }
    } catch (error) {
      console.error("Error checking connected tenant:", error);
    }
  };
  useEffect(() => {
    applyFiltersAndSort();
    setCurrentPage(1);
  }, [tenants, searchQuery, statusFilter, packageFilter, cscFilter, sortField]);
  const fetchTenants = async () => {
    try {
      setLoading(true);

      // Fetch tenants (without direct package join - packages are in package_instances)
      const {
        data: tenantsData,
        error: tenantsError
      } = await supabase.from("tenants").select("*").order("name");
      if (tenantsError) throw tenantsError;
      if (!tenantsData || tenantsData.length === 0) {
        setTenants([]);
        setStats({
          total: 0,
          active: 0,
          inactive: 0,
          totalMembers: 0
        });
        setLoading(false);
        return;
      }
      const tenantIds = tenantsData.map(t => t.id);

      // Fetch active package instances for each tenant (is_complete = false)
      const {
        data: packageInstancesData
      } = await supabase
        .from("package_instances")
        .select("tenant_id, package_id")
        .eq("is_complete", false)
        .in("tenant_id", tenantIds);

      // Get unique package IDs to fetch package names
      const packageIds = [...new Set((packageInstancesData || []).map(pi => pi.package_id).filter(Boolean))];
      
      // Fetch package details
      const {
        data: packagesData
      } = await supabase
        .from("packages")
        .select("id, name, full_text, slug")
        .in("id", packageIds);

      // Build package lookup map
      const packageLookup = (packagesData || []).reduce((acc, pkg) => {
        acc[pkg.id] = { name: pkg.name, full_text: pkg.full_text, slug: pkg.slug };
        return acc;
      }, {} as Record<number, { name: string; full_text: string | null; slug: string | null }>);

      // Build tenant -> packages map (a tenant can have multiple active packages)
      const tenantPackagesMap = (packageInstancesData || []).reduce((acc, pi) => {
        if (!acc[pi.tenant_id]) {
          acc[pi.tenant_id] = [];
        }
        if (pi.package_id && packageLookup[pi.package_id]) {
          acc[pi.tenant_id].push({
            id: pi.package_id,
            name: packageLookup[pi.package_id].name,
            full_text: packageLookup[pi.package_id].full_text
          });
        }
        return acc;
      }, {} as Record<number, { id: number; name: string; full_text: string | null }[]>);

      // Batch fetch all member counts
      const {
        data: memberCounts
      } = await supabase.from("users").select("tenant_id").in("tenant_id", tenantIds);
      const memberCountMap = (memberCounts || []).reduce((acc, user) => {
        acc[user.tenant_id] = (acc[user.tenant_id] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Batch fetch CSC data from tenant_csc_assignments (primary only)
      const {
        data: cscAssignments
      } = await supabase
        .from("tenant_csc_assignments")
        .select("tenant_id, csc_user_id")
        .in("tenant_id", tenantIds)
        .eq("is_primary", true);
      const cscMap = (cscAssignments || []).reduce((acc, assignment) => {
        acc[assignment.tenant_id] = assignment.csc_user_id;
        return acc;
      }, {} as Record<number, string>);

      // Batch fetch all CSC user names, avatars, and archived status
      const userUuids = Object.values(cscMap).filter(Boolean);
      const {
        data: usersData
      } = await supabase.from("users").select("user_uuid, first_name, last_name, avatar_url, archived").in("user_uuid", userUuids);
      const userDataMap = (usersData || []).reduce((acc, user) => {
        acc[user.user_uuid] = {
          name: `${user.first_name} ${user.last_name}`,
          avatar: user.avatar_url,
          archived: user.archived || false
        };
        return acc;
      }, {} as Record<string, { name: string; avatar: string | null; archived: boolean }>);

      // Fetch state from first admin user for each tenant with state name
      const {
        data: adminUsersData
      } = await supabase.from("users").select("tenant_id, state").eq("unicorn_role", "Admin").in("tenant_id", tenantIds);
      
      // Get unique state codes
      const stateCodes = [...new Set(adminUsersData?.map(u => u.state).filter(Boolean) || [])];
      
      // Fetch state descriptions
      const {
        data: statesData
      } = await supabase.from("ctstates").select("Code, Description").in("Code", stateCodes);
      
      const stateDescMap = (statesData || []).reduce((acc, state) => {
        acc[state.Code] = state.Description;
        return acc;
      }, {} as Record<number, string>);

      const stateMap = (adminUsersData || []).reduce((acc, user) => {
        if (!acc[user.tenant_id] && user.state) {
          acc[user.tenant_id] = stateDescMap[user.state] || "";
        }
        return acc;
      }, {} as Record<number, string | null>);

      // Merge all data - use first active package for display
      const tenantsWithCounts = tenantsData.map(tenant => {
        const activePackages = tenantPackagesMap[tenant.id] || [];
        const firstPackage = activePackages[0];
        const cscUserId = cscMap[tenant.id];
        return {
          ...tenant,
          member_count: memberCountMap[tenant.id] || 0,
          csc_user_id: cscUserId || null,
          csc_name: cscUserId ? userDataMap[cscUserId]?.name : null,
          csc_avatar: cscUserId ? userDataMap[cscUserId]?.avatar : null,
          csc_archived: cscUserId ? userDataMap[cscUserId]?.archived : false,
          package_name: firstPackage?.name || null,
          package_full_text: firstPackage?.full_text || null,
          package_id: firstPackage?.id || null,
          state: stateMap[tenant.id] || null
        };
      });
      setTenants(tenantsWithCounts);

      // Calculate stats
      const totalMembers = tenantsWithCounts.reduce((sum, t) => sum + t.member_count, 0);
      const active = tenantsWithCounts.filter(t => t.status === "active").length;
      setStats({
        total: tenantsWithCounts.length,
        active,
        inactive: tenantsWithCounts.length - active,
        totalMembers
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const fetchPackages = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("packages").select("id, name, created_at").order("name");
      if (error) throw error;
      setPackages(data || []);
    } catch (error: any) {
      console.error("Error fetching packages:", error);
    }
  };

  const fetchCSCOptions = async () => {
    try {
      // Fetch CSC users - those with client_success in staff_teams or staff_team
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, staff_teams, staff_team, archived")
        .eq("disabled", false)
        .order("archived", { ascending: true })
        .order("first_name", { ascending: true });
      
      if (error) throw error;
      
      // Filter to users with client_success
      const cscUsers = (data || []).filter(user => {
        const hasInTeams = user.staff_teams?.includes('client_success');
        const hasInTeam = user.staff_team === 'client_success';
        return hasInTeams || hasInTeam;
      });
      
      setCscFilterOptions(cscUsers.map(u => ({
        user_uuid: u.user_uuid,
        first_name: u.first_name,
        last_name: u.last_name,
        archived: u.archived || false
      })));
    } catch (error: any) {
      console.error("Error fetching CSC options:", error);
    }
  };

  // Subscribe to package changes for real-time updates
  useEffect(() => {
    const packagesChannel = supabase
      .channel('packages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages'
        },
        () => {
          fetchPackages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(packagesChannel);
    };
  }, []);

  // Subscribe to tenant_csc_assignments changes for real-time CSC updates
  useEffect(() => {
    const cscChannel = supabase
      .channel('csc-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenant_csc_assignments'
        },
        () => {
          fetchTenants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(cscChannel);
    };
  }, []);
  const applyFiltersAndSort = () => {
    let filtered = [...tenants];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(tenant => tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) || tenant.slug.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.status === statusFilter);
    }

    // Apply package filter
    if (packageFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.package_id?.toString() === packageFilter);
    }

    // Apply CSC filter
    if (cscFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.csc_user_id === cscFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortField === "status") {
        return a.status.localeCompare(b.status);
      } else if (sortField === "member_count") {
        return b.member_count - a.member_count;
      } else if (sortField === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });
    setFilteredTenants(filtered);
  };
  const handleStatusToggle = async (tenantId: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const {
        error
      } = await supabase.from("tenants").update({
        status: newStatus
      }).eq("id", tenantId);
      if (error) throw error;
      toast({
        title: "Success",
        description: `Tenant ${newStatus === "active" ? "activated" : "deactivated"} successfully`
      });
      fetchTenants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleConnect = async (tenant: Tenant) => {
    if (!isSuperAdmin && !isTeamLeader) {
      toast({
        title: "Access Denied",
        description: "Only Super Admins and Team Leaders can connect to tenants",
        variant: "destructive"
      });
      return;
    }

    // Check if already connected - show disconnect dialog
    if (connectedTenantIds.includes(tenant.id)) {
      setDisconnectDialog({
        open: true,
        tenant
      });
      return;
    }
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const {
        error
      } = await supabase.from("connected_tenants").upsert({
        user_uuid: session.session.user.id,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: session.session.user.email || ""
      }, {
        onConflict: "user_uuid,tenant_id"
      });
      if (error) throw error;
      setConnectedTenantIds(prev => [...prev, tenant.id]);
      // Refresh tenants so CSC column updates immediately
      fetchTenants();
      toast({
        title: "Connected",
        description: `You are now connected to "${tenant.name}" workspace`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleDisconnect = async () => {
    if (!disconnectDialog.tenant) return;
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const {
        error
      } = await supabase.from("connected_tenants").delete().eq("user_uuid", session.session.user.id).eq("tenant_id", disconnectDialog.tenant.id);
      if (error) throw error;
      setConnectedTenantIds(prev => prev.filter(id => id !== disconnectDialog.tenant!.id));
      toast({
        title: "Disconnected",
        description: `Disconnected from "${disconnectDialog.tenant.name}" workspace`
      });
      setDisconnectDialog({
        open: false,
        tenant: null
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleConnectToAll = async () => {
    if (!isSuperAdmin && !isTeamLeader) {
      toast({
        title: "Access Denied",
        description: "Only Super Admins and Team Leaders can connect to tenants",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      if (!session?.session?.user) return;

      // Get all active tenants
      const activeTenants = tenants.filter(t => t.status === "active");

      // Connect to all active tenants
      const connections = activeTenants.map(tenant => ({
        user_uuid: session.session.user.id,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: session.session.user.email || ""
      }));
      const {
        error
      } = await supabase.from("connected_tenants").upsert(connections, {
        onConflict: "user_uuid,tenant_id"
      });
      if (error) throw error;
      setConnectedTenantIds(activeTenants.map(t => t.id));
      setConnectAllDialog(false);
      toast({
        title: "Success",
        description: `Connected to ${activeTenants.length} active tenant${activeTenants.length !== 1 ? "s" : ""}`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  if (loading) {
    return <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>;
  }
  return <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Manage Clients</h1>
          <p className="text-muted-foreground">View and manage all client organisations</p>
        </div>
        {(isSuperAdmin || isTeamLeader) && <div className="flex gap-2">
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button onClick={() => setAddTenantDialog(true)} className={isTeamLeader ? "bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"} disabled={isTeamLeader}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Add Client
                    </Button>
                  </span>
                </TooltipTrigger>
                {isTeamLeader && <TooltipContent>
                    <p>Please contact Super Admins.</p>
                  </TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          onClick={() => {
            setStatusFilter("all");
            setSearchQuery("");
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Clients</span>
            <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Organizations registered</p>
        </div>

        <div 
          onClick={() => {
            setStatusFilter("active");
            setSearchQuery("");
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Active</span>
            <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.active}</p>
          <p className="text-xs text-muted-foreground">Currently active clients</p>
        </div>

        <div 
          onClick={() => {
            setStatusFilter("inactive");
            setSearchQuery("");
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Inactive</span>
            <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.inactive}</p>
          <p className="text-xs text-muted-foreground">Deactivated clients</p>
        </div>

        <div 
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Members</span>
            <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.totalMembers}</p>
          <p className="text-xs text-muted-foreground">Across all clients</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clients by name or slug..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-[48px]" />
        </div>

        <Combobox 
          options={[
            { value: "all", label: "All Packages", icon: Package2, iconColor: "text-muted-foreground" },
            ...packages.map(pkg => {
              const isNew = pkg.created_at && new Date().getTime() - new Date(pkg.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
              return {
                value: pkg.id.toString(),
                label: pkg.name,
                badge: isNew ? "NEW" : undefined,
                icon: Package2,
                iconColor: "text-blue-600"
              };
            })
          ]} 
          value={packageFilter} 
          onValueChange={setPackageFilter} 
          placeholder="Filter by package..." 
          searchPlaceholder="Search packages..." 
          emptyText="No packages found." 
          className="w-full md:w-[220px] h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox 
          options={[
            { value: "all", label: "All CSC", icon: Users, iconColor: "text-muted-foreground" },
            ...cscFilterOptions.filter(u => !u.archived).map(csc => ({
              value: csc.user_uuid,
              label: `${csc.first_name} ${csc.last_name}`,
              icon: Users,
              iconColor: "text-primary"
            })),
            ...cscFilterOptions.filter(u => u.archived).map(csc => ({
              value: csc.user_uuid,
              label: `${csc.first_name} ${csc.last_name}`,
              badge: "Archived",
              icon: Archive,
              iconColor: "text-muted-foreground"
            }))
          ]} 
          value={cscFilter} 
          onValueChange={setCscFilter} 
          placeholder="Filter by CSC..." 
          searchPlaceholder="Search CSC..." 
          emptyText="No CSC users found." 
          className="w-full md:w-[220px] h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox 
          options={[
            { value: "all", label: "All Status", icon: Activity, iconColor: "text-muted-foreground" },
            { value: "active", label: "Active", icon: CheckCircle2, iconColor: "text-green-600" },
            { value: "inactive", label: "Inactive", icon: XCircle, iconColor: "text-red-600" }
          ]} 
          value={statusFilter} 
          onValueChange={setStatusFilter} 
          placeholder="Filter by status..." 
          searchPlaceholder="Search filters..." 
          emptyText="No filters found." 
          className="w-full md:w-[220px] h-[48px]"
          showIcons
          showSeparators
        />
      </div>

      {/* Clients Table */}
      {filteredTenants.length === 0 ? <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No clients found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card> : <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 hover:bg-transparent">
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                    Tenant Name
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                    Package
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                    Status
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                    CSC
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                    Members
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                    Risk Level
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                    Created
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((tenant, index) => <TableRow key={tenant.id} className={cn("group transition-all duration-200 cursor-pointer border-b border-border/50", index % 2 === 0 ? "bg-background" : "bg-muted/20", "hover:bg-primary/5 animate-fade-in")} onClick={() => navigate(`/clients/${tenant.id}`)}>
                    <TableCell className="py-6 border-r border-border/50 min-w-[280px] pr-8">
                      <div>
                        <div className="font-semibold text-foreground pb-[10px] whitespace-nowrap">
                          {tenant.name}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(tenant.created_at).toLocaleDateString("en-GB")}
                          </span>
                          <span>{tenant.state || ""}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px] pr-8">
                      <div>
                        <div className="font-semibold text-foreground pb-[10px] whitespace-nowrap">
                          {tenant.package_name === "NA" ? "NA" : tenant.package_name || "NA"}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          <Package2 className="w-3 h-3" />
                          <span>{tenant.package_name === "NA" ? "NA" : tenant.package_full_text || "No Packages Added"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <Badge 
                        variant={tenant.status === "active" ? "default" : "destructive"} 
                        className={tenant.status === "active" 
                          ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
                          : "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
                        }
                      >
                        {tenant.status === "active" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : (
                          <XCircle className="mr-1 h-3 w-3" />
                        )}
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell 
                      className="py-6 border-r border-border/50 whitespace-nowrap"
                      onClick={(e) => {
                        if (isSuperAdmin || isTeamLeader) {
                          e.stopPropagation();
                          setCscAssignDialog({ open: true, tenant });
                        }
                      }}
                    >
                      {tenant.csc_name ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                "flex flex-col items-center gap-1",
                                (isSuperAdmin || isTeamLeader) && "cursor-pointer hover:opacity-80"
                              )}>
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={tenant.csc_avatar || undefined} alt={tenant.csc_name} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {tenant.csc_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                {tenant.csc_archived && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                                    <Archive className="h-2 w-2 mr-0.5" />
                                    Archived
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{tenant.csc_name}</p>
                              {tenant.csc_archived && (
                                <p className="text-xs text-amber-500">This CSC is archived</p>
                              )}
                              {(isSuperAdmin || isTeamLeader) && (
                                <p className="text-xs text-muted-foreground">Click to change</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (isSuperAdmin || isTeamLeader) ? (
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCscAssignDialog({ open: true, tenant });
                            }}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Assign
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <span className="text-sm text-muted-foreground">Not Assigned</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <span className="font-semibold">{tenant.member_count}</span>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <Badge variant="outline" className="capitalize py-[3px] rounded-[9px]">
                        {tenant.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="py-6 px-4 text-center whitespace-nowrap">
                      {connectedTenantIds.includes(tenant.id) ? (
                        <Button 
                          size="sm" 
                          className="border-green-500 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-700 border px-6" 
                          variant="outline" 
                          onClick={e => {
                            e.stopPropagation();
                            handleConnect(tenant);
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Connected
                        </Button>
                      ) : assignedTenants[tenant.id] ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="px-6 border-[rgb(37,99,235)] bg-[rgb(37,99,235)]/10 text-[rgb(37,99,235)] hover:bg-[rgb(37,99,235)]/20 cursor-not-allowed" 
                          disabled
                          title={`Assigned to ${assignedTenants[tenant.id].userName}`}
                        >
                          <LinkIcon className="h-4 w-4 mr-1" />
                          Assigned
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="px-6 hover:bg-[#00c4ff0f] hover:text-black" 
                          onClick={e => {
                            e.stopPropagation();
                            handleConnect(tenant);
                          }} 
                          disabled={!isSuperAdmin && !isTeamLeader}
                        >
                          <LinkIcon className="h-4 w-4 mr-1" />
                          Connect
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
        </div>}

      {/* Pagination */}
      {filteredTenants.length > 0 && <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredTenants.length)}–{Math.min(currentPage * itemsPerPage, filteredTenants.length)} of {filteredTenants.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
              {Array.from({
            length: Math.ceil(filteredTenants.length / itemsPerPage)
          }, (_, i) => i + 1).filter(page => {
            const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
            if (totalPages <= 7) return true;
            if (page === 1 || page === totalPages) return true;
            if (page >= currentPage - 1 && page <= currentPage + 1) return true;
            return false;
          }).map((page, index, array) => {
            if (index > 0 && array[index - 1] !== page - 1) {
              return [<PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-4">...</span>
                      </PaginationItem>, <PaginationItem key={page}>
                        <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                          {page}
                        </PaginationLink>
                      </PaginationItem>];
            }
            return <PaginationItem key={page}>
                      <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                        {page}
                      </PaginationLink>
                    </PaginationItem>;
          })}
              <PaginationItem>
                <PaginationNext onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredTenants.length / itemsPerPage), p + 1))} className={currentPage === Math.ceil(filteredTenants.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>}

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectDialog.open} onOpenChange={open => setDisconnectDialog({
      open,
      tenant: null
    })}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/20">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <AlertDialogTitle className="text-xl">Disconnect Workspace</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              Do you wish to disconnect from{" "}
              <span className="font-semibold text-foreground">"{disconnectDialog.tenant?.name}"</span> workspace?
            </AlertDialogDescription>
            <p className="text-sm text-muted-foreground pt-2">You can reconnect to this workspace at any time.</p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Connect to All Confirmation Dialog */}
      <AlertDialog open={connectAllDialog} onOpenChange={setConnectAllDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/20">
                <LinkIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <AlertDialogTitle className="text-xl">Connect to All Active Tenants</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              Do you wish to connect to all active tenants? This will allow you to access all active tenant workspaces.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConnectToAll} className="bg-primary hover:bg-primary/90">
              Connect to All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Tenant Dialog */}
      <AddTenantDialog open={addTenantDialog} onOpenChange={setAddTenantDialog} onSuccess={fetchTenants} />

      {/* CSC Quick Assign Dialog */}
      {cscAssignDialog.tenant && (
        <CSCQuickAssignDialog
          open={cscAssignDialog.open}
          onOpenChange={(open) => setCscAssignDialog({ open, tenant: open ? cscAssignDialog.tenant : null })}
          tenantId={cscAssignDialog.tenant.id}
          tenantName={cscAssignDialog.tenant.name}
          canRemove={isSuperAdmin}
          onSuccess={fetchTenants}
        />
      )}
    </div>;
}