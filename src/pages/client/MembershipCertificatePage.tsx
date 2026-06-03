import { useState } from "react";
import { Award, Download, Loader2 } from "lucide-react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY";

const UNAVAILABLE_CODES = new Set(["NO_MEMBERSHIP", "COMING_SOON", "NO_CERTIFICATE_FOR_TIER"]);

export function MembershipCertificatePage() {
  const { activeTenantId } = useClientTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const handleDownload = async () => {
    if (!activeTenantId) return;
    setLoading(true);
    setUnavailable(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        toast({ title: "Not signed in", description: "Please sign in again.", variant: "destructive" });
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-membership-certificate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ tenant_id: activeTenantId }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("application/pdf")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vivacity-membership-certificate.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Error branch
      let payload: { code?: string; detail?: string } = {};
      if (contentType.includes("application/json")) {
        try {
          payload = await res.json();
        } catch {
          /* ignore */
        }
      }
      if (payload.code && UNAVAILABLE_CODES.has(payload.code)) {
        setUnavailable(true);
        return;
      }
      toast({
        title: "Could not generate certificate",
        description: payload.detail ?? `Request failed (${res.status}).`,
        variant: "destructive",
      });
    } catch (e) {
      toast({
        title: "Could not generate certificate",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7130A0, #ED1878)" }}
        >
          <Award className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Your Membership Certificate</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Download your official Vivacity Superhero Membership Certificate.
      </p>

      <button
        type="button"
        onClick={handleDownload}
        disabled={loading || !activeTenantId}
        className="inline-flex items-center gap-2 px-6 h-12 rounded-lg text-white font-semibold shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: "linear-gradient(135deg, #7130A0, #ED1878)" }}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating your certificate…
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download Certificate
          </>
        )}
      </button>

      {unavailable && (
        <div className="mt-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          Your membership certificate is not yet available. Please contact your Client Success
          Consultant.
        </div>
      )}
    </div>
  );
}

export default MembershipCertificatePage;
