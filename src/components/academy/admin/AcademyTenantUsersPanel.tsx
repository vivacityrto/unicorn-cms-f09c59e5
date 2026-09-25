import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, RefreshCcw, Link as LinkIcon, Ban, KeyRound, UserPlus } from "lucide-react";
import {
  useAcademyTenantUsers,
  academyTenantUsersKey,
  type ClientTenantUserRow,
} from "@/hooks/academy/useAcademyTenantUsers";
import { useAcademyInviteMutations } from "@/hooks/academy/useAcademyInviteMutations";
import { RolePill, StatusDot, LastActive, UserCell } from "@/components/client/users/UserStatusDisplay";
import RevokeInviteAlert from "@/components/client/users/RevokeInviteAlert";
import { TenantInviteDialog } from "@/components/client/TenantInviteDialog";

interface Props {
  tenantId: number;
  tenantName: string;
  canManage: boolean;
  /** "compact" is used for the nested list on the tenant list page. */
  variant?: "full" | "compact";
}

/**
 * Academy-scoped equivalent of ClientUsersPage's roster table — same
 * status/role display and the same resend/copy-link/revoke/reset-password
 * row actions, reused both inline (nested under a tenant row on the Academy
 * Customers list) and as the tenant detail page's per-user controls.
 */
export function AcademyTenantUsersPanel({ tenantId, tenantName, canManage, variant = "full" }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useAcademyTenantUsers(tenantId);
  const { resend, revoke, copyLink, resetPassword } = useAcademyInviteMutations(tenantId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string | null } | null>(null);

  const compact = variant === "compact";
  const columnCount = compact ? 4 : 5;

  const goToUser = (row: ClientTenantUserRow) => {
    navigate(`/superadmin/academy/tenant/${tenantId}/user/${row.row_key}`);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className="flex items-center justify-between gap-2">
        {!compact && <h3 className="text-sm font-medium text-muted-foreground">Academy Users</h3>}
        {canManage && (
          <Button
            size={compact ? "sm" : "default"}
            variant={compact ? "outline" : "default"}
            className="gap-2 ml-auto"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Invite Academy User
          </Button>
        )}
      </div>

      <div className={compact ? "rounded-md border bg-background" : "rounded-lg border bg-card"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden md:table-cell w-[160px]">Role</TableHead>
              <TableHead className="w-[200px]">Status</TableHead>
              {!compact && <TableHead className="hidden md:table-cell w-[160px]">Last active</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center py-8 text-sm text-muted-foreground">
                  No Academy users yet
                </TableCell>
              </TableRow>
            )}

            {!isLoading && rows.map((row) => (
              <TableRow
                key={`${row.row_type}:${row.row_key}`}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => goToUser(row)}
              >
                <TableCell><UserCell row={row} /></TableCell>
                <TableCell className="hidden md:table-cell"><RolePill row={row} /></TableCell>
                <TableCell><StatusDot row={row} /></TableCell>
                {!compact && <TableCell className="hidden md:table-cell"><LastActive row={row} /></TableCell>}
                <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
                  {row.row_type === "invited" && canManage ? (
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
                        <DropdownMenuItem onClick={() => resend.mutate(row.row_key)} disabled={resend.isPending}>
                          <RefreshCcw className="mr-2 h-4 w-4" /> Resend invitation
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink.mutate(row.row_key)} disabled={copyLink.isPending}>
                          <LinkIcon className="mr-2 h-4 w-4" /> Copy invite link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRevokeTarget({ id: row.row_key, email: row.email })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" /> Revoke invitation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : row.row_type === "active" && row.user_id && canManage ? (
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
                          <KeyRound className="mr-2 h-4 w-4" /> Reset password
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TenantInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        initialRelationshipRole="academy_user"
        sendInvitationByDefault
        onSuccess={() => {
          setInviteOpen(false);
          void queryClient.invalidateQueries({ queryKey: academyTenantUsersKey(tenantId) });
        }}
      />

      <RevokeInviteAlert
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        invitationId={revokeTarget?.id ?? null}
        email={revokeTarget?.email ?? null}
        revoke={revoke}
      />
    </div>
  );
}
