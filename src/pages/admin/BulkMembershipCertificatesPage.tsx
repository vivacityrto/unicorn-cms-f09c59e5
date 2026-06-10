import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY";

interface TenantWithMembership {
  id: number;
  name: string;
  rto_name: string | null;
  package_name: string;
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

      const tenantIds = [...new Set(instances.map((i: any) => i.tenant_id))];
      const packageIds = [...new Set(instances.map((i: any) => i.package_id))];

      const [{ data: tenantRows }, { data: packageRows }] = await Promise.all([
        supabase.from("tenants").select("id, name, rto_name").in("id", tenantIds),
        supabase.from("packages").select("id, name").in("id", packageIds),
      ]);

      const pkgMap = new Map((packageRows ?? []).map((p: any) => [p.id, p.name]));
      const instMap = new Map(instances.map((i: any) => [i.tenant_id, i.package_id]));

      const result: TenantWithMembership[] = (tenantRows ?? [])
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          rto_name: t.rto_name,
          package_name: (pkgMap.get(instMap.get(t.id)) as string) ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

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

  const selectAll = () => setSelected(new Set(tenants.map(t => t.id)));
  const clearAll = () => setSelected(new Set());

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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bulk Membership Certificates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select tenants to download their Vivacity SuperHero Membership Certificates.
            More than 2 will be bundled into a zip file.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={selectAll} disabled={downloading}>
                Select All ({tenants.length})
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} disabled={downloading}>
                Clear
              </Button>
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            </div>

            <div className="border rounded-lg divide-y">
              {tenants.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No tenants with active memberships found.
                </p>
              ) : (
                tenants.map(tenant => (
                  <div
                    key={tenant.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => !downloading && toggleTenant(tenant.id)}
                  >
                    <Checkbox
                      checked={selected.has(tenant.id)}
                      onCheckedChange={() => toggleTenant(tenant.id)}
                      disabled={downloading}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tenant.name}</p>
                      {tenant.rto_name && tenant.rto_name !== tenant.name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tenant.rto_name}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary">{tenant.package_name}</Badge>
                  </div>
                ))
              )}
            </div>

            {downloading && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{progressLabel}</p>
                <Progress value={progress} />
              </div>
            )}

            <Button
              onClick={handleDownload}
              disabled={downloading || selected.size === 0}
              size="lg"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download{" "}
                  {selected.size > 0
                    ? `${selected.size} Certificate${selected.size > 1 ? "s" : ""}`
                    : "Certificates"}
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
