import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Mail, XCircle, Users, Search, RefreshCw, AlertCircle, Filter, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import ReInviteDialog from "@/components/admin/ReInviteDialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

type InviteRow = {
  id: string;
  created_at: string;
  email: string;
  tenant_id: number;
  unicorn_role: string;
  status: 'pending' | 'expired' | 'failed' | 'sent' | 'successful';
  error_message?: string | null;
  invited_by?: string | null;
  expires_at?: string | null;
};

type UserStatus = {
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  unicorn_role: string | null;
  user_type: string | null;
  last_sign_in_at: string | null;
};

export default function ManageInvites() {
  const { toast } = useToast();
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [userStatuses, setUserStatuses] = useState<Map<string, UserStatus>>(new Map());
  const [tenantNames, setTenantNames] = useState<Map<number, string>>(new Map());
  const [inviterNames, setInviterNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [reInviteDialogOpen, setReInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(new Set());
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const { profile } = useAuth();
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';

  const fetchInvites = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("user_invitations")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setInvites(data as InviteRow[] || []);

      // Fetch tenant names, user statuses, and inviter names
      if (data && data.length > 0) {
        const emails = [...new Set(data.map(d => d.email))];
        const tenantIds = [...new Set(data.map(d => d.tenant_id))];
        const inviterIds = [...new Set(data.map(d => d.invited_by).filter(Boolean) as string[])];
        
        await Promise.all([
          fetchUserStatuses(emails),
          fetchTenantNames(tenantIds),
          fetchInviterNames(inviterIds)
        ]);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load invite data");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStatuses = async (emails: string[]) => {
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('email, user_uuid, created_at, unicorn_role, user_type')
        .in('email', emails);
      
      if (usersError) throw usersError;

      // Fetch last_sign_in_at from auth.users
      const authUserMap = new Map<string, string | null>();
      try {
        const { data: authData } = await supabase.auth.admin.listUsers();
        if (authData?.users) {
          authData.users.forEach((authUser: any) => {
            if (authUser.email) {
              authUserMap.set(authUser.email, authUser.last_sign_in_at || null);
            }
          });
        }
      } catch (authError) {
        console.error("Failed to fetch auth users:", authError);
      }

      const statusMap = new Map<string, UserStatus>();
      usersData?.forEach(user => {
        statusMap.set(user.email, {
          email: user.email,
          email_confirmed_at: user.created_at,
          created_at: user.created_at,
          unicorn_role: user.unicorn_role,
          user_type: user.user_type,
          last_sign_in_at: authUserMap.get(user.email) || null
        });
      });

      setUserStatuses(statusMap);
    } catch (e: any) {
      console.error("Failed to fetch user statuses:", e);
    }
  };

  const fetchTenantNames = async (tenantIds: number[]) => {
    try {
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      
      if (tenantsError) throw tenantsError;

      const namesMap = new Map<number, string>();
      tenantsData?.forEach(tenant => {
        namesMap.set(tenant.id, tenant.name);
      });

      setTenantNames(namesMap);
    } catch (e: any) {
      console.error("Failed to fetch tenant names:", e);
    }
  };

  const fetchInviterNames = async (inviterIds: string[]) => {
    if (inviterIds.length === 0) return;
    
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', inviterIds);
      
      if (usersError) throw usersError;

      const namesMap = new Map<string, string>();
      usersData?.forEach(user => {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
        namesMap.set(user.user_uuid, fullName);
      });

      setInviterNames(namesMap);
    } catch (e: any) {
      console.error("Failed to fetch inviter names:", e);
    }
  };

  useEffect(() => {
    fetchInvites();

    // Set up real-time subscription
    const channel = supabase
      .channel("invite-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_invitations",
        },
        () => {
          fetchInvites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: string, expiresAt?: string | null) => {
    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    
    if (isExpired && status === 'pending') {
      return {
        variant: 'destructive' as const,
        icon: AlertCircle,
        label: 'Expired',
        color: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
      };
    }

    switch (status) {
      case 'successful':
        return {
          variant: 'default' as const,
          icon: CheckCircle,
          label: 'Complete',
          color: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
        };
      case 'sent':
        return {
          variant: 'default' as const,
          icon: CheckCircle,
          label: 'Sent',
          color: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600'
        };
      case 'pending':
        return {
          variant: 'default' as const,
          icon: Clock,
          label: 'Pending',
          color: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
        };
      case 'expired':
        return {
          variant: 'destructive' as const,
          icon: AlertCircle,
          label: 'Expired',
          color: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
        };
      case 'failed':
        return {
          variant: 'destructive' as const,
          icon: XCircle,
          label: 'Failed',
          color: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600'
        };
      default:
        return {
          variant: 'outline' as const,
          icon: Clock,
          label: status,
          color: 'text-muted-foreground'
        };
    }
  };

  const getTimeRemaining = (createdAt: string): { hours: number; label: string; variant: 'default' | 'destructive' } => {
    const created = new Date(createdAt);
    const expiresAt = new Date(created.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    const now = new Date();
    const remaining = expiresAt.getTime() - now.getTime();
    
    if (remaining <= 0) {
      return { hours: 0, label: 'Expired', variant: 'destructive' };
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    const variant = hours > 6 ? 'default' : 'destructive';
    
    return { hours, label, variant };
  };

  const labelForRole = (r: string) => {
    // The role is now already in the correct format (unicorn_role)
    return r;
  };

  const getUserTypeBadgeVariant = (userType: string | null) => {
    if (!userType) return 'outline';
    switch (userType) {
      case 'Vivacity Team':
        return 'default';
      case 'Client Parent':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Calculate stats based on actual status badge logic to match table display
  const stats = {
    total: invites.length,
    pending: invites.filter(i => {
      const isExpired = i.expires_at && new Date(i.expires_at) < new Date();
      // Pending = status is 'pending' and NOT expired
      return i.status === 'pending' && !isExpired;
    }).length,
    expired: invites.filter(i => {
      const isExpired = i.expires_at && new Date(i.expires_at) < new Date();
      // Expired = status is 'expired' OR (status is 'pending' AND past expiry)
      return i.status === 'expired' || (isExpired && i.status === 'pending');
    }).length,
    verified: invites.filter(i => {
      // Verified = status is 'successful' (complete)
      return i.status === 'successful';
    }).length,
  };

  const getDateFilterLabel = () => {
    switch (dateFilter) {
      case "this-week": return "This Week";
      case "last-month": return "Last Month";
      case "last-6-months": return "Last 6 Months";
      default: return "All Time";
    }
  };

  // Date filter helper
  const isWithinDateRange = (date: string) => {
    const inviteDate = new Date(date);
    const now = new Date();
    
    switch (dateFilter) {
      case "this-week": {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return inviteDate >= weekAgo;
      }
      case "last-month": {
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        return inviteDate >= monthAgo;
      }
      case "last-6-months": {
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        return inviteDate >= sixMonthsAgo;
      }
      default:
        return true;
    }
  };

  // Filter invites
  const filteredInvites = invites.filter(invite => {
    const matchesSearch = invite.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenantNames.get(invite.tenant_id)?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "sent" && invite.status === "sent") ||
      (statusFilter === "failed" && invite.status === "failed") ||
      (statusFilter === "expired" && (invite.status === "expired" || isExpired)) ||
      (statusFilter === "verified" && invite.status === "sent" && userStatuses.get(invite.email)?.email_confirmed_at) ||
      (statusFilter === "pending" && (invite.status === "pending" || (invite.status === "sent" && !userStatuses.get(invite.email)?.email_confirmed_at)));
    
    const matchesDate = isWithinDateRange(invite.created_at);
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const toggleSelectAll = () => {
    if (selectedInvites.size === filteredInvites.length) {
      setSelectedInvites(new Set());
    } else {
      setSelectedInvites(new Set(filteredInvites.map(i => i.id)));
    }
  };

  const toggleSelectInvite = (inviteId: string) => {
    const newSelected = new Set(selectedInvites);
    if (newSelected.has(inviteId)) {
      newSelected.delete(inviteId);
    } else {
      newSelected.add(inviteId);
    }
    setSelectedInvites(newSelected);
  };

  const handleRowClick = (inviteId: string, e: React.MouseEvent) => {
    // Don't toggle if clicking on a checkbox, button, or badge
    const target = e.target as HTMLElement;
    if (
      target.closest('input[type="checkbox"]') ||
      target.closest('button') ||
      target.closest('.badge-container')
    ) {
      return;
    }
    toggleSelectInvite(inviteId);
  };

  // Get unique visible emails and tenants for re-invite dialog
  const visibleEmails = [...new Set(filteredInvites.map(i => i.email))];
  const visibleTenants = [...new Set(filteredInvites.map(i => i.tenant_id))]
    .map(id => ({ id, name: tenantNames.get(id) || `ID: ${id}` }));

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-12 w-full" />
          <div className="grid gap-6 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
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
            <h1 className="text-[28px] font-bold tracking-tight">Manage Invites</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage user invitation status
            </p>
          </div>
          
          <div className="flex gap-2">
            {selectedInvites.size > 0 && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button 
                          onClick={() => setDeleteDialogOpen(true)}
                          className={isTeamLeader ? "gap-2 bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                          variant={isTeamLeader ? "default" : "destructive"}
                          disabled={isTeamLeader}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete ({selectedInvites.size})
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
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button 
                          onClick={() => setReInviteDialogOpen(true)}
                          className={isTeamLeader ? "gap-2 bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "gap-2"}
                          variant="default"
                          disabled={isTeamLeader}
                          style={{ display: selectedInvites.size > 0 ? 'none' : 'inline-flex' }}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Re-invite ({selectedInvites.size})
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
              </>
            )}
            
            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {getDateFilterLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="end">
                <div>
                  
                  <div className="space-y-0">
                    {[
                      { value: "all", label: "All Time" },
                      { value: "this-week", label: "This Week" },
                      { value: "last-month", label: "Last Month" },
                      { value: "last-6-months", label: "Last 6 Months" },
                    ].map((option, index, array) => (
                      <div key={option.value}>
                        <button
                          onClick={() => {
                            setDateFilter(option.value);
                            setFilterPopoverOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 transition-colors text-[15px] rounded-[10px] ${
                            dateFilter === option.value
                              ? "border-0 bg-[hsl(275,54%,41%)]/10 text-[hsl(275,54%,41%)]"
                              : "hover:bg-muted border border-transparent"
                          }`}
                        >
                          {option.label}
                        </button>
                        {index < array.length - 1 && (
                          <div className="h-px bg-border my-1" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" onClick={() => {
            setStatusFilter("all");
            setSearchTerm("");
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Invites</CardTitle>
              <Mail className="h-[22px] w-[22px] text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All invitation attempts
              </p>
            </CardContent>
          </Card>

          <Card className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" style={{ animationDelay: '50ms' }} onClick={() => {
            setStatusFilter("pending");
            setSearchTerm("");
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-[22px] w-[22px] text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">
                Not yet accepted
              </p>
            </CardContent>
          </Card>

          <Card className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" style={{ animationDelay: '100ms' }} onClick={() => {
            setStatusFilter("expired");
            setSearchTerm("");
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <AlertCircle className="h-[22px] w-[22px] text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expired}</div>
              <p className="text-xs text-muted-foreground">
                Past 24-hour window
              </p>
            </CardContent>
          </Card>

          <Card className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" style={{ animationDelay: '150ms' }} onClick={() => {
            setStatusFilter("verified");
            setSearchTerm("");
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <CheckCircle className="h-[22px] w-[22px] text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.verified}</div>
              <p className="text-xs text-muted-foreground">
                Successfully verified
              </p>
            </CardContent>
          </Card>

        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or tenant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              style={{ height: '48px' }}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full md:w-[180px] h-12 bg-background justify-between">
                <span>
                  {statusFilter === "all" && "All Statuses"}
                  {statusFilter === "pending" && "Pending"}
                  {statusFilter === "sent" && "Sent"}
                  {statusFilter === "expired" && "Expired"}
                  {statusFilter === "verified" && "Verified"}
                  {statusFilter === "failed" && "Failed"}
                </span>
                <Filter className="h-4 w-4 ml-2 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <div className="p-2">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search filters..."
                    className="pl-9 h-9"
                  />
                </div>
                <div className="space-y-0">
                  {[
                    { value: "all", label: "All Statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "sent", label: "Sent" },
                    { value: "expired", label: "Expired" },
                    { value: "verified", label: "Verified" },
                    { value: "failed", label: "Failed" },
                  ].map((option, index, array) => (
                    <div key={option.value}>
                      <button
                        onClick={() => setStatusFilter(option.value)}
                        className={`w-full text-left px-3 py-2 transition-colors text-[15px] rounded-[10px] ${
                          statusFilter === option.value
                            ? "bg-[hsl(196,100%,93.53%)] text-black"
                            : "hover:bg-[hsl(196,100%,93.53%)] hover:text-black"
                        }`}
                      >
                        {option.label}
                      </button>
                      {index < array.length - 1 && (
                        <div className="h-px bg-border my-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Invites Table */}
        <div className="rounded-lg border-0 bg-card shadow-lg overflow-hidden">
          {error ? (
            <div className="p-6">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <p>{error}</p>
              </div>
            </div>
          ) : filteredInvites.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground whitespace-nowrap">
                {searchTerm || statusFilter !== "all" ? "No invites match your filters." : "No invites found."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 hover:bg-transparent">
                  <TableHead className="w-12 bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                    <Checkbox
                      checked={selectedInvites.size === filteredInvites.length && filteredInvites.length > 0}
                      onCheckedChange={toggleSelectAll}
                      className="!border-[hsl(0deg_0%_43.45%)] !rounded-[5px]"
                    />
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Date</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Time</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Email</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Tenant (RTO)</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Role</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Status</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap">Invited By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvites.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((invite) => {
                  const tenantName = tenantNames.get(invite.tenant_id) || `ID: ${invite.tenant_id}`;
                  const userStatus = userStatuses.get(invite.email);
                  // If user exists in users table, they've successfully signed up - show Verified
                  const isVerified = !!userStatus;
                  const statusBadge = isVerified 
                    ? { variant: 'default' as const, icon: CheckCircle, label: 'Verified', color: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]' }
                    : getStatusBadge(invite.status, invite.expires_at);
                  const StatusBadgeIcon = statusBadge.icon;
                  const createdDate = new Date(invite.created_at);
                  const timeRemaining = getTimeRemaining(invite.created_at);

                  return (
                    <TableRow 
                      key={invite.id}
                      className="group hover:bg-primary/5 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20 animate-fade-in"
                      onClick={(e) => handleRowClick(invite.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()} className="py-6 border-r border-border/50">
                        <Checkbox
                          checked={selectedInvites.has(invite.id)}
                          onCheckedChange={() => toggleSelectInvite(invite.id)}
                          className="!border-[hsl(0deg_0%_43.45%)] !rounded-[5px]"
                        />
                      </TableCell>
                      <TableCell className="text-sm text-foreground font-medium py-6 border-r border-border/50">
                        {createdDate.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-foreground font-medium py-6 border-r border-border/50">
                        {createdDate.toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-6 border-r border-border/50">{invite.email}</TableCell>
                      <TableCell className="py-6 border-r border-border/50">
                        <div className="max-w-[200px] truncate text-sm text-muted-foreground" title={tenantName}>
                          {tenantName}
                        </div>
                      </TableCell>
                      <TableCell className="py-6 border-r border-border/50">
                        <Badge variant="outline" className="text-xs">
                          {userStatus?.unicorn_role || labelForRole(invite.unicorn_role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-6 border-r border-border/50">
                        <div className="badge-container">
                          <Badge variant={statusBadge.variant} className={statusBadge.color}>
                            <StatusBadgeIcon className="mr-1 h-3 w-3" />
                            {statusBadge.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground py-6">
                        {invite.invited_by ? (
                          inviterNames.get(invite.invited_by) || 'Loading...'
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {filteredInvites.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredInvites.length)}–{Math.min(currentPage * itemsPerPage, filteredInvites.length)} of {filteredInvites.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.ceil(filteredInvites.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredInvites.length / itemsPerPage);
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
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredInvites.length / itemsPerPage), p + 1))}
                  className={currentPage === Math.ceil(filteredInvites.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <ReInviteDialog
        open={reInviteDialogOpen}
        onOpenChange={setReInviteDialogOpen}
        availableEmails={visibleEmails}
        availableTenants={visibleTenants}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-[3px] border-[#dfdfdf]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invitations</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedInvites.size} invitation(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  console.log('Attempting to delete invitations:', Array.from(selectedInvites));
                  
                  const { data, error } = await supabase
                    .from('user_invitations')
                    .delete()
                    .in('id', Array.from(selectedInvites))
                    .select();
                  
                  console.log('Delete response:', { data, error });
                  
                  if (error) {
                    console.error('Delete error:', error);
                    throw error;
                  }
                  
                  toast({
                    title: "Success",
                    description: `Successfully deleted ${selectedInvites.size} invitation(s)`,
                  });
                  
                  setSelectedInvites(new Set());
                  setDeleteDialogOpen(false);
                  await fetchInvites();
                } catch (e: any) {
                  console.error('Failed to delete invitations:', e);
                  toast({
                    title: "Error",
                    description: `Failed to delete invitations: ${e.message}`,
                    variant: "destructive",
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
