import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Plus, Search, Filter, ArrowUpDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// Mock data for clients
const clientTabs = [
  {
    code: "KS-RTO",
    name: "Kickstart RTO",
  },
  {
    code: "CMC",
    name: "CMC Training",
  },
  {
    code: "M-RR",
    name: "Metro Regional",
  },
  {
    code: "M-RC",
    name: "Metro Central",
  },
  {
    code: "KS-CRI",
    name: "Kickstart CRI",
  },
  {
    code: "M-GC",
    name: "Metro Gold Coast",
  },
  {
    code: "ACC",
    name: "Academy",
  },
  {
    code: "M-GR",
    name: "Metro Greater",
  },
  {
    code: "M-DR",
    name: "Metro Darwin",
  },
  {
    code: "M-SAR",
    name: "Metro South Australia",
  },
  {
    code: "M-SAC",
    name: "Metro South",
  },
  {
    code: "M-AM",
    name: "Metro AM",
  },
  {
    code: "KS-GTO",
    name: "Kickstart GTO",
  },
];
const stages = [
  {
    key: "setup",
    label: "Setup",
  },
  {
    key: "biz_plan",
    label: "Biz Plan",
  },
  {
    key: "tas_ks",
    label: "7A$ KS",
  },
  {
    key: "mock_audit",
    label: "Mock Audit",
  },
  {
    key: "pv_asqa",
    label: "PV & ASQAnet - RTO",
  },
  {
    key: "post_sub",
    label: "Post Submission",
  },
  {
    key: "asqa",
    label: "ASQA",
  },
  {
    key: "finalise",
    label: "Finalise",
  },
];

// Mock client data with stages
const mockClients = {
  "KS-RTO": [
    {
      id: "1",
      name: "Altaira Education",
      contact: "James Riro",
      abn: "11906024259",
      date: "2025-04-11",
      daysRemaining: 7,
      clo: "Sharwari",
      state: "QLD",
      stages: {
        setup: "complete",
        biz_plan: "complete",
        tas_ks: "complete",
        mock_audit: "complete",
        pv_asqa: "complete",
        post_sub: "complete",
        asqa: "complete",
        finalise: "complete",
      },
      latestNote:
        "(11/11/2025 - Last meeting was cancelled. Hopefully will catch up soon and see how things are going, not sure of progress. Review (11/11/2025 2:12 PM)",
    },
    {
      id: "2",
      name: "Brisbane Safe Work Training Pty Ltd",
      contact: "Adam",
      abn: "20210207",
      date: "2025-03-20",
      daysRemaining: 1,
      clo: "Michael",
      state: "NSW",
      status: "Hold",
      stages: {
        setup: "complete",
        biz_plan: "complete",
        tas_ks: "complete",
        mock_audit: "complete",
        pv_asqa: "complete",
        post_sub: "complete",
        asqa: "complete",
        finalise: "complete",
      },
      latestNote:
        "12/9/2025 Reviewed and signed Variation RSD LPE614 (Validation of effectiveness RSD LPE613 (ABC 1234)",
    },
    {
      id: "3",
      name: "Evolve Learning Institute",
      contact: "Adam Davies",
      abn: "20410307",
      date: "2025-05-15",
      daysRemaining: 42,
      clo: "Sarah",
      state: "VIC",
      stages: {
        setup: "complete",
        biz_plan: "complete",
        tas_ks: "complete",
        mock_audit: "complete",
        pv_asqa: "in-progress",
        post_sub: "complete",
        asqa: "in-progress",
        finalise: "complete",
      },
      latestNote: "",
    },
  ],
  CMC: [
    {
      id: "4",
      name: "CMC Learning Solutions",
      contact: "Sarah Johnson",
      abn: "33445566778",
      date: "2025-06-01",
      daysRemaining: 60,
      clo: "David",
      state: "WA",
      stages: {
        setup: "complete",
        biz_plan: "complete",
        tas_ks: "in-progress",
        mock_audit: "pending",
        pv_asqa: "pending",
        post_sub: "pending",
        asqa: "pending",
        finalise: "pending",
      },
      latestNote: "Meeting scheduled for next week to review progress",
    },
  ],
  "M-RR": [],
  "M-RC": [],
  "KS-CRI": [],
  "M-GC": [],
  ACC: [],
  "M-GR": [],
  "M-DR": [],
  "M-SAR": [],
  "M-SAC": [],
  "M-AM": [],
  "KS-GTO": [],
};
const Dashboard = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const isSuperAdmin = profile?.unicorn_role === "Super Admin";
  const isTeamLeader = profile?.unicorn_role === "Team Leader";

  // Fetch tenant info to get package_id
  const { data: tenant } = useQuery({
    queryKey: ["tenant", profile?.tenant_id],
    queryFn: async () => {
      if (!profile?.tenant_id) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("*, packages(id, name, slug)")
        .eq("id", profile.tenant_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch packages based on user role
  const { data: packages, isLoading: packagesLoading } = useQuery({
    queryKey: ["packages", tenant?.package_id, isSuperAdmin],
    queryFn: async () => {
      const query = supabase.from("packages").select("*").eq("status", "active");
      
      // If not super admin, only show the tenant's package
      if (!isSuperAdmin && tenant?.package_id) {
        query.eq("id", tenant.package_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin || !!tenant?.package_id,
  });

  // Set initial active tab when packages load
  useEffect(() => {
    if (packages && packages.length > 0 && !activeTab) {
      setActiveTab(packages[0].slug || packages[0].id.toString());
    }
  }, [packages, activeTab]);

  // Fetch clients for the active package
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", activeTab, packages],
    queryFn: async () => {
      if (!activeTab || !packages) return [];
      
      // Find the package by slug or id
      const currentPackage = packages.find(
        (pkg) => pkg.slug === activeTab || pkg.id.toString() === activeTab
      );
      
      if (!currentPackage) return [];

      // Get all tenants for this package (check package_ids array)
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select("id")
        .contains("package_ids", [currentPackage.id]);

      if (tenantsError) throw tenantsError;
      if (!tenants || tenants.length === 0) return [];

      const tenantIds = tenants.map((t) => t.id);

      // Get all clients for these tenants
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients_legacy")
        .select("*")
        .in("tenant_id", tenantIds)
        .order("companyname");

      if (clientsError) throw clientsError;
      return clientsData || [];
    },
    enabled: !!activeTab && !!packages && packages.length > 0,
  });

  // Show client tracking dashboard for Super Admin and Team Leader
  if (isSuperAdmin || isTeamLeader) {
    if (packagesLoading) {
      return (
        <DashboardLayout>
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DashboardLayout>
      );
    }

    if (!packages || packages.length === 0) {
      return (
        <DashboardLayout>
          <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">No packages configured for your tenant.</p>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      );
    }

    // Filter clients based on search term
    const filteredClients = clients.filter(
      (client) =>
        client.companyname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contactname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.state && client.state.toLowerCase().includes(searchTerm.toLowerCase())),
    );

    // Sort clients
    const sortedClients = [...filteredClients].sort((a, b) => {
      if (sortBy === "name") return a.companyname.localeCompare(b.companyname);
      if (sortBy === "contact") return a.contactname.localeCompare(b.contactname);
      return 0;
    });

    // Create tabs from packages
    const packageTabs = packages.map((pkg) => ({
      code: pkg.slug || pkg.id.toString(),
      name: pkg.name || `Package ${pkg.id}`,
    }));

    const tabs = packageTabs.map((tab) => ({
      value: tab.code,
      label: tab.code,
      content: (
        <Card className="animate-fade-in border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 hover:bg-transparent">
                    <TableHead className="min-w-[200px] sticky left-0 z-10 border-r bg-muted/30 font-semibold text-foreground whitespace-nowrap h-14">
                      Client
                    </TableHead>
                    <TableHead className="min-w-[120px] border-r bg-muted/30 font-semibold text-foreground whitespace-nowrap h-14">
                      CLO
                    </TableHead>
                    {stages.map((stage) => (
                      <TableHead
                        key={stage.key}
                        className="text-center min-w-[100px] border-r bg-muted/30 font-semibold text-foreground whitespace-nowrap h-14"
                      >
                        {stage.label}
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[250px] bg-muted/30 font-semibold text-foreground whitespace-nowrap h-14">
                      Latest Note
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientsLoading ? (
                    <TableRow>
                      <TableCell colSpan={stages.length + 3} className="text-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : sortedClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={stages.length + 3} className="text-center py-16 text-muted-foreground">
                        {searchTerm ? "No clients match your search" : "No clients in this package yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedClients.map((client) => {
                      // Calculate days remaining if audit_due exists
                      const daysRemaining = client.audit_due
                        ? Math.ceil((new Date(client.audit_due).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <TableRow
                          key={client.id}
                          className="group hover:bg-primary/5 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20"
                        >
                          <TableCell className="sticky left-0 bg-background group-hover:bg-primary/5 z-10 border-r border-border/50 py-6 px-5 transition-colors">
                            <div className="space-y-2 min-w-[200px]">
                              <h4 className="text-sm font-semibold tracking-tight text-foreground">{client.companyname}</h4>
                              {client.audit_due && (
                                <p className="text-xs font-medium text-muted-foreground/80">
                                  {format(new Date(client.audit_due), "M/d/yyyy")}
                                  {daysRemaining !== null && ` (${daysRemaining} days)`}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="border-r border-border/50 py-6 px-5">
                            <div className="space-y-2">
                              <span className="text-sm font-medium text-foreground">{client.manager || "-"}</span>
                              <p className="text-xs font-medium text-muted-foreground/80">{client.state || "-"}</p>
                            </div>
                          </TableCell>
                          {stages.map((stage) => {
                            // Simple status based on client data - will be enhanced with actual stage data
                            const status = "pending" as "complete" | "in-progress" | "pending";
                            return (
                              <TableCell
                                key={stage.key}
                                className={cn(
                                  "text-center font-semibold text-base border-r border-border/50 transition-all",
                                  status === "complete" && "bg-primary/10 text-primary",
                                  status === "in-progress" && "bg-green-500/10 text-green-600 dark:text-green-500",
                                  status === "pending" && "bg-muted/20 text-muted-foreground/40",
                                )}
                              >
                                {status === "complete" && <span>✓</span>}
                                {status === "in-progress" && <span>●</span>}
                                {status === "pending" && <span>○</span>}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-sm text-muted-foreground max-w-[250px] py-6 px-5">
                            <div className="line-clamp-2 leading-relaxed">-</div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ),
    }));
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Track client progress across all stages</p>
            </div>
            <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 gap-2">
              <Plus className="h-4 w-4" />
              Setup Client
            </Button>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {packageTabs.map((tab) => (
              <button
                key={tab.code}
                onClick={() => setActiveTab(tab.code)}
                className={cn(
                  "flex-1 min-w-[120px] px-5 py-3 text-sm font-semibold transition-colors duration-200 whitespace-nowrap rounded-lg",
                  activeTab === tab.code
                    ? ""
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-sm border border-border/50",
                )}
                style={
                  activeTab === tab.code
                    ? {
                        color: "hsl(275 54% 41%)",
                        background: "hsl(275deg 54% 41% / 11%)",
                        border: "1px solid hsl(275 54% 41%)",
                      }
                    : undefined
                }
              >
                {tab.name}
              </button>
            ))}
          </div>

          {/* Search and Sort Controls */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
              <Input
                placeholder="Search clients, contacts, CLO..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full md:w-[200px] h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 justify-between font-semibold rounded-lg shadow-sm transition-all"
                >
                  <span className="text-foreground">
                    {sortBy === "name" && "Sort by CLO"}
                    {sortBy === "contact" && "Sort by Contact"}
                  </span>
                  <ArrowUpDown className="h-4 w-4 ml-2 text-muted-foreground/60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-2 rounded-lg shadow-lg border-border/50" align="start">
                <div className="space-y-1">
                  {[
                    {
                      value: "name",
                      label: "Sort by Name",
                    },
                    {
                      value: "contact",
                      label: "Sort by Contact",
                    },
                  ].map((option) => (
                    <div
                      key={option.value}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all",
                        sortBy === option.value ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
                      )}
                      onClick={() => setSortBy(option.value)}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-full space-y-4">
            {/* Tab Content */}
            <div className="animate-fade-in">{tabs.find((t) => t.value === activeTab)?.content}</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Regular user dashboard (simplified)
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Welcome to your dashboard. Your content will appear here.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
export default Dashboard;
