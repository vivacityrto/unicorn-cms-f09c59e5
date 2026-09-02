import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Pause,
  AlertCircle,
  Archive,
  Search,
  type LucideIcon,
} from "lucide-react";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY";

interface TenantWithMembership {
  id: number;
  name: string;
  rto_name: string | null;
  package_name: string;
  package_slug: string;
  status: string;
  csc_user_id: string | null;
  csc_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
}

function getStatusBadge(status: string, labelMap: Map<string, string>) {
  const label = labelMap.get(status) ?? status ?? "—";
  const configs: Record<string, { icon: LucideIcon; className: string }> = {
    active: { icon: CheckCircle2, className: "border-green-200 text-green-700 bg-green-50" },
    disabled: { icon: XCircle, className: "border-red-200 text-red-700 bg-red-50" },
    on_hold: { icon: Pause, className: "border-amber-200 text-amber-700 bg-amber-50" },
    overrun: { icon: AlertCircle, className: "border-orange-200 text-orange-700 bg-orange-50" },
    terminated: { icon: XCircle, className: "border-red-200 text-red-700 bg-red-50" },
    cancelled: { icon: Archive, className: "border-gray-200 text-gray-500 bg-gray-50" },
  };
  const cfg = configs[status] ?? { icon: AlertCircle, className: "border-gray-200 text-gray-500 bg-gray-50" };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export default function BulkMembershipCertificatesPage() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { isSuperAdmin } = useRBAC();
  const userRole = profile?.unicorn_role || "";
  const isCsc = userRole === "CSC";

  const [tenants, setTenants] = useState<TenantWithMembership[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [activeOwner, setActiveOwner] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusLabelMap, setStatusLabelMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!authLoading && !isSuperAdmin && !isCsc) {
      navigate("/");
    }
  }, [isSuperAdmin, isCsc, authLoading, navigate]);

  useEffect(() => {
    async function fetchTenants() {
      const { data: instances, error } = await supabase
        .from("package_instances")
        .select("tenant_id, package_id")
        .eq("is_active", true)
        .eq("billing_category", "membership_rto");

      if (error || !instances?.length) {
        setLoading(false);
        return;
      }

      const tenantIds = [...new Set(instances.map((i) => i.tenant_id))];
      const packageIds = [...new Set(instances.map((i) => i.package_id))];

      const [
        { data: tenantRows },
        { data: packageRows },
        { data: cscAssignments },
        { data: contactAssignments },
        { data: statusRows },
      ] = await Promise.all([
        supabase.from("tenants").select("id, name, rto_name, status").in("id", tenantIds),
        supabase.from("packages").select("id, name, slug").in("id", packageIds),
        supabase
          .from("tenant_csc_assignments")
          .select("tenant_id, csc_user_id")
          .eq("is_primary", true)
          .in("tenant_id", tenantIds),
        supabase
          .from("tenant_users")
          .select("tenant_id, user_id")
          .eq("relationship_role", "primary_contact")
          .in("tenant_id", tenantIds),
        supabase.from("dd_status").select("value, description").gte("code", 100),
      ]);

      const cscUserIds = [
        ...new Set((cscAssignments ?? []).map((r) => r.csc_user_id).filter(Boolean)),
      ];
      const contactUserIds = [
        ...new Set((contactAssignments ?? []).map((r) => r.user_id).filter(Boolean)),
      ];

      const [{ data: cscUsers }, { data: contactUsers }] = await Promise.all([
        cscUserIds.length
          ? supabase
              .from("users")
              .select("user_uuid, first_name, last_name")
              .in("user_uuid", cscUserIds)
          : Promise.resolve({ data: [] as { user_uuid: string; first_name: string | null; last_name: string | null }[] }),
        contactUserIds.length
          ? supabase
              .from("users")
              .select("user_uuid, first_name, last_name, email")
              .in("user_uuid", contactUserIds)
          : Promise.resolve({ data: [] as { user_uuid: string; first_name: string | null; last_name: string | null; email: string }[] }),
      ]);

      const pkgMap = new Map(
        (packageRows ?? []).map((p) => [p.id, { name: p.name, slug: p.slug ?? "" }])
      );
      const instMap = new Map(instances.map((i) => [i.tenant_id, i.package_id]));
      const cscAssignMap = new Map(
        (cscAssignments ?? []).map((r) => [r.tenant_id, r.csc_user_id])
      );
      const cscUserMap = new Map(
        (cscUsers ?? []).map((u) => [
          u.user_uuid,
          `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
        ])
      );
      const contactAssignMap = new Map(
        (contactAssignments ?? []).map((r) => [r.tenant_id, r.user_id])
      );
      const contactUserMap = new Map((contactUsers ?? []).map((u) => [u.user_uuid, u]));
      const statusLabels = new Map(
        (statusRows ?? []).map((s) => [s.value, s.description])
      );

      const result: TenantWithMembership[] = (tenantRows ?? [])
        .map((t) => {
          const pkg = pkgMap.get(instMap.get(t.id));
          const cscUserId = cscAssignMap.get(t.id) ?? null;
          const contactUserId = contactAssignMap.get(t.id) ?? null;
          const contactUser = contactUserId ? contactUserMap.get(contactUserId) : null;
          return {
            id: t.id,
            name: t.name,
            rto_name: t.rto_name,
            package_name: pkg?.name ?? "",
            package_slug: (pkg?.slug ?? "").replace(/^\/package-/i, "").toUpperCase(),
            status: t.status ?? "",
            csc_user_id: cscUserId,
            csc_name: cscUserId ? cscUserMap.get(cscUserId) ?? null : null,
            primary_contact_name: contactUser
              ? `${contactUser.first_name ?? ""} ${contactUser.last_name ?? ""}`.trim() || null
              : null,
            primary_contact_email: contactUser?.email ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      setStatusLabelMap(statusLabels);
      setTenants(result);
      setLoading(false);
    }
    fetchTenants();
  }, []);

  const toggleTenant = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ownerTabs = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tenants) {
      if (t.csc_name) map.set(t.csc_name, (map.get(t.csc_name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tenants]);

  const uniqueGroups = useMemo(
    () => [...new Set(tenants.map(t => t.package_slug).filter(Boolean))].sort(),
    [tenants]
  );

  const uniqueStatuses = useMemo(
    () => [...new Set(tenants.map(t => t.status).filter(Boolean))].sort(),
    [tenants]
  );

  const visibleTenants = useMemo(() => {
    let rows = tenants;
    if (activeOwner) rows = rows.filter(t => t.csc_name === activeOwner);
    if (activeGroup) rows = rows.filter(t => t.package_slug === activeGroup);
    if (activeStatus) rows = rows.filter(t => t.status === activeStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          (t.primary_contact_name ?? "").toLowerCase().includes(q) ||
          (t.primary_contact_email ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tenants, activeOwner, activeGroup, activeStatus, searchQuery]);

  const allVisibleSelected =
    visibleTenants.length > 0 && visibleTenants.every(t => selected.has(t.id));

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const t of visibleTenants) next.delete(t.id);
      } else {
        for (const t of visibleTenants) next.add(t.id);
      }
      return next;
    });
  };

  const handleDownload = async () => {
    if (!selected.size) return;
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      toast.error("Not signed in. Please sign in again.");
      return;
    }

    setDownloading(true);
    setProgress(0);

    const selectedList = tenants.filter(t => selected.has(t.id));
    const collected: { filename: string; blob: Blob }[] = [];
    let failed = 0;

    for (let i = 0; i < selectedList.length; i++) {
      const tenant = selectedList[i];
      setProgressLabel(
        `Generating ${i + 1} of ${selectedList.length}: ${tenant.rto_name || tenant.name}…`
      );
      setProgress(Math.round((i / selectedList.length) * 100));

      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-membership-certificate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ tenant_id: tenant.id }),
          }
        );

        const contentType = res.headers.get("content-type") ?? "";
        if (res.ok && contentType.includes("application/pdf")) {
          const blob = await res.blob();
          const disposition = res.headers.get("content-disposition") ?? "";
          const match = disposition.match(/filename="([^"]+)"/);
          const filename =
            match?.[1] ??
            `${tenant.rto_name || tenant.name}-SuperHero-Membership-Certificate.pdf`;
          collected.push({ filename, blob });
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setProgress(100);
    setProgressLabel("Preparing download…");

    if (collected.length === 0) {
      toast.error("No certificates could be generated.");
      setDownloading(false);
      return;
    }

    if (collected.length <= 2) {
      for (const { filename, blob } of collected) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } else {
      const zip = new JSZip();
      for (const { filename, blob } of collected) {
        zip.file(filename, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Vivacity-Membership-Certificates.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    if (failed > 0) {
      toast.warning(`${failed} certificate(s) could not be generated and were skipped.`);
    } else {
      toast.success(`${collected.length} certificate(s) downloaded successfully.`);
    }

    setDownloading(false);
    setProgress(0);
    setProgressLabel("");
  };

  const CSC_COLORS = [
    "bg-purple-100 text-purple-800",
    "bg-blue-100 text-blue-800",
    "bg-green-100 text-green-800",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-800",
    "bg-cyan-100 text-cyan-800",
    "bg-orange-100 text-orange-800",
    "bg-teal-100 text-teal-800",
  ];

  function getCscColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return CSC_COLORS[Math.abs(hash) % CSC_COLORS.length];
  }

  return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">Client Contact Register & Membership Certificates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View client contacts and bulk download their Vivacity SuperHero Membership Certificates.
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-card lg:w-[420px] space-y-3">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-fuchsia-600" />
              <h2 className="font-semibold text-sm">Bulk Download Membership Certificates</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.size} clients selected · Certificates will be bundled into a ZIP file
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setSelected(new Set(visibleTenants.map(t => t.id)))}
                disabled={downloading}
              >
                Select All ({visibleTenants.length})
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                onClick={handleDownload}
                disabled={downloading || selected.size === 0}
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Selected
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={activeOwner ?? "__all__"}
                onValueChange={v => setActiveOwner(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All CSCs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All CSCs</SelectItem>
                  {ownerTabs.map(([name]) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={activeGroup ?? "__all__"}
                onValueChange={v => setActiveGroup(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Groups</SelectItem>
                  {uniqueGroups.map(g => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={activeStatus ?? "__all__"}
                onValueChange={v => setActiveStatus(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>
                      {statusLabelMap.get(s) ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative w-full sm:w-80 ml-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, contact, email…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>


            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAllVisible}
                        disabled={downloading || visibleTenants.length === 0}
                      />
                    </TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>CSC</TableHead>
                    <TableHead>Code / Client</TableHead>
                    <TableHead>Contact Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No tenants with active memberships found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleTenants.map(tenant => (
                      <TableRow
                        key={tenant.id}
                        className="cursor-pointer"
                        onClick={() => !downloading && toggleTenant(tenant.id)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(tenant.id)}
                            onCheckedChange={() => toggleTenant(tenant.id)}
                            disabled={downloading}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{tenant.package_slug || "—"}</span>
                        </TableCell>
                        <TableCell>
                          {tenant.csc_name ? (
                            <Badge variant="secondary" className={getCscColor(tenant.csc_name)}>
                              {tenant.csc_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{tenant.name}</div>
                          {tenant.rto_name && tenant.rto_name !== tenant.name && (
                            <div className="text-xs text-muted-foreground">{tenant.rto_name}</div>
                          )}
                        </TableCell>
                        <TableCell>{tenant.primary_contact_name ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {tenant.primary_contact_email ?? "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant.status, statusLabelMap)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {downloading && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{progressLabel}</p>
                <Progress value={progress} />
              </div>
            )}
          </>
        )}
      </div>
  );
}
