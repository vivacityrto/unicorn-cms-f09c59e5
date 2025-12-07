import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Package2, Search, Plus, Users, ArrowUpDown, FileText, User, Calendar, Pencil, Edit, Save, X, UserPlus, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
interface PackageWithUsers {
  id: number;
  name: string;
  slug: string | null;
  status: string;
  details: string | null;
  active_clients: number | null;
  all_clients: number | null;
  created_at?: string;
}
interface TenantData {
  id: number;
  name: string;
  status: string;
  created_at: string;
  user_count?: number;
  package_id?: number | null;
  clo_name?: string | null;
  state?: string | null;
  setup?: boolean;
  biz_plan?: boolean;
  tas_ks?: boolean;
  mock_audit?: boolean;
  pv_asqanet_rto?: boolean;
  post_submission?: boolean;
  asqa?: boolean;
  finalise?: boolean;
  latest_note?: {
    text: string;
    addedBy: string;
    dateAdded: string;
  } | null;
  package_added_at?: string | null;
}
export default function ManagePackages() {
  const [packages, setPackages] = useState<PackageWithUsers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantData[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [addTenantSearch, setAddTenantSearch] = useState("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmTenantData, setConfirmTenantData] = useState<{
    tenantId: string;
    packageName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [tenantsByPackage, setTenantsByPackage] = useState<Record<string, TenantData[]>>({});
  const [tenantsLoading, setTenantsLoading] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [sortFields, setSortFields] = useState<Record<string, "name" | "status" | "created_at">>({});
  const [sortDirections, setSortDirections] = useState<Record<string, "asc" | "desc">>({});
  const [cloFilters, setCloFilters] = useState<Record<string, string>>({});
  const [stateFilters, setStateFilters] = useState<Record<string, string>>({});
  const [viewMoreDialogOpen, setViewMoreDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageWithUsers | null>(null);
  const [statusFilters, setStatusFilters] = useState<Record<string, string>>({});

  // All Australian states
  const allAvailableStates = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<{
    text: string;
    addedBy: string;
    dateAdded: string;
    tenantId: number;
  } | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNoteText, setEditedNoteText] = useState("");
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const {
    profile
  } = useAuth();
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  useEffect(() => {
    fetchPackages();
  }, []);
  useEffect(() => {
    if (activeTab) {
      fetchTenantsForPackage(activeTab);
      fetchAvailableTenants();
    }
  }, [activeTab]);
  const fetchPackages = async () => {
    try {
      setLoading(true);
      const {
        data: packagesData,
        error: packagesError
      } = await supabase.from("packages").select("*").in("name", ["KS-RTO", "CHC", "M-RR", "M-RC", "KS-CRI", "M-GC", "ACC", "M-GR", "M-SAR", "M-SAC", "M-DR", "M-DC", "M-AM", "KS-GTO"]);

      // Custom sort order
      const sortOrder = ["KS-RTO", "CHC", "M-RR", "M-RC", "KS-CRI", "M-GC", "ACC", "M-GR", "M-SAR", "M-SAC", "M-DR", "M-DC", "M-AM", "KS-GTO"];
      const sortedPackagesData = packagesData?.sort((a, b) => sortOrder.indexOf(a.name) - sortOrder.indexOf(b.name));
      if (packagesError) throw packagesError;
      const packagesWithCounts = await Promise.all((sortedPackagesData || []).map(async (pkg: any) => {
        const {
          data: stats,
          error: statsError
        } = await supabase.rpc("get_package_stats", {
          p_package_id: pkg.id
        });
        if (statsError) {
          console.error(`Error getting stats for package ${pkg.id}:`, statsError);
        }
        const packageStats = stats?.[0] || {
          all_clients: 0,
          active_clients: 0
        };
        return {
          ...pkg,
          all_clients: Number(packageStats.all_clients) || 0,
          active_clients: Number(packageStats.active_clients) || 0
        };
      }));
      setPackages(packagesWithCounts);
      if (packagesWithCounts.length > 0 && !activeTab) {
        setActiveTab(packagesWithCounts[0].id.toString());
      }
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
  const fetchTenantsForPackage = async (packageId: string) => {
    setTenantsLoading(prev => ({
      ...prev,
      [packageId]: true
    }));
    try {
      // First fetch tenants - check if package is in package_ids array
      const {
        data: tenants,
        error
      } = await supabase.from("tenants").select("*").contains("package_ids", [parseInt(packageId)]).order("name");
      if (error) throw error;
      const tenantsWithCounts = await Promise.all((tenants || []).map(async (tenant: any) => {
        // Get user count
        const {
          count
        } = await supabase.from("users").select("*", {
          count: "exact",
          head: true
        }).eq("tenant_id", tenant.id);

        // Fetch state from clients_legacy
        const {
          data: clientData
        } = await supabase.from("clients_legacy").select("state").eq("tenant_id", tenant.id).limit(1).maybeSingle();

        // Fetch state directly from tenants table if not found in clients_legacy
        const tenantState = clientData?.state || tenant.state;

        // Fetch connected CLO user from connected_tenants
        const {
          data: connectedData
        } = await supabase.from("connected_tenants").select("user_uuid").eq("tenant_id", tenant.id).limit(1).single();
        let cloName = null;
        if (connectedData?.user_uuid) {
          const {
            data: userData
          } = await supabase.from("users").select("first_name, last_name").eq("user_uuid", connectedData.user_uuid).single();
          cloName = userData ? `${userData.first_name} ${userData.last_name}` : null;
        }
        return {
          ...tenant,
          user_count: count || 0,
          clo_name: cloName,
          state: tenantState || null
        };
      }));
      // Add demo data for status columns and latest notes
      const demoNotes = [{
        text: "(11/11/2025 - Last meeting was cancelled. Hopefully will catch up next week to discuss the ongoing compliance issues...",
        addedBy: "Sarah Johnson",
        dateAdded: "2025-11-11"
      }, {
        text: "12/9/2025 Reviewed and signed Variation RSD LPE614 (Validation schedule) and completed initial assessment for new trainer credentials...",
        addedBy: "Michael Chen",
        dateAdded: "2025-12-09"
      }, null];
      setTenantsByPackage(prev => ({
        ...prev,
        [packageId]: tenantsWithCounts.map((tenant, index) => ({
          ...tenant,
          // Demo status data - cycling through patterns
          setup: index % 3 !== 1,
          biz_plan: true,
          tas_ks: true,
          mock_audit: index % 3 !== 0,
          pv_asqanet_rto: index % 3 === 2,
          // Green dot for every third item
          post_submission: index % 3 !== 2,
          asqa: index % 3 === 2,
          // Green dot for every third item
          finalise: true,
          latest_note: demoNotes[index % demoNotes.length]
        }))
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setTenantsLoading(prev => ({
        ...prev,
        [packageId]: false
      }));
    }
  };
  const fetchAvailableTenants = async () => {
    if (!activeTab) return;
    try {
      // Get all tenants, then filter out those that already have this package
      const {
        data,
        error
      } = await supabase.from("tenants").select("id, name, status, created_at, package_id, package_ids").order("name");
      if (error) throw error;
      
      // Filter out tenants that already have this package in their package_ids array
      const filtered = (data || []).filter(tenant => {
        const packageIds = tenant.package_ids || [];
        return !packageIds.includes(parseInt(activeTab));
      });
      
      setAvailableTenants(filtered);
    } catch (error: any) {
      console.error("Error fetching available tenants:", error);
    }
  };
  const handleAddTenant = async () => {
    if (!selectedTenantId) {
      toast({
        title: "Error",
        description: "Please select a tenant",
        variant: "destructive"
      });
      return;
    }
    const selectedTenant = availableTenants.find(t => t.id.toString() === selectedTenantId);
    if (selectedTenant?.package_id) {
      const {
        data: packageData,
        error: packageError
      } = await supabase.from("packages").select("name").eq("id", selectedTenant.package_id).single();
      if (!packageError && packageData) {
        setConfirmTenantData({
          tenantId: selectedTenantId,
          packageName: packageData.name
        });
        setIsConfirmDialogOpen(true);
        return;
      }
    }
    await proceedWithAddTenant(selectedTenantId);
  };
  const proceedWithAddTenant = async (tenantId: string) => {
    if (!activeTab) return;
    try {
      // Use the RPC function to add package to tenant (supports multiple packages)
      const { error } = await supabase.rpc('add_package_to_tenant', {
        p_tenant_id: Number(tenantId),
        p_package_id: Number(activeTab)
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Tenant added to package successfully"
      });
      setShowAddDialog(false);
      setIsConfirmDialogOpen(false);
      setSelectedTenantId("");
      setAddTenantSearch("");
      setConfirmTenantData(null);
      fetchTenantsForPackage(activeTab);
      fetchAvailableTenants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleSaveNote = async () => {
    if (!selectedNote || !editedNoteText.trim()) {
      toast({
        title: "Error",
        description: "Note text cannot be empty",
        variant: "destructive"
      });
      return;
    }
    try {
      // Update the note in the local state
      setTenantsByPackage(prev => {
        const updatedPackages = {
          ...prev
        };
        const packageTenants = updatedPackages[activeTab];
        if (packageTenants) {
          const updatedTenants = packageTenants.map(tenant => {
            if (tenant.id === selectedNote.tenantId) {
              return {
                ...tenant,
                latest_note: {
                  text: editedNoteText.trim(),
                  addedBy: profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : profile?.email || "Unknown",
                  dateAdded: new Date().toISOString()
                }
              };
            }
            return tenant;
          });
          updatedPackages[activeTab] = updatedTenants;
        }
        return updatedPackages;
      });
      toast({
        title: "Success",
        description: "Note updated successfully"
      });
      setIsEditingNote(false);
      setNoteDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const getFilteredAndSortedTenants = (packageId: string) => {
    const tenants = tenantsByPackage[packageId];

    // If tenants haven't been fetched yet, return empty array
    if (!tenants) {
      return [];
    }
    const searchQuery = searchQueries[packageId] || "";
    const sortField = sortFields[packageId] || "name";
    const sortDirection = sortDirections[packageId] || "asc";
    const cloFilter = cloFilters[packageId] || "all";
    const stateFilter = stateFilters[packageId] || "all";
    const statusFilter = statusFilters[packageId] || "all";
    let filtered = [...tenants];
    if (searchQuery) {
      filtered = filtered.filter(tenant => tenant.name?.toLowerCase().includes(searchQuery.toLowerCase()) || tenant.id?.toString().includes(searchQuery));
    }
    if (cloFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.status === cloFilter);
    }
    if (stateFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.state === stateFilter);
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter(tenant => {
        switch (statusFilter) {
          case "completed":
            return tenant.setup && tenant.biz_plan && tenant.tas_ks && tenant.mock_audit && tenant.post_submission && tenant.finalise;
          case "ongoing":
            return tenant.pv_asqanet_rto || tenant.asqa;
          case "incomplete":
            return !tenant.setup || !tenant.biz_plan || !tenant.tas_ks || !tenant.mock_audit || !tenant.post_submission || !tenant.finalise;
          default:
            return true;
        }
      });
    }
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === "created_at") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return filtered;
  };
  const toggleSort = (packageId: string, field: "name" | "status" | "created_at") => {
    const currentField = sortFields[packageId] || "name";
    const currentDirection = sortDirections[packageId] || "asc";
    if (currentField === field) {
      setSortDirections(prev => ({
        ...prev,
        [packageId]: currentDirection === "asc" ? "desc" : "asc"
      }));
    } else {
      setSortFields(prev => ({
        ...prev,
        [packageId]: field
      }));
      setSortDirections(prev => ({
        ...prev,
        [packageId]: "asc"
      }));
    }
  };
  if (loading) {
    return <div className="p-6 space-y-6 animate-fade-in w-full">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>;
  }
  const renderTabContent = (pkg: PackageWithUsers) => {
    const packageId = pkg.id.toString();
    const isLoading = tenantsLoading[packageId] || !tenantsByPackage[packageId];
    const filteredTenants = getFilteredAndSortedTenants(packageId);

    // Get unique CLO names and states for filters
    const allTenants = tenantsByPackage[packageId] || [];
    const activeCount = allTenants.filter(t => t.status === "active").length;
    const inactiveCount = allTenants.filter(t => t.status === "inactive").length;
    const statusOptions = [{
      value: "all",
      label: "All Status"
    }, {
      value: "active",
      label: `Active (${activeCount})`
    }, {
      value: "inactive", 
      label: `Inactive (${inactiveCount})`
    }];
    const stateOptions = [{
      value: "all",
      label: "All States"
    }, ...allAvailableStates.map(state => ({
      value: state,
      label: state
    }))];
    return <div className="space-y-4 animate-fade-in" key={`content-${packageId}`}>
        {/* Filters and Actions */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
            <Input placeholder="Search clients by name..." value={searchQueries[packageId] || ""} onChange={e => setSearchQueries(prev => ({
            ...prev,
            [packageId]: e.target.value
          }))} className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50" />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Combobox options={statusOptions} value={cloFilters[packageId] || "all"} onValueChange={value => setCloFilters(prev => ({
            ...prev,
            [packageId]: value
          }))} placeholder="Filter by Status" searchPlaceholder="Search status or client..." emptyText="No results found." className="w-full md:w-[200px] h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm" />
            <Combobox options={stateOptions} value={stateFilters[packageId] || "all"} onValueChange={value => setStateFilters(prev => ({
            ...prev,
            [packageId]: value
          }))} placeholder="Sort By State" searchPlaceholder="Search State..." emptyText="No states found." className="w-full md:w-[200px] h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm" />
          </div>
        </div>

        {/* Color Legend and Package Details Button */}
        <div className="flex items-center justify-between px-2 py-2 mb-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-muted-foreground">Status Guide:</span>
            <button 
              onClick={() => setStatusFilters(prev => ({ ...prev, [packageId]: prev[packageId] === "completed" ? "all" : "completed" }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-muted/50 ${statusFilters[packageId] === "completed" ? "bg-primary/10 ring-2 ring-primary/30" : ""}`}
            >
              <div className="w-3 h-3 rounded-full bg-[hsl(188_74%_51%)]"></div>
              <span className="text-sm text-foreground">Completed</span>
            </button>
            <button 
              onClick={() => setStatusFilters(prev => ({ ...prev, [packageId]: prev[packageId] === "ongoing" ? "all" : "ongoing" }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-muted/50 ${statusFilters[packageId] === "ongoing" ? "bg-primary/10 ring-2 ring-primary/30" : ""}`}
            >
              <div className="w-3 h-3 rounded-full bg-green-600"></div>
              <span className="text-sm text-foreground">Ongoing</span>
            </button>
            <button 
              onClick={() => setStatusFilters(prev => ({ ...prev, [packageId]: prev[packageId] === "incomplete" ? "all" : "incomplete" }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-muted/50 ${statusFilters[packageId] === "incomplete" ? "bg-primary/10 ring-2 ring-primary/30" : ""}`}
            >
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span className="text-sm text-foreground">Incomplete</span>
            </button>
          </div>
        </div>

        {/* Tenant Table */}
        <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div> : <Table>
                <TableHeader>
                  <TableRow className="border-b-2 hover:bg-transparent">
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                      Client
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                      CLO
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      Setup
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      Biz Plan
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      TAS KS
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      Mock Audit
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      PV & ASQAnet - RTO
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      Post Submission
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      ASQA
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                      Finalise
                    </TableHead>
                    <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">
                      Latest Note
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.length === 0 ? <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Users className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">No tenants found</p>
                          <p className="text-sm text-muted-foreground">
                            {stateFilters[packageId] && stateFilters[packageId] !== "all" ? `No tenants found in ${stateFilters[packageId]}` : searchQueries[packageId] || cloFilters[packageId] !== "all" ? "Try adjusting your filters" : "No tenants in this package yet"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow> : filteredTenants.map((tenant, index) => <TableRow key={tenant.id} className={`group transition-all duration-200 cursor-pointer border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 animate-fade-in`} onClick={() => navigate(`/tenant/${tenant.id}`)}>
                        <TableCell className="py-6 border-r border-border/50 min-w-[280px] pr-8">
                          <div>
                            <div className="font-semibold text-foreground pb-[10px] whitespace-nowrap">
                              {tenant.name}
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(tenant.package_added_at || tenant.created_at).toLocaleDateString("en-GB")}
                              </span>
                              <span>{tenant.state || ""}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 border-r border-border/50 min-w-[200px] pr-8">
                          <div>
                            <div className="font-medium text-foreground pb-[10px] whitespace-nowrap">
                              {tenant.clo_name || "-"}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 whitespace-nowrap">
                              <Calendar className="w-3 h-3" />
                              {new Date().toLocaleDateString("en-GB")}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[100px] ${tenant.setup ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.setup ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[100px] ${tenant.biz_plan ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.biz_plan ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[100px] ${tenant.tas_ks ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.tas_ks ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[120px] ${tenant.mock_audit ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.mock_audit ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[160px] ${tenant.pv_asqanet_rto ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                          {tenant.pv_asqanet_rto && <div className="flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-green-600"></div>
                            </div>}
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[140px] ${tenant.post_submission ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.post_submission ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[100px] ${tenant.asqa ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                          {tenant.asqa && <div className="flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-green-600"></div>
                            </div>}
                        </TableCell>
                        <TableCell className={`py-6 border-r border-border/50 text-center min-w-[100px] ${tenant.finalise ? "bg-[hsl(188_74%_51%_/_0.1)]" : "bg-red-50 dark:bg-red-950/20"}`}>
                          <div className="flex items-center justify-center">
                            <div className={`w-3 h-3 rounded-full ${tenant.finalise ? "bg-[hsl(188_74%_51%)]" : "bg-red-600"}`}></div>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 text-sm min-w-[160px]">
                          {tenant.latest_note ? <div className="flex justify-start">
                              <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium border-muted-foreground/20 hover:bg-white hover:text-black hover:border-muted-foreground/20 rounded-[13px]" style={{
                      color: "hsl(240deg 13.67% 14.68%)"
                    }} onClick={e => {
                      e.stopPropagation();
                      if (tenant.latest_note) {
                        setSelectedNote({
                          ...tenant.latest_note,
                          tenantId: tenant.id
                        });
                        setEditedNoteText(tenant.latest_note.text);
                      }
                      setIsEditingNote(false);
                      setNoteDialogOpen(true);
                    }}>
                                <FileText className="h-3.5 w-3.5" />
                                View Note
                              </Button>
                            </div> : <div className="text-muted-foreground">-</div>}
                        </TableCell>
                      </TableRow>)}
                </TableBody>
              </Table>}
          </div>
        </div>
      </div>;
  };
  const tabs = packages.map(pkg => ({
    value: pkg.id.toString(),
    label: pkg.name,
    details: pkg.details || undefined,
    content: null as any // Content will be rendered separately
  }));
  const activePackage = packages.find(pkg => pkg.id.toString() === activeTab);
  return <div className="space-y-6 p-6 animate-fade-in w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Dashboard</h1>
          <p className="text-muted-foreground">View and manage client's packages</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button onClick={() => setShowAddDialog(true)} className={isTeamLeader ? "bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"} disabled={isTeamLeader}>
                  <Plus className="h-4 w-4 mr-2" />
                  Setup Client
                </Button>
              </span>
            </TooltipTrigger>
            {isTeamLeader && <TooltipContent>
                <p>Please contact Super Admins.</p>
              </TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Package Tabs Carousel */}
      {packages.length === 0 ? <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No packages found</p>
            <p className="text-sm text-muted-foreground">Get started by adding your first package</p>
          </CardContent>
        </Card> : <>
          <div className="relative">
            <Carousel className="w-full">
              <CarouselContent className="-ml-2">
                {packages.map(pkg => <CarouselItem key={pkg.id} className="pl-2 basis-auto">
                    <div className="group relative flex flex-col items-center gap-2">
                      <div className="relative">
                        <button className="opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all duration-300 ease-out text-xs px-4 py-2 rounded-lg bg-card text-card-foreground font-medium shadow-lg hover:shadow-xl border border-border relative before:content-[''] before:absolute before:bottom-[-6px] before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-card before:opacity-0 before:group-hover:opacity-100 before:transition-opacity before:duration-300" onClick={e => {
                    e.stopPropagation();
                    setSelectedPackage(pkg);
                    setViewMoreDialogOpen(true);
                  }}>
                          View More
                        </button>
                      </div>
                      <button onClick={() => setActiveTab(pkg.id.toString())} className={cn("relative items-center justify-center rounded-lg border transition-all duration-300", "px-3 py-3 min-w-[110px]", "text-sm font-semibold whitespace-nowrap shadow-sm", activeTab === pkg.id.toString() ? "text-primary bg-primary/10 border-primary" : "text-muted-foreground bg-background border-border hover:text-foreground hover:bg-muted/50 hover:border-border")}>
                        {pkg.name}
                      </button>
                    </div>
                  </CarouselItem>)}
              </CarouselContent>
              <CarouselPrevious className="-left-4 -mt-[30px] ml-[10px]" />
              <CarouselNext className="absolute -right-4 -mt-[30px] mr-[10px]" />
            </Carousel>
          </div>
          {activePackage && renderTabContent(activePackage)}
        </>}

      {/* View More Dialog */}
      <Dialog open={viewMoreDialogOpen} onOpenChange={setViewMoreDialogOpen}>
        <DialogContent className="w-[520px] max-w-[90vw] bg-gradient-to-br from-background to-muted/20 border-[3px] border-[#dfdfdf]">
          <DialogHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                
                {selectedPackage?.name}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground m-0 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Package Details
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="mt-6 space-y-6 max-h-[60vh] overflow-y-auto pr-2">
            {selectedPackage && selectedPackage.details ? <div className="space-y-4">
                {(() => {
              const details = selectedPackage.details || "";
              const parts = details.split("Membership gives them ");
              const description = parts[0].trim();
              const includes = parts[1] || "";
              return <>
                      <div className="p-4 rounded-lg border border-border/50" style={{
                  backgroundColor: "#3b82f60d"
                }}>
                        <p className="text-sm text-foreground whitespace-pre-wrap" style={{
                    lineHeight: "25px"
                  }}>
                          {description}
                        </p>
                      </div>

                      {includes && <div className="space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/30"></div>
                          <div className="grid gap-3" style={{
                    paddingLeft: "5px"
                  }}>
                            {(() => {
                      const text = includes;
                      const items: string[] = [];
                      const hoursMatch = text.match(/(\d+)\s*hours/i);
                      if (hoursMatch) {
                        items.push(`${hoursMatch[1]} hours of Vivacity support (valid for 12 months)`);
                      }
                      if (text.toLowerCase().includes("consult time") || text.toLowerCase().includes("client success champion")) {
                        items.push("Consult time with a Client Success Champion");
                      }
                      if (text.toLowerCase().includes("viv training")) {
                        items.push("Access to VIV Training");
                      }
                      if (text.toLowerCase().includes("unicorn docs")) {
                        items.push("Access to all UNICORN documents");
                      }
                      return items.map((item, i) => <div key={i} className="flex items-start gap-3">
                                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                  <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
                                </div>);
                    })()}
                          </div>
                        </div>}
                    </>;
            })()}
              </div> : <div className="p-4 text-center text-sm text-muted-foreground">
                No details available for this package.
              </div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tenant Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="border-[3px] border-[#dfdfdf]" style={{
        width: "650px",
        maxWidth: "90vw"
      }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Client to Package
            </DialogTitle>
            <DialogDescription>Search and select a Client to add to this package</DialogDescription>
          </DialogHeader>

          <div className="space-y-4" style={{ width: "82%" }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search Client by name or ID..." value={addTenantSearch} onChange={e => setAddTenantSearch(e.target.value)} className="pl-10 w-full" />
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                {availableTenants.filter(tenant => addTenantSearch === "" || tenant.name.toLowerCase().includes(addTenantSearch.toLowerCase()) || tenant.id.toString().includes(addTenantSearch)).map(tenant => <div key={tenant.id} onClick={() => setSelectedTenantId(tenant.id.toString())} className={cn("p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-b-0", selectedTenantId === tenant.id.toString() && "bg-primary/10 hover:bg-primary/15")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{tenant.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            ID: {tenant.id} • Status: {tenant.status}
                            {tenant.package_id && ` • Currently in package #${tenant.package_id}`}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs shrink-0", tenant.status === "active" ? "border-green-500 text-green-600" : "border-muted text-muted-foreground")}>
                          {tenant.status}
                        </Badge>
                      </div>
                    </div>)}

                {availableTenants.filter(tenant => addTenantSearch === "" || tenant.name.toLowerCase().includes(addTenantSearch.toLowerCase()) || tenant.id.toString().includes(addTenantSearch)).length === 0 && <div className="p-8 text-center text-muted-foreground">
                    {addTenantSearch ? "No tenants match your search" : "No available tenants found"}
                  </div>}
              </div>
            </div>
          </div>

          <DialogFooter style={{ width: "82%" }}>
            <Button variant="outline" onClick={() => {
            setShowAddDialog(false);
            setSelectedTenantId("");
            setAddTenantSearch("");
          }}>
              Cancel
            </Button>
            <Button onClick={handleAddTenant} disabled={!selectedTenantId}>
              Setup Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="mt-[12px]">Add Tenant to Package</DialogTitle>
            <DialogDescription className="pt-[30px]">
              This tenant is already linked to <strong>{confirmTenantData?.packageName}</strong>. 
              The tenant will be added to this package as well.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
            setIsConfirmDialogOpen(false);
            setConfirmTenantData(null);
          }}>
              Cancel
            </Button>
            <Button onClick={() => {
            if (confirmTenantData) {
              proceedWithAddTenant(confirmTenantData.tenantId);
            }
          }}>
              Add to Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader className="relative">
            <div className="absolute right-0 top-0 flex items-center gap-1.5 text-sm text-muted-foreground">
              {selectedNote && <>
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(selectedNote.dateAdded).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
              })}
                </>}
            </div>
            <DialogTitle className="flex items-center gap-2">
              {selectedNote && <>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-normal">Created by: {selectedNote.addedBy}</span>
                </>}
            </DialogTitle>
            <DialogDescription className="sr-only">Note details</DialogDescription>
          </DialogHeader>

          {selectedNote && <div className="space-y-6 py-2">
              {/* Metadata Section */}

              {/* Separator */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Note Content</span>
                </div>
              </div>

              {/* Note Content */}
              <div className="space-y-4">
                {isEditingNote ? <Textarea value={editedNoteText} onChange={e => setEditedNoteText(e.target.value)} className="min-h-[120px] p-4 rounded-lg border border-border/50 bg-white text-sm leading-relaxed resize-none" placeholder="Enter note content..." /> : <div className="p-4 rounded-lg border border-border/50 min-h-[120px]" style={{
              backgroundColor: "#3b82f60d"
            }}>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedNote.text}</p>
                  </div>}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2">
                  {!isEditingNote ? <>
                      <Button variant="outline" size="sm" className="h-8 font-normal border-muted-foreground/20 hover:bg-white hover:text-black hover:border-muted-foreground/20 rounded-[13px]" style={{
                  color: "hsl(240deg 13.67% 14.68%)"
                }} onClick={() => {
                  setIsEditingNote(true);
                  setEditedNoteText(selectedNote.text);
                }}>
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <div />
                    </> : <>
                      <div />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 font-normal border-muted-foreground/20 hover:bg-white hover:text-black hover:border-muted-foreground/20 rounded-[13px]" style={{
                    color: "hsl(240deg 13.67% 14.68%)"
                  }} onClick={() => {
                    setIsEditingNote(false);
                    setEditedNoteText(selectedNote.text);
                  }}>
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                        <Button size="sm" className="h-8 font-normal rounded-[13px]" onClick={handleSaveNote}>
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </Button>
                      </div>
                    </>}
                </div>
              </div>
            </div>}
        </DialogContent>
      </Dialog>
    </div>;
}