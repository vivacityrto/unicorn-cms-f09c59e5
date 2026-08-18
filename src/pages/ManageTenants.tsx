import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { useTenantsBasic } from "@/hooks/useTenantsBasic";
import { useTenantPackages } from "@/hooks/useTenantPackages";
import { useTenantContacts } from "@/hooks/useTenantContacts";
import { useCscAssignments } from "@/hooks/useCscAssignments";
import { useTenantNotes } from "@/hooks/useTenantNotes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Users, Search, CheckCircle2, XCircle, Activity, Link as LinkIcon, AlertCircle, Calendar, User, Package2, UserPlus, Archive, Pause, MessageSquare, Database, Clock, AlertTriangle } from "lucide-react";
import { isXeroInvoiceOverdue } from "@/lib/xeroInvoiceStatus";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AddTenantDialog } from "@/components/AddTenantDialog";
import { Unicorn1ImportDialog } from "@/components/Unicorn1ImportDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollableTableWrapper } from "@/components/ui/scrollable-table-wrapper";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect, type MultiSelectOption } from "@/components/documents/bulk-generate/MultiSelect";

import { cn } from "@/lib/utils";
import { CSCQuickAssignDialog } from "@/components/client/CSCQuickAssignDialog";
import { BulkReassignCscDialog } from "@/components/client/BulkReassignCscDialog";

interface TenantPackageInfo {
  id: number;
  name: string;
  full_text: string | null;
  slug: string | null;
}

interface Tenant {
  id: number;
  name: string;
  slug: string;
  status: string;
  lifecycle_status: string;
  access_status: string;
  risk_level: string;
  created_at: string;
  member_count: number;
  rto_id?: string | null;
  csc_name?: string | null;
  csc_avatar?: string | null;
  csc_user_id?: string | null;
  csc_archived?: boolean;
  package_name?: string | null;
  package_full_text?: string | null;
  package_id?: number | null;
  all_packages: TenantPackageInfo[];
  state?: string | null;
  complyhub_membership_tier?: string | null;
  next_renewal_date?: string | null;
  last_note_date?: string | null;
  last_note_snippet?: string | null;
  primary_contact_name?: string | null;
  hours_used_minutes?: number;
  hours_included_minutes?: number;
  registration_end_date?: string | null;
  archived_at?: string | null;
  xero_invoice_paid?: boolean | null;
  xero_invoice_due_date?: string | null;
  xero_repeating_invoice_url?: string | null;
}

// Aggregate status buckets the summary stat cards use — there is no literal
// 'suspended' or 'closed' value in tenants.status (real values include
// inactive/active/on_hold/disabled/terminated/cancelled/archived); these
// group the real values so the stat cards' counts and their click-through
// filters stay in sync.
const SUSPENDED_STATUSES = ["inactive", "on_hold", "disabled"];
const CLOSED_STATUSES = ["terminated", "cancelled", "archived"];

interface CSCFilterOption {
  user_uuid: string;
  first_name: string;
  last_name: string;
  archived: boolean;
}

export default function ManageTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [cscFilter, setCscFilter] = useState<string>("all");
  const [cscFilterOptions, setCscFilterOptions] = useState<CSCFilterOption[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [packages, setPackages] = useState<{ id: number; name: string; created_at?: string }[]>([]);
  const [sortField, setSortField] = useState<"status" | "member_count" | "created_at" | "renewal">("status");
  const [renewalFilter, setRenewalFilter] = useState<string>("all");
  const [regEndFilter, setRegEndFilter] = useState<string>("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [connectedTenantIds, setConnectedTenantIds] = useState<number[]>([]);
  const [assignedTenants, setAssignedTenants] = useState<Record<number, { userId: string; userName: string }>>({});
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; tenant: Tenant | null }>({ open: false, tenant: null });
  const [connectAllDialog, setConnectAllDialog] = useState(false);
  const [addTenantDialog, setAddTenantDialog] = useState(false);
  const [cscAssignDialog, setCscAssignDialog] = useState<{ open: boolean; tenant: Tenant | null }>({ open: false, tenant: null });
  const [u1ImportOpen, setU1ImportOpen] = useState(false);
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.unicorn_role === "Super Admin";
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  const canCreateClient = usePermission('clients.create');

  const [lifecycleStatuses, setLifecycleStatuses] = useState<{ value: string; label: string; seq: number }[]>([]);
  const [accessStatuses, setAccessStatuses] = useState<{ value: string; label: string; seq: number }[]>([]);
  const [statusOptions, setStatusOptions] = useState<{ code: number; value: string; description: string }[]>([]);
  const invoiceStatusOptions: MultiSelectOption[] = [
    { value: "paid", label: "Paid" },
    { value: "unpaid", label: "Unpaid" },
    { value: "recurring", label: "Recurring", description: "Has a repeating Xero invoice URL" },
    { value: "not_linked", label: "No Xero link / not checked" },
  ];
  const tablePillClass = "inline-flex h-5 items-center rounded-[11px] border px-2 text-[11px] font-medium leading-none whitespace-nowrap gap-1";
  const invoicePillClass = tablePillClass;

  const basicQuery = useTenantsBasic();
  const accumulated = useMemo(() => basicQuery.data ?? [], [basicQuery.data]);

  const tenantIds = useMemo(() => accumulated.map((t: any) => t.id), [accumulated]);

  const packagesQuery = useTenantPackages(tenantIds);
  const contactsQuery = useTenantContacts(tenantIds);
  const cscQuery = useCscAssignments(tenantIds);
  const notesQuery = useTenantNotes(tenantIds);

  // These four lookups merge into the table client-side, and none of them
  // surface loading/error state on their own - a failed fetch (e.g. an auth
  // token refresh racing one of useTenantContacts' sequential requests)
  // otherwise renders as every row silently showing "No primary contact" /
  // blank package data forever, indistinguishable from that genuinely being
  // the case. Surface it instead so it's obviously a fetch failure with a
  // way to retry, not a data problem.
  const failedLookupQueries = [
    { label: "primary contacts", query: contactsQuery },
    { label: "packages", query: packagesQuery },
    { label: "CSC assignments", query: cscQuery },
    { label: "notes", query: notesQuery },
  ].filter(q => q.query.isError);

  // Merge base tenants with the four lookup maps to produce the Tenant[] shape.
  useEffect(() => {
    if (accumulated.length === 0) {
      setTenants([]);
      return;
    }
    const pkgMap = packagesQuery.data || {};
    const contactsMap = contactsQuery.data || {};
    const cscMap = cscQuery.data || {};
    const notesMap = notesQuery.data || {};
    const merged: Tenant[] = accumulated.map((t: any) => {
      const pkg = pkgMap[t.id];
      const contacts = contactsMap[t.id];
      const csc = cscMap[t.id];
      const notes = notesMap[t.id];
      const activePackages = pkg?.all_packages || [];
      const firstNonKS = activePackages.find(p => !p.name.startsWith('KS'));
      const firstPackage = firstNonKS || activePackages[0];
      return {
        ...t,
        lifecycle_status: t.lifecycle_status || 'active',
        access_status: t.access_status || 'enabled',
        member_count: contacts?.member_count || 0,
        csc_user_id: csc?.csc_user_id ?? null,
        csc_name: csc?.csc_name ?? null,
        csc_avatar: csc?.csc_avatar ?? null,
        csc_archived: csc?.csc_archived ?? false,
        package_name: firstPackage?.name || null,
        package_full_text: firstPackage?.full_text || null,
        package_id: firstPackage?.id || null,
        all_packages: activePackages,
        state: contacts?.state || null,
        next_renewal_date: pkg?.next_renewal_date || null,
        last_note_date: notes?.last_note_date || null,
        last_note_snippet: notes?.last_note_snippet || null,
        primary_contact_name: contacts?.primary_contact_name || null,
        hours_used_minutes: pkg?.hours_used_minutes || 0,
        hours_included_minutes: pkg?.hours_included_minutes || 0,
        registration_end_date: notes?.registration_end_date || null,
        xero_invoice_paid: t.xero_invoice_paid ?? null,
        xero_invoice_due_date: t.xero_invoice_due_date ?? null,
        xero_repeating_invoice_url: t.xero_repeating_invoice_url ?? null,
      } as Tenant;
    });
    setTenants(merged);
  }, [accumulated, packagesQuery.data, contactsQuery.data, cscQuery.data, notesQuery.data]);

  const stats = useMemo(() => {
    const totalMembers = tenants.reduce((sum, t) => sum + (t.member_count || 0), 0);
    const active = tenants.filter(t => t.status === "active").length;
    const suspended = tenants.filter(t => SUSPENDED_STATUSES.includes(t.status)).length;
    const closed = tenants.filter(t => CLOSED_STATUSES.includes(t.status)).length;
    return { total: tenants.length, active, suspended, closed, totalMembers };
  }, [tenants]);

  useEffect(() => {
    fetchPackages();
    fetchCSCOptions();
    checkConnectedTenant();
    fetchCodeTables();
  }, []);

  const fetchCodeTables = async () => {
    const [lcRes, acRes, stRes] = await Promise.all([
      supabase.from("dd_lifecycle_status").select("value, label, seq").order("seq"),
      supabase.from("dd_access_status").select("value, label, seq").order("seq"),
      supabase.from("dd_status").select("code, value, description").gte("code", 100).order("code"),
    ]);
    if (lcRes.data) setLifecycleStatuses(lcRes.data);
    if (acRes.data) setAccessStatuses(acRes.data);
    if (stRes.data) setStatusOptions(stRes.data);
  };

  const checkConnectedTenant = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      
      const { data, error } = await supabase.from("connected_tenants").select("tenant_id").eq("user_uuid", session.session.user.id);
      if (error && error.code !== "PGRST116") {
        console.error("Error checking connection:", error);
      }
      if (data && data.length > 0) {
        setConnectedTenantIds(data.map(item => item.tenant_id));
      }

      const { data: allAssignments } = await supabase
        .from("connected_tenants")
        .select("tenant_id, user_uuid")
        .neq("user_uuid", session.session.user.id);

      if (allAssignments && allAssignments.length > 0) {
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
  }, [tenants, searchQuery, statusFilter, packageFilter, cscFilter, sortField, showArchived, renewalFilter, regEndFilter, invoiceStatusFilter]);

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase.from("packages").select("id, name, created_at").order("name");
      if (error) throw error;
      setPackages(data || []);
    } catch (error: any) {
      console.error("Error fetching packages:", error);
    }
  };

  const fetchCSCOptions = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, staff_teams, staff_team, archived")
        .eq("disabled", false)
        .order("archived", { ascending: true })
        .order("first_name", { ascending: true });

      if (error) throw error;

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

  // Realtime: invalidate the relevant React Query caches; React Query handles the refresh.
  useEffect(() => {
    const packagesChannel = supabase
      .channel('packages-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => {
        fetchPackages();
        queryClient.invalidateQueries({ queryKey: ['tenants', 'packages'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(packagesChannel); };
  }, [queryClient]);

  useEffect(() => {
    const cscChannel = supabase
      .channel('csc-assignments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_csc_assignments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['tenants', 'csc-assignments'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(cscChannel); };
  }, [queryClient]);

  // Bulk-reassign helpers
  const activeCscFilterId = useMemo(
    () => (cscFilter !== "all" && cscFilter !== "unassigned" ? cscFilter : null),
    [cscFilter]
  );
  const activeCscFilterOption = useMemo(
    () => cscFilterOptions.find(u => u.user_uuid === activeCscFilterId) ?? null,
    [cscFilterOptions, activeCscFilterId]
  );
  const activeCscFilterName = activeCscFilterOption
    ? [activeCscFilterOption.first_name, activeCscFilterOption.last_name].filter(Boolean).join(" ").trim()
    : "";
  const bulkSelectionEnabled = !!activeCscFilterId;

  // Sticky columns need a fully OPAQUE background, unlike the row's own
  // bg-muted/20 zebra tint - once the table scrolls horizontally, other
  // columns pass underneath the sticky one, and a 20%-alpha background lets
  // their content show through. color-mix bakes that same "muted at 20% over
  // background" look into a solid colour instead.
  const STICKY_ODD_ROW_BG = "bg-[color-mix(in_srgb,hsl(var(--muted))_20%,hsl(var(--background)))]";

  // Clear selection whenever the underlying filtered set or filter changes
  useEffect(() => {
    setSelectedTenantIds(new Set());
  }, [searchQuery, statusFilter, packageFilter, cscFilter, showArchived, renewalFilter, regEndFilter, invoiceStatusFilter]);

  const toggleRowSelected = (id: number, checked: boolean) => {
    setSelectedTenantIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const visibleSelectableIds = useMemo(
    () => (bulkSelectionEnabled ? filteredTenants.map(t => t.id) : []),
    [bulkSelectionEnabled, filteredTenants]
  );
  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every(id => selectedTenantIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleSelectableIds.some(id => selectedTenantIds.has(id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedTenantIds(prev => {
      const next = new Set(prev);
      if (checked) visibleSelectableIds.forEach(id => next.add(id));
      else visibleSelectableIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const selectedTenantList = useMemo(
    () => filteredTenants.filter(t => selectedTenantIds.has(t.id)).map(t => ({ id: t.id, name: t.name })),
    [filteredTenants, selectedTenantIds]
  );



  const applyFiltersAndSort = () => {
    let filtered = [...tenants];

    if (searchQuery) {
      // Search overrides every other filter/toggle below — a client should
      // always be findable by name/slug regardless of status, package, CSC,
      // renewal, registration, or archived-state filtering. Those filters
      // only apply when the user isn't actively searching.
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(tenant => tenant.name.toLowerCase().includes(q) || tenant.slug.toLowerCase().includes(q));
    } else {
      // Archived tenants are hidden by default regardless of status filter —
      // archived_at is an independent flag (a tenant can be archived while its
      // status is still e.g. 'active'), not a status value itself. SuperAdmin
      // can reveal them via the "Show Archived" toggle.
      if (!showArchived) {
        filtered = filtered.filter(tenant => !tenant.archived_at);
      }

      // Status filter — options come from dd_status (raw status column), so
      // always compare against tenant.status, not the derived lifecycle_status.
      // "suspended"/"closed" (set by the summary stat cards) are aggregate
      // groupings, not real dd_status values — see SUSPENDED_STATUSES/CLOSED_STATUSES.
      if (statusFilter === "suspended") {
        filtered = filtered.filter(tenant => SUSPENDED_STATUSES.includes(tenant.status));
      } else if (statusFilter === "closed") {
        filtered = filtered.filter(tenant => CLOSED_STATUSES.includes(tenant.status));
      } else if (statusFilter !== "all") {
        filtered = filtered.filter(tenant => tenant.status === statusFilter);
      }

      // Package filter
      if (packageFilter === "complyhub") {
        filtered = filtered.filter(tenant => !!tenant.complyhub_membership_tier);
      } else if (packageFilter !== "all") {
        filtered = filtered.filter(tenant => tenant.all_packages.some(p => p.id.toString() === packageFilter));
      }

      // CSC filter
      if (cscFilter === "unassigned") {
        filtered = filtered.filter(tenant => !tenant.csc_user_id);
      } else if (cscFilter !== "all") {
        filtered = filtered.filter(tenant => tenant.csc_user_id === cscFilter);
      }

      // Renewal due filter
      if (renewalFilter === "overdue") {
        const now = new Date();
        filtered = filtered.filter(tenant => {
          if (!tenant.next_renewal_date) return false;
          return new Date(tenant.next_renewal_date) < now;
        });
      } else if (renewalFilter !== "all") {
        const months = parseInt(renewalFilter);
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
        filtered = filtered.filter(tenant => {
          if (!tenant.next_renewal_date) return false;
          const renewal = new Date(tenant.next_renewal_date);
          return renewal <= cutoff;
        });
      }

      // Xero invoice status filter. Payment-state choices are mutually
      // exclusive and combine as OR; Recurring is an independent flag and
      // combines as AND so "Paid + Recurring" means paid recurring clients.
      if (invoiceStatusFilter.length > 0) {
        const paymentFilters = invoiceStatusFilter.filter(value => value !== "recurring");
        const recurringSelected = invoiceStatusFilter.includes("recurring");

        if (paymentFilters.length > 0) {
          filtered = filtered.filter(tenant => paymentFilters.some(value => {
            if (value === "paid") return tenant.xero_invoice_paid === true;
            if (value === "unpaid") return tenant.xero_invoice_paid === false;
            if (value === "not_linked") return tenant.xero_invoice_paid === null || tenant.xero_invoice_paid === undefined;
            return false;
          }));
        }

        if (recurringSelected) {
          filtered = filtered.filter(tenant => !!tenant.xero_repeating_invoice_url?.trim());
        }
      }

      // Registration end date filter
      if (regEndFilter !== "all") {
        const months = parseInt(regEndFilter);
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
        filtered = filtered.filter(tenant => {
          if (!tenant.registration_end_date) return false;
          const regEnd = new Date(tenant.registration_end_date);
          return regEnd <= cutoff;
        });
      }
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortField === "status") {
        const order: Record<string, number> = { active: 0, on_hold: 1, overrun: 2, disabled: 3, terminated: 4, cancelled: 5 };
        return (order[a.status] ?? 6) - (order[b.status] ?? 6);
      } else if (sortField === "member_count") {
        return b.member_count - a.member_count;
      } else if (sortField === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortField === "renewal") {
        const aDate = a.next_renewal_date ? new Date(a.next_renewal_date).getTime() : Infinity;
        const bDate = b.next_renewal_date ? new Date(b.next_renewal_date).getTime() : Infinity;
        return aDate - bDate;
      }
      return 0;
    });
    setFilteredTenants(filtered);
  };

  const handleConnect = async (tenant: Tenant) => {
    if (!isSuperAdmin && !isTeamLeader) {
      toast({ title: "Access Denied", description: "Only Super Admins and Team Leaders can connect to tenants", variant: "destructive" });
      return;
    }
    if (connectedTenantIds.includes(tenant.id)) {
      setDisconnectDialog({ open: true, tenant });
      return;
    }
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const { error } = await supabase.from("connected_tenants").upsert({
        user_uuid: session.session.user.id,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: session.session.user.email || ""
      }, { onConflict: "user_uuid,tenant_id" });
      if (error) throw error;
      setConnectedTenantIds(prev => [...prev, tenant.id]);
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: "Connected", description: `You are now connected to "${tenant.name}" workspace` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectDialog.tenant) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const { error } = await supabase.from("connected_tenants").delete().eq("user_uuid", session.session.user.id).eq("tenant_id", disconnectDialog.tenant.id);
      if (error) throw error;
      setConnectedTenantIds(prev => prev.filter(id => id !== disconnectDialog.tenant!.id));
      toast({ title: "Disconnected", description: `Disconnected from "${disconnectDialog.tenant.name}" workspace` });
      setDisconnectDialog({ open: false, tenant: null });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleConnectToAll = async () => {
    if (!isSuperAdmin && !isTeamLeader) {
      toast({ title: "Access Denied", description: "Only Super Admins and Team Leaders can connect to tenants", variant: "destructive" });
      return;
    }
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const activeTenants = tenants.filter(t => t.status === "active");
      const connections = activeTenants.map(tenant => ({
        user_uuid: session.session.user.id,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: session.session.user.email || ""
      }));
      const { error } = await supabase.from("connected_tenants").upsert(connections, { onConflict: "user_uuid,tenant_id" });
      if (error) throw error;
      setConnectedTenantIds(activeTenants.map(t => t.id));
      setConnectAllDialog(false);
      toast({ title: "Success", description: `Connected to ${activeTenants.length} active tenant${activeTenants.length !== 1 ? "s" : ""}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const styleConfig: Record<string, { icon: typeof CheckCircle2; className: string }> = {
      active: { icon: CheckCircle2, className: "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-600" },
      disabled: { icon: XCircle, className: "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-600" },
      on_hold: { icon: Pause, className: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-600" },
      overrun: { icon: AlertCircle, className: "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-600" },
      terminated: { icon: XCircle, className: "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-600" },
      cancelled: { icon: XCircle, className: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" },
    };
    const ddLabel = statusOptions.find(s => s.value === status)?.description;
    const style = styleConfig[status] || { icon: AlertCircle, className: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" };
    const Icon = style.icon;
    return (
      <Badge variant="outline" className={cn(tablePillClass, style.className)}>
        <Icon className="h-3 w-3 shrink-0" />
        {ddLabel || status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const renderInvoiceStatusBadges = (tenant: Tenant) => {
    const hasInvoiceStatus = tenant.xero_invoice_paid !== null && tenant.xero_invoice_paid !== undefined;
    const hasRecurringInvoice = !!tenant.xero_repeating_invoice_url?.trim();
    if (!hasInvoiceStatus && !hasRecurringInvoice) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    const overdue = !tenant.xero_invoice_paid && isXeroInvoiceOverdue(tenant.xero_invoice_due_date);
    return (
      <div className="flex min-h-11 flex-col items-start justify-center gap-1">
        {hasInvoiceStatus && (
          <Badge
            variant="outline"
            className={cn(
              invoicePillClass,
              tenant.xero_invoice_paid
                ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-600"
                : overdue
                  ? "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-600"
                  : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-600"
            )}
          >
            {tenant.xero_invoice_paid ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : overdue ? (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            ) : (
              <Clock className="h-3 w-3 shrink-0" />
            )}
            {tenant.xero_invoice_paid
              ? "Paid"
              : tenant.xero_invoice_due_date
                ? `${overdue ? "Overdue" : "Due"} ${new Date(tenant.xero_invoice_due_date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}`
                : "Unpaid"}
          </Badge>
        )}
        {hasRecurringInvoice && (
          <Badge
            variant="outline"
            title="Repeating Xero invoice URL is configured"
            className={cn(invoicePillClass, "bg-primary/10 text-primary hover:bg-primary/20 border-primary/50")}
          >
            <LinkIcon className="h-3 w-3 shrink-0" />
            Recurring
          </Badge>
        )}
      </div>
    );
  };

  if (basicQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Failed to load clients. Please try again.</p>
        <Button variant="outline" onClick={() => basicQuery.refetch()}>Retry</Button>
      </div>
    );
  }

  if (basicQuery.isLoading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold">Manage Clients</h1>
          <p className="text-muted-foreground">View and manage all client organisations</p>
        </div>
        {(canCreateClient || isSuperAdmin) && (
          <div className="flex flex-wrap gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button onClick={() => setAddTenantDialog(true)} className={!canCreateClient ? "bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"} disabled={!canCreateClient}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Add Client
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canCreateClient && <TooltipContent><p>You don't have permission to create clients.</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
            {isSuperAdmin && (
              <Button variant="outline" onClick={() => setU1ImportOpen(true)}>
                <Database className="h-4 w-4 mr-2" />
                Import from U1
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          onClick={() => { setStatusFilter("all"); setSearchQuery(""); }}
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
          onClick={() => { setStatusFilter("active"); setSearchQuery(""); }}
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
          onClick={() => { setStatusFilter("suspended"); setSearchQuery(""); }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Suspended</span>
            <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
              <Pause className="h-5 w-5 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.suspended}</p>
          <p className="text-xs text-muted-foreground">Temporarily suspended</p>
        </div>

        <div
          onClick={() => { setStatusFilter("closed"); setSearchQuery(""); }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Closed / Archived</span>
            <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{stats.closed}</p>
          <p className="text-xs text-muted-foreground">Closed or archived clients</p>
        </div>
      </div>

      {/* CSC Client Distribution */}
      {(() => {
        const activeTenantsList = tenants.filter(t => t.status === 'active');
        const cscCounts: Record<string, { name: string; count: number }> = {};
        let unassigned = 0;
        activeTenantsList.forEach(t => {
          if (t.csc_user_id && t.csc_name) {
            if (!cscCounts[t.csc_user_id]) cscCounts[t.csc_user_id] = { name: t.csc_name, count: 0 };
            cscCounts[t.csc_user_id].count++;
          } else {
            unassigned++;
          }
        });
        const sorted = Object.entries(cscCounts).sort((a, b) => b[1].count - a[1].count);
        return (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card">
            <span className="text-sm font-medium text-muted-foreground mr-1">CSC Load:</span>
            {sorted.map(([id, { name, count }]) => (
              <Badge
                key={id}
                variant={cscFilter === id ? "default" : "outline"}
                className="cursor-pointer text-xs gap-1"
                onClick={() => setCscFilter(cscFilter === id ? 'all' : id)}
              >
                {name.split(' ')[0]} <span className="font-bold">{count}</span>
              </Badge>
            ))}
            {unassigned > 0 && (
              <Badge
                variant={cscFilter === 'unassigned' ? "default" : "outline"}
                className="cursor-pointer text-xs gap-1 text-amber-600 border-amber-300"
                onClick={() => setCscFilter(cscFilter === 'unassigned' ? 'all' : 'unassigned')}
              >
                Unassigned <span className="font-bold">{unassigned}</span>
              </Badge>
            )}
          </div>
        );
      })()}

      {/* Filters and Search — search always gets its own full-width row so it
          never has to compete with the fixed-width filter comboboxes for
          space; the filters wrap onto as many lines as the viewport needs
          instead of squeezing the search box down to an unusable sliver. */}
      <div className="space-y-4">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search clients by name or slug..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-[48px] w-full" />
      </div>

      {/* Fixed 6-column grid (collapsing at narrower breakpoints) so all six
          filters wrap evenly instead of flex-wrap stranding whichever one
          doesn't fit the remaining space on its own row. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Combobox
          options={[
            { value: "all", label: "All Packages", icon: Package2, iconColor: "text-muted-foreground" },
            { value: "complyhub", label: "ComplyHub", icon: Package2, iconColor: "text-primary" },
            ...packages.map(pkg => {
              const isNew = pkg.created_at && new Date().getTime() - new Date(pkg.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
              return { value: pkg.id.toString(), label: pkg.name, badge: isNew ? "NEW" : undefined, icon: Package2, iconColor: "text-blue-600" };
            })
          ]}
          value={packageFilter}
          onValueChange={setPackageFilter}
          placeholder="Filter by package..."
          searchPlaceholder="Search packages..."
          emptyText="No packages found."
          className="w-full h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox
          options={[
            { value: "all", label: "All CSC", icon: Users, iconColor: "text-muted-foreground" },
            { value: "unassigned", label: `Unassigned (${tenants.filter(t => !t.csc_user_id).length})`, icon: UserPlus, iconColor: "text-amber-600" },
            ...cscFilterOptions.filter(u => !u.archived).map(csc => {
              const clientCount = tenants.filter(t => t.lifecycle_status === 'active' && t.csc_user_id === csc.user_uuid).length;
              return { value: csc.user_uuid, label: `${csc.first_name} ${csc.last_name} (${clientCount})`, icon: Users, iconColor: "text-primary" };
            }),
            ...cscFilterOptions.filter(u => u.archived).map(csc => {
              const clientCount = tenants.filter(t => t.lifecycle_status === 'active' && t.csc_user_id === csc.user_uuid).length;
              return { value: csc.user_uuid, label: `${csc.first_name} ${csc.last_name} (${clientCount})`, badge: "Archived", icon: Archive, iconColor: "text-muted-foreground" };
            })
          ]}
          value={cscFilter}
          onValueChange={setCscFilter}
          placeholder="Filter by CSC..."
          searchPlaceholder="Search CSC..."
          emptyText="No CSC users found."
          className="w-full h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox
          options={[
            { value: "all", label: "All Anniversaries", icon: Calendar, iconColor: "text-muted-foreground" },
            { value: "overdue", label: "Overdue", icon: Calendar, iconColor: "text-red-600" },
            { value: "1", label: "Due within 1 month", icon: Calendar, iconColor: "text-red-600" },
            { value: "2", label: "Due within 2 months", icon: Calendar, iconColor: "text-amber-600" },
            { value: "3", label: "Due within 3 months", icon: Calendar, iconColor: "text-yellow-600" },
            { value: "4", label: "Due within 4 months", icon: Calendar, iconColor: "text-primary" },
            { value: "5", label: "Due within 5 months", icon: Calendar, iconColor: "text-muted-foreground" },
          ]}
          value={renewalFilter}
          onValueChange={setRenewalFilter}
          placeholder="Filter by anniversary..."
          searchPlaceholder="Search..."
          emptyText="No options."
          className="w-full h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox
          options={[
            { value: "all", label: "All Reg End", icon: Calendar, iconColor: "text-muted-foreground" },
            { value: "3", label: "Within 3 months", icon: Calendar, iconColor: "text-red-600" },
            { value: "6", label: "Within 6 months", icon: Calendar, iconColor: "text-amber-600" },
            { value: "9", label: "Within 9 months", icon: Calendar, iconColor: "text-yellow-600" },
            { value: "12", label: "Within 1 year", icon: Calendar, iconColor: "text-primary" },
          ]}
          value={regEndFilter}
          onValueChange={setRegEndFilter}
          placeholder="Filter by reg end..."
          searchPlaceholder="Search..."
          emptyText="No options."
          className="w-full h-[48px]"
          showIcons
          showSeparators
        />

        <Combobox
          options={[
            { value: "all", label: "All Status", icon: Activity, iconColor: "text-muted-foreground" },
            ...statusOptions.map(s => {
              const iconMap: Record<string, typeof CheckCircle2> = { active: CheckCircle2, disabled: XCircle, on_hold: Pause, overrun: AlertCircle, terminated: XCircle, cancelled: Archive };
              const colorMap: Record<string, string> = { active: "text-green-600", disabled: "text-red-600", on_hold: "text-amber-600", overrun: "text-orange-600", terminated: "text-red-600", cancelled: "text-muted-foreground" };
              return { value: s.value, label: s.description, icon: iconMap[s.value] || Activity, iconColor: colorMap[s.value] || "text-muted-foreground" };
            })
          ]}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="Filter by status..."
          searchPlaceholder="Search filters..."
          emptyText="No filters found."
          className="w-full h-[48px]"
          showIcons
          showSeparators
        />

        <MultiSelect
          options={invoiceStatusOptions}
          values={invoiceStatusFilter}
          onChange={setInvoiceStatusFilter}
          placeholder="All Invoice Status"
          searchPlaceholder="Search..."
          emptyText="No options."
          maxSelectedDisplay={2}
          className="w-full min-h-[48px] bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm"
        />
      </div>

      {/* Show Archived toggle - SuperAdmin only. Kept out of the filter grid
          above since it's a compact checkbox+label, not another full-width
          filter control. */}
      {isSuperAdmin && statusFilter === "all" && (
        <div className="flex items-center gap-2 h-[48px]">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="text-sm whitespace-nowrap cursor-pointer">Show Archived</Label>
        </div>
      )}
      </div>

      {/* Bulk action bar */}
      {bulkSelectionEnabled && selectedTenantIds.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 rounded-lg border bg-card/95 backdrop-blur shadow-md p-3 flex items-center gap-3 animate-fade-in">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {selectedTenantIds.size} client{selectedTenantIds.size === 1 ? "" : "s"} selected
            {activeCscFilterName ? <span className="text-muted-foreground"> · from {activeCscFilterName}</span> : null}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTenantIds(new Set())}>
              Clear selection
            </Button>
            <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
              Reassign CSC
            </Button>
          </div>
        </div>
      )}

      {failedLookupQueries.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Couldn't load {failedLookupQueries.map(q => q.label).join(", ")} for some clients - the table below is showing incomplete data, not necessarily empty data.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => failedLookupQueries.forEach(q => q.query.refetch())}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Clients Table */}
      {filteredTenants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No clients found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollableTableWrapper className="rounded-lg border bg-card shadow-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 hover:bg-transparent">
                  {/* !pr-3 overrides TableHead's built-in [&:has([role=checkbox])]:pr-0 rule -
                      that selector has higher specificity than a plain px-3, so without
                      !important the checkbox rendered flush against the column's right
                      border (0 right padding vs 12px left) instead of centered. */}
                  {bulkSelectionEnabled && (
                    <TableHead className="sticky left-0 z-20 bg-muted/30 h-14 w-12 border-r border-border/50 px-3 !pr-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Checkbox
                                aria-label="Select all matching clients"
                                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                                onCheckedChange={(c) => toggleSelectAllVisible(!!c)}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            Select all {visibleSelectableIds.length} matching client{visibleSelectableIds.length === 1 ? "" : "s"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  )}
                  <TableHead className={cn(
                    "sticky z-20 bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50",
                    bulkSelectionEnabled ? "left-12" : "left-0"
                  )}>Tenant Name</TableHead>
                   <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Package</TableHead>
                   <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-left w-[132px] min-w-[132px] px-3">Invoice</TableHead>
                   <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">Hours</TableHead>
                   <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-left w-[132px] min-w-[132px] px-3">ComplyHub</TableHead>
                   <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-left w-[132px] min-w-[132px] px-3">Status</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">CSC</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">Members</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-left w-[120px] min-w-[120px] px-3">Risk Level</TableHead>
                  <TableHead
                    className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortField(sortField === "renewal" ? "status" : "renewal")}
                  >
                    Anniversary {sortField === "renewal" && "▲"}
                  </TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Reg End</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Last Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant, index) => {
                  const hasKickStart = (tenant as any)._hasKickStart || tenant.all_packages.some(p => p.name.startsWith('KS'));
                  const nonKSPackages = tenant.all_packages.filter(p => !p.name.startsWith('KS'));
                  const primaryPkg = nonKSPackages[0];
                  const secondaryPkg = nonKSPackages.length > 1 ? nonKSPackages[1] : null;

                  return (
                  <TableRow
                    key={tenant.id}
                    className={cn(
                      "group transition-all duration-200 cursor-pointer border-b border-border/50",
                      index % 2 === 0 ? "bg-background" : "bg-muted/20",
                      "hover:bg-primary/5 animate-fade-in",
                      (tenant.status !== "active" || !!tenant.archived_at) && "opacity-60"
                    )}
                    onClick={() => navigate(`/tenant/${tenant.id}`)}
                  >
                    {bulkSelectionEnabled && (
                      <TableCell
                        className={cn(
                          "sticky left-0 z-10 py-6 border-r border-border/50 w-12 px-3 !pr-3",
                          index % 2 === 0 ? "bg-background" : STICKY_ODD_ROW_BG
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${tenant.name}`}
                          checked={selectedTenantIds.has(tenant.id)}
                          onCheckedChange={(c) => toggleRowSelected(tenant.id, !!c)}
                        />
                      </TableCell>
                    )}
                    {/* Sticky so the client stays identifiable while scrolling
                        right through the remaining columns (Risk Level,
                        Anniversary, etc.) - needs its own opaque background
                        (matching the row's zebra stripe) rather than
                        inheriting TableRow's, since a sticky cell paints over
                        whatever scrolls underneath it. */}
                    <TableCell className={cn(
                      "sticky z-10 py-4 border-r border-border/50 min-w-[280px] pr-8",
                      bulkSelectionEnabled ? "left-12" : "left-0",
                      index % 2 === 0 ? "bg-background" : STICKY_ODD_ROW_BG
                    )}>
                      <div>
                        <div>
                          <Link
                            to={`/tenant/${tenant.id}`}
                            aria-label={`Open ${tenant.name}`}
                            className="inline-flex max-w-full rounded-sm font-semibold text-foreground pb-[10px] whitespace-nowrap hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {tenant.rto_id && <span className="text-primary font-bold mr-1.5">{tenant.rto_id}</span>}
                            {!tenant.rto_id && hasKickStart && (
                              <span className="text-primary font-bold mr-1.5">KS</span>
                            )}
                            {tenant.name}
                          </Link>
                          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {tenant.primary_contact_name || "No primary contact"}
                            </span>
                            <span>{tenant.state || ""}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 min-w-[200px] pr-8">
                      <div>
                        <div className="flex items-center gap-2 font-semibold text-foreground pb-[10px] whitespace-nowrap">
                          <span>{primaryPkg?.name || (tenant.all_packages.length > 0 ? tenant.all_packages[0].name : "NA")}</span>
                          {secondaryPkg && (
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {secondaryPkg.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          <Package2 className="w-3 h-3" />
                          <span>{primaryPkg?.full_text || (tenant.all_packages.length > 0 ? tenant.all_packages[0].full_text : "No Packages Added")}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap w-[132px] min-w-[132px] px-3 align-middle">
                      {renderInvoiceStatusBadges(tenant)}
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 text-center whitespace-nowrap">
                      {(() => {
                        const used = tenant.hours_used_minutes || 0;
                        const included = tenant.hours_included_minutes || 0;
                        if (included === 0 && used === 0) return <span className="text-xs text-muted-foreground">—</span>;
                        const fmt = (mins: number) => {
                          const abs = Math.abs(mins);
                          const sign = mins < 0 ? '-' : '';
                          const h = Math.floor(abs / 60);
                          const m = Math.round(abs % 60);
                          return `${sign}${h}:${m.toString().padStart(2, '0')}`;
                        };
                        const pct = included > 0 ? (used / included) * 100 : 0;
                        const colorClass = pct >= 100 ? 'text-destructive' : pct >= 80 ? 'text-yellow-600' : '';
                        return (
                          <span className={cn("text-sm font-medium", colorClass)}>
                            {fmt(used)} / {fmt(included)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap w-[132px] min-w-[132px] px-3 align-middle">
                      {tenant.complyhub_membership_tier ? (
                        <Badge variant="outline" className={cn(tablePillClass, "border-primary/30 text-primary")}>
                          {tenant.complyhub_membership_tier}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap w-[132px] min-w-[132px] px-3 align-middle">
                      <div className="flex flex-col items-start gap-1">
                        {getStatusBadge(tenant.status)}
                        {tenant.archived_at && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className={cn(tablePillClass, "border-muted-foreground/40 text-muted-foreground bg-muted/40")}>
                                  <Archive className="h-3 w-3 shrink-0" />
                                  Archived
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Archived {new Date(tenant.archived_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} — status above reflects the raw client status, independent of archive state.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="py-4 border-r border-border/50 whitespace-nowrap"
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
                                  <Badge variant="outline" className={cn(tablePillClass, "border-muted-foreground/40 text-muted-foreground bg-muted/40")}>
                                    <Archive className="h-3 w-3 shrink-0" />
                                    Archived
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{tenant.csc_name}</p>
                              {tenant.csc_archived && <p className="text-xs text-amber-500">This CSC is archived</p>}
                              {(isSuperAdmin || isTeamLeader) && <p className="text-xs text-muted-foreground">Click to change</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (isSuperAdmin || isTeamLeader) ? (
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-primary"
                            onClick={(e) => { e.stopPropagation(); setCscAssignDialog({ open: true, tenant }); }}
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
                    <TableCell className="py-4 border-r border-border/50 text-center whitespace-nowrap">
                      <span className="font-semibold">{tenant.member_count}</span>
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap w-[120px] min-w-[120px] px-3 align-middle">
                      {(() => {
                        const riskColors: Record<string, string> = {
                          low: "bg-emerald-500/10 text-emerald-600 border-emerald-600",
                          medium: "bg-amber-500/10 text-amber-600 border-amber-600",
                          high: "bg-orange-500/10 text-orange-600 border-orange-600",
                          critical: "bg-red-500/10 text-red-600 border-red-600",
                        };
                        const riskClass = riskColors[tenant.risk_level] || "bg-muted text-muted-foreground border-border";
                        return (
                          <Badge variant="outline" className={cn(tablePillClass, "capitalize", riskClass)}>
                            {tenant.risk_level}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap">
                      {tenant.next_renewal_date ? (() => {
                        const renewal = new Date(tenant.next_renewal_date);
                        const now = new Date();
                        const diffDays = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        const colorClass = diffDays < 0
                          ? "text-red-600"
                          : diffDays <= 30
                          ? "text-amber-600"
                          : diffDays <= 60
                          ? "text-yellow-600"
                          : "text-muted-foreground";
                        return (
                          <div className={cn("text-sm font-medium flex items-center gap-1", colorClass)}>
                            <Calendar className="h-3 w-3" />
                            {renewal.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 border-r border-border/50 whitespace-nowrap">
                      {tenant.registration_end_date ? (() => {
                        const regEnd = new Date(tenant.registration_end_date);
                        const now = new Date();
                        const diffDays = Math.ceil((regEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        const colorClass = diffDays <= 90
                          ? "text-destructive"
                          : diffDays <= 180
                          ? "text-amber-600"
                          : diffDays <= 270
                          ? "text-yellow-600"
                          : "text-muted-foreground";
                        return (
                          <div className={cn("text-sm font-medium flex items-center gap-1", colorClass)}>
                            <Calendar className="h-3 w-3" />
                            {regEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 px-4 text-center whitespace-nowrap">
                      {tenant.last_note_date ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground cursor-default">
                                <MessageSquare className="h-3 w-3" />
                                {new Date(tenant.last_note_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[300px]">
                              <p className="text-xs">{tenant.last_note_snippet || "—"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </ScrollableTableWrapper>
      )}

      {filteredTenants.length > 0 && (
        <div className="text-sm text-muted-foreground mt-6">
          Showing {filteredTenants.length} {filteredTenants.length === 1 ? 'result' : 'results'}
        </div>
      )}

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectDialog.open} onOpenChange={open => setDisconnectDialog({ open, tenant: null })}>
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
            <AlertDialogAction onClick={handleDisconnect} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Disconnect</AlertDialogAction>
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
            <AlertDialogAction onClick={handleConnectToAll} className="bg-primary hover:bg-primary/90">Connect to All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Tenant Dialog */}
      <AddTenantDialog open={addTenantDialog} onOpenChange={setAddTenantDialog} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['tenants'] })} />

      {/* Unicorn 1 Import Dialog */}
      <Unicorn1ImportDialog open={u1ImportOpen} onOpenChange={setU1ImportOpen} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['tenants'] })} />

      {/* CSC Quick Assign Dialog */}
      {cscAssignDialog.tenant && (
        <CSCQuickAssignDialog
          open={cscAssignDialog.open}
          onOpenChange={(open) => setCscAssignDialog({ open, tenant: open ? cscAssignDialog.tenant : null })}
          tenantId={cscAssignDialog.tenant.id}
          tenantName={cscAssignDialog.tenant.name}
          canRemove={isSuperAdmin}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['tenants'] })}
        />
      )}

      {/* Bulk Reassign CSC Dialog */}
      {activeCscFilterId && (
        <BulkReassignCscDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          fromUserId={activeCscFilterId}
          fromUserName={activeCscFilterName || "Current CSC"}
          tenants={selectedTenantList}
          onSuccess={(result) => {
            // Drop reassigned ids from selection; keep skipped ones visible.
            setSelectedTenantIds(prev => {
              const next = new Set(prev);
              result.reassigned.forEach(id => next.delete(id));
              return next;
            });
            // Refresh CSC chips and the table immediately.
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            queryClient.invalidateQueries({ queryKey: ['tenants', 'csc-assignments'] });
          }}
        />
      )}
    </div>
  );
}
