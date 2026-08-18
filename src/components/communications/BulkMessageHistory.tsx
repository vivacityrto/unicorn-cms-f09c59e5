import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { CheckCircle2, ChevronRight, Megaphone, Users } from "lucide-react";

interface CampaignRow { id: string; title: string; target_mode: string; package_type: string | null; status: string; total_recipients: number | null; total_sent: number | null; total_failed: number | null; created_at: string; sent_at: string | null; created_by: string | null; }
interface UserMini { user_uuid: string; first_name: string | null; last_name: string | null; email: string | null; }
interface RecipientRow { id: string; tenant_id: number; user_id: string; delivery_status: string; sent_at: string | null; read_at: string | null; failure_reason: string | null; }
interface TenantMini { id: number; name: string | null; }

function describeAudience(mode: string, pkg: string | null): string {
  if (mode === "everyone") return "Everyone";
  if (mode === "members") return "All Members";
  if (mode === "tier" && pkg) return `Tier — ${cap(pkg)}`;
  if (mode === "package_type" && pkg) return `Package — ${cap(pkg.replace(/_/g, " "))}`;
  return mode;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function personName(user: UserMini | undefined) { return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unknown recipient" : "Unknown recipient"; }
const STATUS_STYLES: Record<string, string> = { draft: "bg-muted text-muted-foreground border-border", queued: "bg-blue-100 text-blue-700 border-blue-200", sent: "bg-emerald-100 text-emerald-700 border-emerald-200", failed: "bg-rose-100 text-rose-700 border-rose-200" };

function CampaignRecipients({ campaignId }: { campaignId: string }) {
  const [expandedTenantIds, setExpandedTenantIds] = useState<Set<number>>(new Set());
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["broadcast-recipients", campaignId],
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await (supabase as any).from("broadcast_recipients").select("id, tenant_id, user_id, delivery_status, sent_at, read_at, failure_reason").eq("campaign_id", campaignId).order("read_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RecipientRow[];
    },
  });
  const userIds = Array.from(new Set(recipients.map((recipient) => recipient.user_id)));
  const tenantIds = Array.from(new Set(recipients.map((recipient) => recipient.tenant_id)));
  const { data: users = [] } = useQuery({
    queryKey: ["broadcast-recipient-users", campaignId, userIds.join(",")], enabled: userIds.length > 0,
    queryFn: async (): Promise<UserMini[]> => {
      const { data, error } = await supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds);
      if (error) throw error;
      return (data ?? []) as UserMini[];
    },
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ["broadcast-recipient-tenants", campaignId, tenantIds.join(",")], enabled: tenantIds.length > 0,
    queryFn: async (): Promise<TenantMini[]> => {
      const { data, error } = await (supabase as any).from("tenants").select("id, name").in("id", tenantIds);
      if (error) throw error;
      return (data ?? []) as TenantMini[];
    },
  });
  const recipientsByTenant = useMemo(() => {
    const grouped = new Map<number, RecipientRow[]>();
    recipients.forEach((recipient) => grouped.set(recipient.tenant_id, [...(grouped.get(recipient.tenant_id) ?? []), recipient]));
    return Array.from(grouped.entries()).sort(([a], [b]) => (tenants.find((tenant) => tenant.id === a)?.name ?? "").localeCompare(tenants.find((tenant) => tenant.id === b)?.name ?? ""));
  }, [recipients, tenants]);
  if (isLoading) return <div className="px-4 py-4 text-sm text-muted-foreground">Loading recipient activity…</div>;
  const userMap = new Map(users.map((user) => [user.user_uuid, user]));
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const readCount = recipients.filter((recipient) => recipient.read_at).length;

  return <div className="border-t border-border bg-muted/20 px-4 py-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-medium text-foreground">Recipient activity</p><p className="text-xs text-muted-foreground">Expand a client to see each recipient.</p></div>
      <Badge variant="outline" className="gap-1 bg-background tabular-nums"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{readCount} read of {recipients.length}</Badge>
    </div>
    <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
      {recipientsByTenant.map(([tenantId, tenantRecipients]) => {
        const isOpen = expandedTenantIds.has(tenantId);
        const tenantReadCount = tenantRecipients.filter((recipient) => recipient.read_at).length;
        return <Collapsible key={tenantId} open={isOpen} onOpenChange={(open) => setExpandedTenantIds((previous) => { const next = new Set(previous); open ? next.add(tenantId) : next.delete(tenantId); return next; })} className="rounded-lg border border-border bg-background">
          <CollapsibleTrigger className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-90" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{tenantMap.get(tenantId)?.name ?? `Client #${tenantId}`}</p><p className="text-xs text-muted-foreground">{tenantReadCount} of {tenantRecipients.length} recipients read</p></div>
            <Badge variant="secondary" className="shrink-0 tabular-nums"><Users className="mr-1 h-3 w-3" /> {tenantRecipients.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent><div className="divide-y border-t border-border">
            {tenantRecipients.map((recipient) => <div key={recipient.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{personName(userMap.get(recipient.user_id))}</p>{userMap.get(recipient.user_id)?.email && <p className="truncate text-xs text-muted-foreground">{userMap.get(recipient.user_id)?.email}</p>}{recipient.failure_reason && <p className="mt-1 text-xs text-rose-700">{recipient.failure_reason}</p>}</div>
              <div className="shrink-0 text-right">{recipient.read_at ? <><Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Read</Badge><p className="mt-1 text-[11px] text-muted-foreground">{format(new Date(recipient.read_at), "d MMM, h:mm a")}</p></> : <><Badge variant="outline" className="text-muted-foreground">{recipient.delivery_status}</Badge><p className="mt-1 text-[11px] text-muted-foreground">Not read</p></>}</div>
            </div>)}
          </div></CollapsibleContent>
        </Collapsible>;
      })}
    </div>
  </div>;
}

export function BulkMessageHistory() {
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["broadcast-campaigns"],
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await (supabase as any).from("broadcast_campaigns").select("id, title, target_mode, package_type, status, total_recipients, total_sent, total_failed, created_at, sent_at, created_by").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });
  const creatorIds = Array.from(new Set(campaigns.map((campaign) => campaign.created_by).filter(Boolean) as string[]));
  const { data: users = [] } = useQuery({
    queryKey: ["broadcast-creators", creatorIds.sort().join(",")], enabled: creatorIds.length > 0,
    queryFn: async (): Promise<UserMini[]> => {
      const { data, error } = await supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", creatorIds);
      if (error) throw error;
      return (data ?? []) as UserMini[];
    },
  });
  const userMap = new Map(users.map((user) => [user.user_uuid, user]));
  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-lg" />)}</div>;
  if (campaigns.length === 0) return <div className="rounded-lg border border-border p-12 text-center text-muted-foreground"><Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">No bulk messages have been sent yet.</p></div>;

  return <div className="space-y-2">
    {campaigns.map((campaign) => {
      const isExpanded = expandedCampaignId === campaign.id;
      return <Collapsible key={campaign.id} open={isExpanded} onOpenChange={(open) => setExpandedCampaignId(open ? campaign.id : null)} className="overflow-hidden rounded-lg border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-90" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{campaign.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{describeAudience(campaign.target_mode, campaign.package_type)} · {campaign.sent_at ? format(new Date(campaign.sent_at), "d MMM yyyy, h:mm a") : "Not sent"}</p></div>
          <div className="hidden items-center gap-5 text-right text-xs text-muted-foreground sm:flex"><span><strong className="block text-sm text-foreground tabular-nums">{campaign.total_sent ?? 0}</strong>sent</span><span><strong className="block text-sm text-foreground tabular-nums">{campaign.total_recipients ?? 0}</strong>recipients</span></div>
          <Badge variant="outline" className={STATUS_STYLES[campaign.status] || ""}>{campaign.status}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent><div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Sent by {personName(campaign.created_by ? userMap.get(campaign.created_by) : undefined)}{campaign.total_failed ? ` · ${campaign.total_failed} failed` : ""}</div><CampaignRecipients campaignId={campaign.id} /></CollapsibleContent>
      </Collapsible>;
    })}
  </div>;
}
