import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserAudit } from '@/hooks/useUserAudit';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Download, Play, AlertTriangle, CheckCircle2, Users, Mail, UserX, Link2, FileWarning } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminUserAudit() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const {
    summary,
    loadingSummary,
    orphanAuthUsers,
    orphanProfiles,
    emailMismatches,
    duplicateEmails,
    usersWithoutMembership,
    invalidMemberships,
    invitationIssues,
    loadingOrphanAuth,
    loadingOrphanProfiles,
    loadingEmailMismatches,
    loadingDuplicateEmails,
    loadingUsersWithoutMembership,
    loadingInvalidMemberships,
    loadingInvitationIssues,
    fixProfileLinkage,
    fixMemberships,
    fixInvitations,
    isFixingProfileLinkage,
    isFixingMemberships,
    isFixingInvitations,
    refetchAll,
  } = useUserAudit();

  const [dryRunResult, setDryRunResult] = useState<{
    type: 'profile' | 'membership' | 'invitation';
    result: Record<string, unknown>;
  } | null>(null);
  const [confirmApply, setConfirmApply] = useState<'profile' | 'membership' | 'invitation' | null>(null);

  // Gate: SuperAdmin only
  if (authLoading) {
    return (
      <AppLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuperAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleDryRun = async (type: 'profile' | 'membership' | 'invitation') => {
    let result;
    if (type === 'profile') {
      result = await fixProfileLinkage(true);
    } else if (type === 'membership') {
      result = await fixMemberships(true);
    } else {
      result = await fixInvitations(true);
    }
    setDryRunResult({ type, result: result as Record<string, unknown> });
  };

  const handleApply = async () => {
    if (!confirmApply) return;
    
    if (confirmApply === 'profile') {
      await fixProfileLinkage(false);
    } else if (confirmApply === 'membership') {
      await fixMemberships(false);
    } else {
      await fixInvitations(false);
    }
    setConfirmApply(null);
    setDryRunResult(null);
    refetchAll();
  };

  const exportCsv = (data: unknown[], filename: string) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0] as object);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalIssues = summary ? (
    summary.orphan_auth_users +
    summary.orphan_profiles +
    summary.email_mismatches +
    summary.duplicate_emails +
    summary.users_without_membership +
    summary.invalid_memberships +
    summary.invitation_issues
  ) : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Audit</h1>
            <p className="text-muted-foreground">Detect and fix broken user states</p>
          </div>
          <Button onClick={refetchAll} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <SummaryCard
            label="Orphan Auth"
            count={summary?.orphan_auth_users}
            loading={loadingSummary}
            icon={<UserX className="h-4 w-4" />}
          />
          <SummaryCard
            label="Orphan Profiles"
            count={summary?.orphan_profiles}
            loading={loadingSummary}
            icon={<Users className="h-4 w-4" />}
          />
          <SummaryCard
            label="Email Mismatches"
            count={summary?.email_mismatches}
            loading={loadingSummary}
            icon={<Mail className="h-4 w-4" />}
          />
          <SummaryCard
            label="Duplicate Emails"
            count={summary?.duplicate_emails}
            loading={loadingSummary}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <SummaryCard
            label="No Membership"
            count={summary?.users_without_membership}
            loading={loadingSummary}
            icon={<Link2 className="h-4 w-4" />}
          />
          <SummaryCard
            label="Invalid Members"
            count={summary?.invalid_memberships}
            loading={loadingSummary}
            icon={<FileWarning className="h-4 w-4" />}
          />
          <SummaryCard
            label="Invite Issues"
            count={summary?.invitation_issues}
            loading={loadingSummary}
            icon={<Mail className="h-4 w-4" />}
          />
        </div>

        {/* Status Banner */}
        <Card className={totalIssues === 0 ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'}>
          <CardContent className="py-4 flex items-center gap-3">
            {totalIssues === 0 ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-green-700 dark:text-green-300 font-medium">All user states are healthy</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                  {totalIssues} issue{totalIssues !== 1 ? 's' : ''} detected
                </span>
              </>
            )}
          </CardContent>
        </Card>

        {/* Repair Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Repair Actions</CardTitle>
            <CardDescription>Run dry-run first to preview changes, then apply if safe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <RepairCard
                title="Fix Profile Linkage"
                description="Link profiles to auth.users by email, fill missing emails"
                onDryRun={() => handleDryRun('profile')}
                onApply={() => setConfirmApply('profile')}
                loading={isFixingProfileLinkage}
                dryRunResult={dryRunResult?.type === 'profile' ? dryRunResult.result : null}
              />
              <RepairCard
                title="Fix Memberships"
                description="Create missing tenant_members for accepted invitations"
                onDryRun={() => handleDryRun('membership')}
                onApply={() => setConfirmApply('membership')}
                loading={isFixingMemberships}
                dryRunResult={dryRunResult?.type === 'membership' ? dryRunResult.result : null}
              />
              <RepairCard
                title="Fix Invitations"
                description="Mark expired invitations, clean up redundant ones"
                onDryRun={() => handleDryRun('invitation')}
                onApply={() => setConfirmApply('invitation')}
                loading={isFixingInvitations}
                dryRunResult={dryRunResult?.type === 'invitation' ? dryRunResult.result : null}
              />
            </div>
          </CardContent>
        </Card>

        {/* Detailed Tabs */}
        <Tabs defaultValue="orphan-auth" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="orphan-auth">Orphan Auth ({orphanAuthUsers?.length || 0})</TabsTrigger>
            <TabsTrigger value="orphan-profiles">Orphan Profiles ({orphanProfiles?.length || 0})</TabsTrigger>
            <TabsTrigger value="email-mismatch">Email Mismatches ({emailMismatches?.length || 0})</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates ({duplicateEmails?.length || 0})</TabsTrigger>
            <TabsTrigger value="no-membership">No Membership ({usersWithoutMembership?.length || 0})</TabsTrigger>
            <TabsTrigger value="invalid-members">Invalid Members ({invalidMemberships?.length || 0})</TabsTrigger>
            <TabsTrigger value="invite-issues">Invite Issues ({invitationIssues?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="orphan-auth">
            <AuditTable
              title="Auth Users Without Profiles"
              description="Users in auth.users that have no matching public.profiles row"
              loading={loadingOrphanAuth}
              data={orphanAuthUsers || []}
              columns={['auth_user_id', 'email', 'created_at', 'last_sign_in_at', 'issue']}
              onExport={() => exportCsv(orphanAuthUsers || [], 'orphan_auth_users')}
            />
          </TabsContent>

          <TabsContent value="orphan-profiles">
            <AuditTable
              title="Orphan Profiles"
              description="Profiles with null or invalid user_id"
              loading={loadingOrphanProfiles}
              data={orphanProfiles || []}
              columns={['profile_id', 'profile_email', 'user_id', 'created_at', 'issue']}
              onExport={() => exportCsv(orphanProfiles || [], 'orphan_profiles')}
            />
          </TabsContent>

          <TabsContent value="email-mismatch">
            <AuditTable
              title="Email Mismatches"
              description="Profiles where email differs from auth.users email"
              loading={loadingEmailMismatches}
              data={emailMismatches || []}
              columns={['user_id', 'auth_email', 'profile_email', 'profile_id', 'issue']}
              onExport={() => exportCsv(emailMismatches || [], 'email_mismatches')}
            />
          </TabsContent>

          <TabsContent value="duplicates">
            <AuditTable
              title="Duplicate Emails"
              description="Emails that appear multiple times"
              loading={loadingDuplicateEmails}
              data={duplicateEmails || []}
              columns={['email_lower', 'count_profiles', 'count_auth']}
              onExport={() => exportCsv(duplicateEmails || [], 'duplicate_emails')}
            />
          </TabsContent>

          <TabsContent value="no-membership">
            <AuditTable
              title="Users Without Membership"
              description="Non-SuperAdmin users with no active tenant membership"
              loading={loadingUsersWithoutMembership}
              data={usersWithoutMembership || []}
              columns={['user_id', 'email', 'global_role', 'created_at', 'issue']}
              onExport={() => exportCsv(usersWithoutMembership || [], 'users_without_membership')}
            />
          </TabsContent>

          <TabsContent value="invalid-members">
            <AuditTable
              title="Invalid Memberships"
              description="Memberships with missing tenants, users, or invalid values"
              loading={loadingInvalidMemberships}
              data={invalidMemberships || []}
              columns={['membership_id', 'user_id', 'tenant_id', 'role', 'status', 'issue']}
              onExport={() => exportCsv(invalidMemberships || [], 'invalid_memberships')}
            />
          </TabsContent>

          <TabsContent value="invite-issues">
            <AuditTable
              title="Invitation Issues"
              description="Invitations with inconsistent states"
              loading={loadingInvitationIssues}
              data={invitationIssues || []}
              columns={['invitation_id', 'email', 'tenant_id', 'status', 'unicorn_role', 'expires_at', 'issue']}
              onExport={() => exportCsv(invitationIssues || [], 'invitation_issues')}
            />
          </TabsContent>
        </Tabs>

        {/* Confirm Apply Dialog */}
        <AlertDialog open={!!confirmApply} onOpenChange={() => setConfirmApply(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Apply Fix</AlertDialogTitle>
              <AlertDialogDescription>
                This will modify database records. This action cannot be easily undone.
                Are you sure you want to apply the fix?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleApply}>Apply Fix</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// Sub-components
function SummaryCard({ label, count, loading, icon }: {
  label: string;
  count?: number;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="text-2xl font-bold">
            {count ?? 0}
            {count && count > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">!</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RepairCard({ title, description, onDryRun, onApply, loading, dryRunResult }: {
  title: string;
  description: string;
  onDryRun: () => void;
  onApply: () => void;
  loading: boolean;
  dryRunResult: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onDryRun} disabled={loading}>
            <Play className="h-3 w-3 mr-1" />
            Dry Run
          </Button>
          <Button size="sm" onClick={onApply} disabled={loading || !dryRunResult}>
            Apply
          </Button>
        </div>
        {dryRunResult && (
          <div className="text-xs bg-muted p-2 rounded">
            <pre className="whitespace-pre-wrap overflow-auto max-h-32">
              {JSON.stringify(dryRunResult.counts, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditTable({ title, description, loading, data, columns, onExport }: {
  title: string;
  description: string;
  loading: boolean;
  data: unknown[];
  columns: string[];
  onExport: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={!data.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            No issues found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(col => (
                    <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 100).map((row, i) => (
                  <TableRow key={i}>
                    {columns.map(col => (
                      <TableCell key={col} className="text-xs max-w-xs truncate">
                        {formatCell((row as Record<string, unknown>)[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.length > 100 && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing 100 of {data.length} rows. Export CSV for full data.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      return format(new Date(value), 'MMM d, yyyy HH:mm');
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
