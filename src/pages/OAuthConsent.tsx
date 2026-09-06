import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OAuthAuthorizationDetails = {
  redirect_url?: string | null;
  redirect_to?: string | null;
  client?: { name?: string | null } | null;
};

// Narrow local type for the beta `supabase.auth.oauth` namespace.
type OAuthAuthClient = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
};

function getOAuthClient(): OAuthAuthClient | null {
  const anyAuth = (supabase.auth as unknown) as { oauth?: OAuthAuthClient };
  return anyAuth.oauth ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }

      const oauth = getOAuthClient();
      if (!oauth) {
        setError(
          "OAuth authorization server is not enabled on this Supabase project.",
        );
        return;
      }

      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuthClient();
    if (!oauth) {
      setError("OAuth authorization server is not enabled on this Supabase project.");
      return;
    }
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Authorization error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading authorization request…</p>
      </main>
    );
  }

  const clientName = details.client?.name ?? "an external app";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Connect {clientName} to ComplyHub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {clientName} is asking to act as you in ComplyHub. It will only see the
            tenants, clients, tasks, and documents that your account can already
            access — the same tenant scoping and RLS apply.
          </p>
          <p className="text-xs text-muted-foreground">
            You can revoke this access at any time from your Supabase account
            connections.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Deny
            </Button>
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() => decide(true)}
            >
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
