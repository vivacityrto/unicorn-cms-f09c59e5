import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ArrowLeft, RefreshCcw, Link as LinkIcon, Ban, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAcademyTenantUsers } from "@/hooks/academy/useAcademyTenantUsers";
import { useAcademyInviteMutations } from "@/hooks/academy/useAcademyInviteMutations";
import { useAdminEnrollments } from "@/hooks/academy/useAcademyEnrollments";
import { useTenantSummaries } from "@/hooks/academy/useTenantAcademyAccess";
import { usePermission } from "@/hooks/usePermission";
import { RolePill, StatusDot, UserCell } from "@/components/client/users/UserStatusDisplay";
import RevokeInviteAlert from "@/components/client/users/RevokeInviteAlert";
import { cn } from "@/lib/utils";

/**
 * Per-Academy-user detail view — reached from the nested user list on
 * AcademyTenantAccessPage (or, later, directly). Same resend/copy-link/
 * revoke/reset-password controls as the nested list's row dropdown, just as
 * full buttons plus this learner's course enrolments.
 */
export default function AcademyTenantUserDetail() {
  const { tenantId, rowKey } = useParams();
  const navigate = useNavigate();
  const tenantIdNum = tenantId ? parseInt(tenantId, 10) : null;
  const canManage = usePermission('academy.tenant_access.manage');

  const { data: tenants = [], isLoading: tenantsLoading } = useTenantSummaries();
  const tenant = useMemo(() => tenants.find((t) => t.id === tenantIdNum) ?? null, [tenants, tenantIdNum]);

  const { data: rows = [], isLoading: rowsLoading } = useAcademyTenantUsers(tenantIdNum);
  const row = useMemo(() => rows.find((r) => r.row_key === rowKey) ?? null, [rows, rowKey]);
  const isLoading = tenantsLoading || rowsLoading;

  const { resend, revoke, copyLink, resetPassword } = useAcademyInviteMutations(tenantIdNum);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const { data: allEnrollments = [], isLoading: enrollmentsLoading } = useAdminEnrollments();
  const enrollments = useMemo(
    () => allEnrollments.filter((e) => e.tenant_id === tenantIdNum && e.user_id === row?.user_id),
    [allEnrollments, tenantIdNum, row?.user_id],
  );

  const statusChip = (status: string | null, expiresAt: string | null) => {
    const expired = status === "active" && !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    const label = expired ? "expired" : status || "—";
    let tone = "bg-muted text-muted-foreground";
    if (expired) tone = "bg-red-100 text-red-700";
    else if (status === "active") tone = "bg-green-100 text-green-700";
    else if (status === "completed") tone = "bg-blue-100 text-blue-700";
    else if (status === "revoked") tone = "bg-red-100 text-red-700";
    return (
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>
        {label}
      </span>
    );
  };

  const backTo = tenantIdNum ? `/superadmin/academy/tenant/${tenantIdNum}` : "/superadmin/academy/tenant-access";

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!row || !tenant) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Academy user not found.</p>
        <Button variant="outline" onClick={() => navigate(backTo)}>Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate(backTo)}>
        <ArrowLeft className="h-4 w-4" /> Back to {tenant.name}
      </Button>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <UserCell row={row} />
            <div className="flex items-center gap-2 flex-wrap">
              <RolePill row={row} />
              <StatusDot row={row} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground">Member since</p>
              <p className="font-medium">
                {row.member_since ? format(new Date(row.member_since), "dd MMM yyyy") : "—"}
              </p>
            </div>
            {row.row_type === "invited" ? (
              <div>
                <p className="text-muted-foreground">Invite expires</p>
                <p className="font-medium">
                  {row.invite_expires_at ? format(new Date(row.invite_expires_at), "dd MMM yyyy") : "—"}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground">Last active</p>
                <p className="font-medium">
                  {row.last_active_at ? formatDistanceToNow(parseISO(row.last_active_at), { addSuffix: true }) : "Never"}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Last invite sent</p>
              <p className="font-medium">
                {row.last_sent_at ? formatDistanceToNow(parseISO(row.last_sent_at), { addSuffix: true }) : "—"}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {row.row_type === "invited" ? (
                <>
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => resend.mutate(row.row_key)} disabled={resend.isPending}
                  >
                    <RefreshCcw className="h-4 w-4" /> Resend invitation
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => copyLink.mutate(row.row_key)} disabled={copyLink.isPending}
                  >
                    <LinkIcon className="h-4 w-4" /> Copy invite link
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive"
                    onClick={() => setRevokeOpen(true)}
                  >
                    <Ban className="h-4 w-4" /> Revoke invitation
                  </Button>
                </>
              ) : row.user_id ? (
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => resetPassword.mutate(row.user_id!)} disabled={resetPassword.isPending}
                >
                  <KeyRound className="h-4 w-4" /> Reset password
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course Enrolments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollmentsLoading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!enrollmentsLoading && !row.user_id && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                    Not enrolled yet — invitation still pending.
                  </TableCell>
                </TableRow>
              )}
              {!enrollmentsLoading && row.user_id && enrollments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                    No course enrolments yet
                  </TableCell>
                </TableRow>
              )}
              {!enrollmentsLoading && enrollments.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.course?.title ?? "—"}</TableCell>
                  <TableCell>{statusChip(e.status, e.expires_at)}</TableCell>
                  <TableCell>{e.enrolled_at ? format(new Date(e.enrolled_at), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell>{e.completed_at ? format(new Date(e.completed_at), "dd MMM yyyy") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RevokeInviteAlert
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        invitationId={row.row_type === "invited" ? row.row_key : null}
        email={row.email}
        revoke={revoke}
      />
    </div>
  );
}
