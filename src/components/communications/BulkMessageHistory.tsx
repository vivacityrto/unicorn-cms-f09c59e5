import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Megaphone } from "lucide-react";

interface CampaignRow {
  id: string;
  title: string;
  target_mode: string;
  package_type: string | null;
  status: string;
  total_recipients: number | null;
  total_sent: number | null;
  total_failed: number | null;
  created_at: string;
  sent_at: string | null;
  created_by: string | null;
}

interface UserMini {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface RecipientRow {
  id: string;
  tenant_id: number;
  user_id: string;
  delivery_status: string;
  sent_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
}

interface TenantMini {
  id: number;
  name: string | null;
}

function describeAudience(mode: string, pkg: string | null): string {
  if (mode === "everyone") return "Everyone";
  if (mode === "members") return "All Members";
  if (mode === "tier" && pkg) return `Tier — ${cap(pkg)}`;
  if (mode === "package_type" && pkg) return `Package — ${cap(pkg.replace(/_/g, " "))}`;
  return mode;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  queued: "bg-blue-100 text-blue-700 border-blue-200",
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

function personName(user: UserMini | undefined) {
  if (!user) return "Unknown recipient";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unknown recipient";
}

function CampaignRecipients({ campaignId }: { campaignId: string }) {
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["broadcast-recipients", campaignId],
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await (supabase as any)
        .from("broadcast_recipients")
        .select("id, tenant_id, user_id, delivery_status, sent_at, read_at, failure_reason")
        .eq("campaign_id", campaignId)
        .order("read_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RecipientRow[];
    },
  });

  const userIds = Array.from(new Set(recipients.map((r) => r.user_id)));
  const tenantIds = Array.from(new Set(recipients.map((r) => r.tenant_id)));
  const { data: users = [] } = useQuery({
    queryKey: ["broadcast-recipient-users", campaignId, userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<UserMini[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .in("user_uuid", userIds);
      if (error) throw error;
      return (data ?? []) as UserMini[];
    },
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ["broadcast-recipient-tenants", campaignId, tenantIds.join(",")],
    enabled: tenantIds.length > 0,
    queryFn: async (): Promise<TenantMini[]> => {
      const { data, error } = await (supabase as any)
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds);
      if (error) throw error;
      return (data ?? []) as TenantMini[];
    },
  });

  if (isLoading) return <div className="px-4 py-3 text-sm text-muted-foreground">Loading recipients…</div>;

  const userMap = new Map(users.map((user) => [user.user_uuid, user]));
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recipient read activity</div>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Recipient</th>
              <th className="px-3 py-2 font-medium">Delivery</th>
              <th className="px-3 py-2 font-medium">Read</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((recipient) => (
              <tr key={recipient.id} className="border-t border-border">
                <td className="px-3 py-2">{tenantMap.get(recipient.tenant_id)?.name ?? `Client #${recipient.tenant_id}`}</td>
                <td className="px-3 py-2">{personName(userMap.get(recipient.user_id))}</td>
                <td className="px-3 py-2 capitalize">{recipient.delivery_status}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {recipient.read_at ? format(new Date(recipient.read_at), "d MMM yyyy, h:mm a") : "Not read"}
                  {recipient.failure_reason && <span className="block text-xs text-rose-700">{recipient.failure_reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BulkMessageHistory() {
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["broadcast-campaigns"],
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await (supabase as any)
        .from("broadcast_campaigns")
        .select(
          "id, title, target_mode, package_type, status, total_recipients, total_sent, total_failed, created_at, sent_at, created_by",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const creatorIds = Array.from(
    new Set(campaigns.map((c) => c.created_by).filter(Boolean) as string[]),
  );

  const { data: users = [] } = useQuery({
    queryKey: ["broadcast-creators", creatorIds.sort().join(",")],
    enabled: creatorIds.length > 0,
    queryFn: async (): Promise<UserMini[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .in("user_uuid", creatorIds);
      if (error) throw error;
      return (data ?? []) as UserMini[];
    },
  });

  const userMap = new Map(users.map((u) => [u.user_uuid, u]));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-border p-12 text-center text-muted-foreground">
        <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No bulk messages have been sent yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">Audience</th>
            <th className="px-4 py-2.5 font-medium text-right">Recipients</th>
            <th className="px-4 py-2.5 font-medium text-right">Sent</th>
            <th className="px-4 py-2.5 font-medium text-right">Failed</th>
            <th className="px-4 py-2.5 font-medium">Sent By</th>
            <th className="px-4 py-2.5 font-medium">Sent At</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const u = c.created_by ? userMap.get(c.created_by) : null;
            const name = u
              ? [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                u.email ||
                "Unknown"
              : "—";
            const isExpanded = expandedCampaignId === c.id;
            return (
              <Fragment key={c.id}>
              <tr className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium text-foreground">
                  <button type="button" className="flex items-center gap-1.5 text-left hover:underline" onClick={() => setExpandedCampaignId(isExpanded ? null : c.id)} aria-expanded={isExpanded}>
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    {c.title}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {describeAudience(c.target_mode, c.package_type)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.total_recipients ?? 0}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.total_sent ?? 0}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {(c.total_failed ?? 0) > 0 ? (
                    <span className="text-rose-700">{c.total_failed}</span>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {c.sent_at
                    ? format(new Date(c.sent_at), "d MMM yyyy, h:mm a")
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="outline"
                    className={STATUS_STYLES[c.status] || ""}
                  >
                    {c.status}
                  </Badge>
                </td>
              </tr>
              {isExpanded && (
                <tr key={`${c.id}-recipients`}>
                  <td colSpan={8} className="p-0">
                    <CampaignRecipients campaignId={c.id} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
