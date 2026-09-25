import { differenceInDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { AlertCircle, Eye, Mail, MailWarning, MousePointerClick } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  ClientTenantUserRow,
  TenantUserRelationshipRole,
} from "@/features/client-identity/models";

/**
 * Status/role display primitives shared between the client portal's Users
 * page (ClientUsersPage.tsx) and the superadmin Academy user views —
 * anything rendering a ClientTenantUserRow should reuse these rather than
 * re-deriving the same invited/active/delivery logic.
 */

export function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function formatRelationshipRole(role: TenantUserRelationshipRole): string {
  switch (role) {
    case "primary_contact":
      return "Primary contact";
    case "secondary_contact":
      return "Secondary contact";
    case "user":
      return "Full access";
    case "academy_user":
      return "Academy only";
    default:
      return "—";
  }
}

export function RolePill({ row }: { row: ClientTenantUserRow }) {
  const label = formatRelationshipRole(row.relationship_role);
  if (row.relationship_role === "primary_contact") {
    return (
      <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/20">
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}

export function DeliveryBadges({ row }: { row: ClientTenantUserRow }) {
  const ds = row.delivery_status;
  const showDelivery = ds && ds !== "delivered";
  const engagementFirstAt = row.first_clicked_at || row.first_opened_at;
  if (!showDelivery && !engagementFirstAt) return null;
  return (
    <>
      {showDelivery
        ? (() => {
            const cfg =
              ds === "bounced"
                ? { variant: "destructive" as const, label: "Bounced" }
                : ds === "failed"
                ? { variant: "warning" as const, label: "Delivery failed" }
                : { variant: "destructive" as const, label: "Spam report" };
            return (
              <Badge variant={cfg.variant} className="text-xs">
                <AlertCircle className="mr-1 h-3 w-3" />
                {cfg.label}
              </Badge>
            );
          })()
        : null}
      {engagementFirstAt
        ? (() => {
            const clicked = !!row.first_clicked_at;
            const label = clicked ? "Clicked" : "Opened";
            const Icon = clicked ? MousePointerClick : Eye;
            const count = clicked ? row.click_count ?? 0 : row.open_count ?? 0;
            const firstAt = clicked ? row.first_clicked_at! : row.first_opened_at!;
            const noun = clicked ? "click" : "open";
            const tip = `${label} ${count} time${count === 1 ? "" : "s"} — first ${noun} ${format(new Date(firstAt), 'dd/MM/yyyy h:mm a')}`;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    <Icon className="mr-1 h-3 w-3" />
                    {label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{tip}</TooltipContent>
              </Tooltip>
            );
          })()
        : null}
    </>
  );
}

export function SentIndicator({ row }: { row: ClientTenantUserRow }) {
  if (row.last_sent_at) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-label="Email sent" />
        </TooltipTrigger>
        <TooltipContent>
          Sent {formatDistanceToNow(parseISO(row.last_sent_at), { addSuffix: true })}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <MailWarning className="h-3.5 w-3.5 text-amber-600" aria-label="Email not sent" />
      </TooltipTrigger>
      <TooltipContent>Email not sent yet — try resending.</TooltipContent>
    </Tooltip>
  );
}

export function StatusDot({ row }: { row: ClientTenantUserRow }) {
  if (row.row_type === "invited") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-sm">Invited</span>
        <SentIndicator row={row} />
        <DeliveryBadges row={row} />
      </div>
    );
  }

  // Derived activity status for active row_type
  let dotClass: string | null;
  let label: string;

  if (row.status === "disabled") {
    dotClass = "bg-destructive";
    label = "Disabled";
  } else if (!row.last_active_at) {
    dotClass = null;
    label = "Never signed in";
  } else {
    const days = differenceInDays(new Date(), parseISO(row.last_active_at));
    if (days < 30) {
      dotClass = "bg-emerald-500";
      label = "Active";
    } else {
      dotClass = "bg-amber-500";
      label = "Inactive";
    }
  }

  return (
    <div className="flex items-center gap-2" title={row.last_active_at ?? undefined}>
      {dotClass ? (
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      ) : null}
      <span className={`text-sm ${dotClass ? "" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

export function LastActive({ row }: { row: ClientTenantUserRow }) {
  if (row.row_type === "active") {
    if (row.last_active_at) {
      return (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(parseISO(row.last_active_at), { addSuffix: true })}
        </span>
      );
    }
    return <span className="text-sm text-muted-foreground">Never</span>;
  }
  if (row.invited_at) {
    return (
      <span className="text-sm text-muted-foreground">
        Invited {formatDistanceToNow(parseISO(row.invited_at), { addSuffix: true })}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">—</span>;
}

export function UserCell({ row }: { row: ClientTenantUserRow }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9">
        {row.avatar_url ? <AvatarImage src={row.avatar_url} alt={row.display_name} /> : null}
        <AvatarFallback>{getInitials(row.display_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-medium truncate">{row.display_name}</div>
        {row.email ? (
          <div className="text-xs text-muted-foreground truncate">{row.email}</div>
        ) : null}
        <div className="md:hidden mt-1 flex items-center gap-2 flex-wrap">
          <RolePill row={row} />
          <StatusDot row={row} />
        </div>
      </div>
    </div>
  );
}
