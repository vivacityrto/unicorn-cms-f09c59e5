import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useOpenDocumentRequest } from "@/components/layout/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, RefreshCw, Clock, Building, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface TenantTgaData {
  rto_id: string | null;
  rto_name: string | null;
  legal_name: string | null;
  tga_legal_name: string | null;
  tga_status: string | null;
  tga_last_synced_at: string | null;
  tga_connected_at: string | null;
  state: string | null;
  abn: string | null;
  acn: string | null;
  cricos_id: string | null;
  name: string;
}

interface TgaReview {
  id: string;
  reviewed_at: string;
  reviewed_by_user_id: string;
  source: string;
  notes: string | null;
}

export default function ClientTgaDetailsPage() {
  const { user } = useAuth();
  const { activeTenantId, isPreview, isReadOnly } = useClientTenant();
  const openDocumentRequest = useOpenDocumentRequest();

  const [tenantData, setTenantData] = useState<TenantTgaData | null>(null);
  const [reviews, setReviews] = useState<TgaReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activeTenantId) return;
    loadData();
  }, [activeTenantId]);

  async function loadData() {
    setLoading(true);
    try {
      const [tenantRes, reviewsRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("rto_id, rto_name, legal_name, tga_legal_name, tga_status, tga_last_synced_at, tga_connected_at, state, abn, acn, cricos_id, name")
          .eq("id", activeTenantId!)
          .single(),
        supabase
          .from("client_tga_reviews")
          .select("id, reviewed_at, reviewed_by_user_id, source, notes")
          .eq("tenant_id", activeTenantId!)
          .order("reviewed_at", { ascending: false })
          .limit(10),
      ]);

      if (tenantRes.data) setTenantData(tenantRes.data);
      if (reviewsRes.data) setReviews(reviewsRes.data);
    } catch (err) {
      console.error("[ClientTgaDetails] Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReviewed() {
    if (!user?.id || !activeTenantId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("client_tga_reviews").insert({
        tenant_id: activeTenantId,
        reviewed_by_user_id: user.id,
        source: isPreview ? "vivacity" : "client",
      });
      if (error) throw error;
      toast.success("TGA details marked as reviewed");
      await loadData();
    } catch (err: any) {
      toast.error("Failed to log review: " + (err.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleRequestUpdate() {
    const snapshot = tenantData
      ? `Current TGA Details:\n- RTO Number: ${tenantData.rto_id || "N/A"}\n- Legal Name: ${tenantData.tga_legal_name || tenantData.legal_name || "N/A"}\n- Trading Name: ${tenantData.rto_name || "N/A"}\n- ABN: ${tenantData.abn || "N/A"}\n- State: ${tenantData.state || "N/A"}`
      : "";

    openDocumentRequest({
      category: "Admin",
      title: "Update TGA details",
      details: `Please review and update our TGA details.\n\n${snapshot}`,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const lastReview = reviews[0];
  const lastSynced = tenantData?.tga_last_synced_at
    ? format(new Date(tenantData.tga_last_synced_at), "dd MMM yyyy, h:mm a")
    : null;
  const lastReviewedAt = lastReview
    ? format(new Date(lastReview.reviewed_at), "dd MMM yyyy, h:mm a")
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(270 47% 26%)" }}>
            TGA Details
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your organisation's training.gov.au registration details
          </p>
        </div>
        {tenantData?.tga_status && (
          <Badge
            variant={tenantData.tga_status === "connected" ? "default" : "secondary"}
            className="text-xs"
          >
            {tenantData.tga_status === "connected" ? "Connected" : tenantData.tga_status}
          </Badge>
        )}
      </div>

      {/* Organisation Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5" style={{ color: "hsl(270 55% 41%)" }} />
            <div>
              <CardTitle className="text-lg">Registration Details</CardTitle>
              <CardDescription>Information sourced from training.gov.au</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="RTO Number" value={tenantData?.rto_id} />
            <DetailField label="Legal Name" value={tenantData?.tga_legal_name || tenantData?.legal_name} />
            <DetailField label="Trading Name" value={tenantData?.rto_name || tenantData?.name} />
            <DetailField label="ABN" value={tenantData?.abn} />
            <DetailField label="ACN" value={tenantData?.acn} />
            <DetailField label="State" value={tenantData?.state} />
            <DetailField label="CRICOS Provider Code" value={tenantData?.cricos_id} />
          </dl>
        </CardContent>
      </Card>

      {/* Sync & Review Timestamps */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5" style={{ color: "hsl(270 55% 41%)" }} />
            <div>
              <CardTitle className="text-lg">Sync & Review Status</CardTitle>
              <CardDescription>Track when details were last synchronised and reviewed</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last TGA sync</span>
            <span className="font-medium">{lastSynced || "Never synced"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last reviewed</span>
            <span className="font-medium">{lastReviewedAt || "Not yet reviewed"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSearch className="h-5 w-5" style={{ color: "hsl(270 55% 41%)" }} />
            <div>
              <CardTitle className="text-lg">Actions</CardTitle>
              <CardDescription>Confirm you've reviewed these details or request updates</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={handleConfirmReviewed} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Confirm Reviewed
          </Button>
          <Button variant="outline" onClick={handleRequestUpdate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Request Update
          </Button>
        </CardContent>
      </Card>

      {/* Recent Reviews */}
      {reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reviews.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0" style={{ borderColor: "hsl(270 20% 92%)" }}>
                  <div>
                    <span className="font-medium">
                      {format(new Date(r.reviewed_at), "dd MMM yyyy, h:mm a")}
                    </span>
                    {r.notes && <span className="text-muted-foreground ml-2">— {r.notes}</span>}
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {r.source}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-medium">{value || <span className="text-muted-foreground italic">Not available</span>}</dd>
    </div>
  );
}
