import { useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { UserPlus, AlertCircle, Users as UsersIcon } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  useClientTenantUsers,
  type ClientTenantUserRow,
  type TenantUserRelationshipRole,
  type TenantUserStatus,
} from "@/hooks/use-client-tenant-users";

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

function StatusDot({ status }: { status: TenantUserStatus }) {
  const colourMap: Record<TenantUserStatus, string> = {
    active: "bg-emerald-500",
    invited: "bg-amber-500",
    disabled: "bg-slate-400",
    archived: "bg-slate-300",
  };
  const labelMap: Record<TenantUserStatus, string> = {
    active: "Active",
    invited: "Invited",
    disabled: "Disabled",
    archived: "Archived",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${colourMap[status]}`} />
      <span className="text-sm">{labelMap[status]}</span>
    </div>
  );
}

function LastActive({ row }: { row: ClientTenantUserRow }) {
  if (row.row_type === "active") {
    if (row.last_sign_in_at) {
      return (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(parseISO(row.last_sign_in_at), { addSuffix: true })}
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
        {/* Mobile: stack role + status under user */}
        <div className="md:hidden mt-1 flex items-center gap-2 flex-wrap">
          <RolePill row={row} />
          <StatusDot status={row.status} />
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
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <UsersIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No users yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Looks like you're the only one set up. Invite your team to give them access — coming soon.
      </p>
    </div>
  );
}

export default function ClientUsersPage() {
  const { data, isLoading, isError } = useClientTenantUsers();

  const rows = useMemo<ClientTenantUserRow[]>(() => data ?? [], [data]);
  const activeCount = rows.filter((r) => r.row_type === "active").length;
  const invitedCount = rows.filter((r) => r.row_type === "invited").length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              People with access to your portal. Manage who can see your packages, documents, and Vivacity Academy.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button disabled className="cursor-not-allowed">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite user
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Coming soon — for now, contact your CSC to add users.
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Count summary */}
        {!isLoading && !isError ? (
          <div className="text-sm text-muted-foreground">
            {activeCount} active · {invitedCount} pending invite{invitedCount === 1 ? "" : "s"}
          </div>
        ) : null}

        {/* Error */}
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Couldn't load users.</AlertDescription>
          </Alert>
        ) : null}

        {/* Table or Empty */}
        {!isError && rows.length === 0 && !isLoading ? (
          <EmptyState />
        ) : !isError ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell w-[200px]">Role</TableHead>
                  <TableHead className="hidden md:table-cell w-[140px]">Status</TableHead>
                  <TableHead className="hidden md:table-cell w-[180px]">Last active</TableHead>
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
                        <RolePill row={row} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusDot status={row.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <LastActive row={row} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
