import { useMemo, useState } from "react";
import { differenceInDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  UserPlus,
  AlertCircle,
  Users as UsersIcon,
  MoreHorizontal,
  Mail,
  MailWarning,
  RefreshCcw,
  Ban,
  Eye,
  MousePointerClick,
  Link as LinkIcon,
  KeyRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useClientTenantUsers,
  type ClientTenantUserRow,
  type TenantUserRelationshipRole,
} from "@/hooks/use-client-tenant-users";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useUserCapacity } from "@/hooks/useUserCapacity";

import InviteUserDialog from "./users/InviteUserDialog";
import RevokeInviteAlert from "./users/RevokeInviteAlert";
import { useInviteMutations } from "./users/useInviteMutations";
import { CapacityPill } from "./users/CapacityPill";
import { supabase } from "@/integrations/supabase/client";


function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function formatRelationshipRole(role: TenantUserRelationshipRole): string {
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

function RolePill({ row }: { row: ClientTenantUserRow }) {
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

function RoleSwitcher({
  row,
  tenantId,
  pendingUserId,
  isReadOnly,
  setPendingUserId,
}: {
  row: ClientTenantUserRow;
  tenantId: number | null;
  pendingUserId: string | null;
  isReadOnly: boolean;
  setPendingUserId: (v: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const userId = row.user_id;
  const isPending = pendingUserId === userId;

  const mutation = useMutation({
    mutationFn: async (newRole: "academy_user" | "user") => {
      if (!tenantId || !userId) throw new Error("Missing tenant or user");
      const { error } = await supabase.rpc("set_relationship_role", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_relationship_role: newRole,
        p_reason: null,
      });
      if (error) throw error;
    },
    onMutate: () => {
      if (userId) setPendingUserId(userId);
    },
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["client_tenant_users", tenantId] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update role";
      toast.error(message);
    },
    onSettled: () => {
      setPendingUserId(null);
    },
  });

  return (
    <Select
      value={row.relationship_role}
      disabled={isPending || isReadOnly}
      onValueChange={(v) => {
        if (v === row.relationship_role) return;
        if (v !== "academy_user" && v !== "user") return;
        mutation.mutate(v);
      }}
    >
      <SelectTrigger className="h-8 w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="academy_user">Academy only</SelectItem>
        <SelectItem value="user">Full access</SelectItem>
      </SelectContent>
    </Select>
  );
}


function DeliveryBadges({ row }: { row: ClientTenantUserRow }) {
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

function StatusDot({ row }: { row: ClientTenantUserRow }) {
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
    <div
      className="flex items-center gap-2"
      title={row.last_active_at ?? undefined}
    >
      {dotClass ? (
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      ) : null}
      <span className={`text-sm ${dotClass ? "" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function SentIndicator({ row }: { row: ClientTenantUserRow }) {
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

function LastActive({ row }: { row: ClientTenantUserRow }) {
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

function UserCell({ row }: { row: ClientTenantUserRow }) {
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

function LoadingSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-5 w-24" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className="w-10" />
        </TableRow>
      ))}
    </>
  );
}

export default function ClientUsersPage() {
  const { data, isLoading, isError } = useClientTenantUsers();
  const { canManagePortalUsers, activeTenantId, isReadOnly } = useClientTenant();
  const { resend, copyLink, resetPassword } = useInviteMutations();
  const capacity = useUserCapacity(activeTenantId);
  const atLimit = !!capacity.data?.atLimit;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string | null } | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [inviteActionConfirm, setInviteActionConfirm] = useState<{
    action: "resend" | "copy";
    rowKey: string;
    email: string;
    secondsAgo: number;
  } | null>(null);

  const RECENT_ACTION_THRESHOLD_SECONDS = 120;
  const secondsSince = (iso?: string | null): number | null => {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.max(0, Math.floor((Date.now() - then) / 1000));
  };

  const requestResend = (row: ClientTenantUserRow) => {
    const s = secondsSince(row.last_sent_at);
    if (s !== null && s < RECENT_ACTION_THRESHOLD_SECONDS) {
      setInviteActionConfirm({ action: "resend", rowKey: row.row_key, email: row.email, secondsAgo: s });
      return;
    }
    resend.mutate(row.row_key);
  };
  const requestCopyLink = (row: ClientTenantUserRow) => {
    const s = secondsSince(row.last_sent_at);
    if (s !== null && s < RECENT_ACTION_THRESHOLD_SECONDS) {
      setInviteActionConfirm({ action: "copy", rowKey: row.row_key, email: row.email, secondsAgo: s });
      return;
    }
    copyLink.mutate(row.row_key);
  };




  const rows = useMemo<ClientTenantUserRow[]>(() => data ?? [], [data]);
  const activeCount = rows.filter((r) => r.row_type === "active").length;
  const invitedCount = rows.filter((r) => r.row_type === "invited").length;

  const inviteButton = (
    <div className="flex items-center gap-3">
      <CapacityPill capacity={capacity.data} />
      <Button
        disabled={!canManagePortalUsers || atLimit || isReadOnly}
        onClick={() => setInviteOpen(true)}
        title={atLimit ? "User limit reached — contact Vivacity to add more users." : undefined}
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Invite user
      </Button>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              People with access to your portal. Manage who can see your packages, documents, and Vivacity Academy.
            </p>
          </div>
          {inviteButton}
        </div>

        {!isLoading && !isError ? (
          <div className="text-sm text-muted-foreground">
            {activeCount} active · {invitedCount} pending invite{invitedCount === 1 ? "" : "s"}
          </div>
        ) : null}

        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Couldn't load users.</AlertDescription>
          </Alert>
        ) : null}

        {!isError && rows.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <UsersIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No users yet</h3>
            <p className="mt-1 mb-4 max-w-sm text-sm text-muted-foreground">
              Looks like you're the only one set up. Invite your team to give them access.
            </p>
            {inviteButton}
          </div>
        ) : !isError ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell w-[200px]">Role</TableHead>
                  <TableHead className="hidden md:table-cell w-[180px]">Status</TableHead>
                  <TableHead className="hidden md:table-cell w-[180px]">Last active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <LoadingSkeleton />
                ) : (
                  rows.map((row) => (
                    <TableRow key={`${row.row_type}:${row.row_key}`}>
                      <TableCell>
                        <UserCell row={row} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {canManagePortalUsers &&
                        row.row_type === "active" &&
                        row.user_id &&
                        (row.relationship_role === "academy_user" ||
                          row.relationship_role === "user") ? (
                          <RoleSwitcher
                            row={row}
                            tenantId={activeTenantId}
                            pendingUserId={pendingUserId}
                            setPendingUserId={setPendingUserId}
                            isReadOnly={isReadOnly}
                          />
                        ) : (
                          <RolePill row={row} />
                        )}
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <StatusDot row={row} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <LastActive row={row} />
                      </TableCell>
                      <TableCell className="w-10 text-right">
                        {row.row_type === "invited" && canManagePortalUsers ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Invitation actions"
                                disabled={resend.isPending || copyLink.isPending}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => requestResend(row)}
                                disabled={resend.isPending}
                              >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Resend invitation
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => requestCopyLink(row)}
                                disabled={copyLink.isPending}
                              >
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Copy invite link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setRevokeTarget({ id: row.row_key, email: row.email })}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Revoke invitation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : row.row_type === "active" && row.user_id && canManagePortalUsers ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="User actions"
                                disabled={resetPassword.isPending}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => resetPassword.mutate(row.user_id!)}
                                disabled={resetPassword.isPending}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset password
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} rows={rows} />
        <RevokeInviteAlert
          open={!!revokeTarget}
          onOpenChange={(o) => !o && setRevokeTarget(null)}
          invitationId={revokeTarget?.id ?? null}
          email={revokeTarget?.email ?? null}
        />
        <AlertDialog
          open={!!inviteActionConfirm}
          onOpenChange={(o) => !o && setInviteActionConfirm(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {inviteActionConfirm?.action === "copy"
                  ? "Generate a new link?"
                  : "Send a new invitation email?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {inviteActionConfirm ? (
                  <>
                    The link you already sent/copied to <strong>{inviteActionConfirm.email}</strong> was
                    generated <strong>{inviteActionConfirm.secondsAgo} seconds ago</strong>. Doing this
                    again will invalidate that link — if they try to use it they'll get an "invalid"
                    error. Continue anyway?
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  const target = inviteActionConfirm;
                  setInviteActionConfirm(null);
                  if (!target) return;
                  if (target.action === "copy") copyLink.mutate(target.rowKey);
                  else resend.mutate(target.rowKey);
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
