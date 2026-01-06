import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserAudit, UserAuditRecord } from '@/hooks/useUserAudit';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Download, Play, AlertTriangle, CheckCircle2, Users, Mail, UserX, Link2, FileWarning, Search, Filter, Wrench, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-500/10 text-green-700 border-green-200',
  missing_auth: 'bg-red-500/10 text-red-700 border-red-200',
  email_mismatch: 'bg-orange-500/10 text-orange-700 border-orange-200',
  no_membership: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  disabled: 'bg-gray-500/10 text-gray-700 border-gray-200',
  archived: 'bg-gray-500/10 text-gray-700 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  ok: 'OK',
  missing_auth: 'Missing Auth',
  email_mismatch: 'Email Mismatch',
  no_membership: 'No Membership',
  disabled: 'Disabled',
  archived: 'Archived',
};

export default function AdminUserAudit() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const {
    summary,
    loadingSummary,
    userAuditData,
    loadingUserAudit,
    filters,
    setFilters,
    tenants,
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
    fixUserLinkage,
    isFixingProfileLinkage,
    isFixingMemberships,
    isFixingInvitations,
    isFixingUserLinkage,
    refetchAll,
  } = useUserAudit();

  const [dryRunResult, setDryRunResult] = useState<{
    type: 'profile' | 'membership' | 'invitation';
    result: Record<string, unknown>;
  } | null>(null);
  const [confirmApply, setConfirmApply] = useState<'profile' | 'membership' | 'invitation' | null>(null);
  const [activeTab, setActiveTab] = useState('users');

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

  const handleFixUser = async (user: UserAuditRecord) => {
    await fixUserLinkage(user.user_uuid);
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

  const issueCount = userAuditData?.filter(u => u.computed_status !== 'ok').length || 0;
  const okCount = userAuditData?.filter(u => u.computed_status === 'ok').length || 0;

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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">
              User Table ({userAuditData?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="repairs">
              Bulk Repairs
            </TabsTrigger>
            <TabsTrigger value="details">
              Issue Details
            </TabsTrigger>
          </TabsList>

          {/* User Table Tab */}
          <TabsContent value="users" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  
                  <Select 
                    value={filters.roleFilter || 'all'} 
                    onValueChange={(v) => setFilters({ ...filters, roleFilter: v === 'all' ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="Super Admin">Super Admin</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="User">User</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select 
                    value={filters.tenantFilter?.toString() || 'all'} 
                    onValueChange={(v) => setFilters({ ...filters, tenantFilter: v === 'all' ? null : parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tenants</SelectItem>
                      {tenants?.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select 
                    value={filters.statusFilter || 'all'} 
                    onValueChange={(v) => setFilters({ ...filters, statusFilter: v === 'all' ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="ok">OK</SelectItem>
                      <SelectItem value="missing_auth">Missing Auth</SelectItem>
                      <SelectItem value="email_mismatch">Email Mismatch</SelectItem>
                      <SelectItem value="no_membership">No Membership</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* User Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>User Audit Table</CardTitle>
                  <CardDescription>
                    {okCount} OK, {issueCount} with issues
                  </CardDescription>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => exportCsv(userAuditData || [], 'user_audit')}
                  disabled={!userAuditData?.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {loadingUserAudit ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : !userAuditData?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No users match the current filters
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role / Type</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Status Flags</TableHead>
                          <TableHead>Memberships</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userAuditData.slice(0, 100).map((user) => (
                          <TableRow key={user.user_uuid}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.first_name} {user.last_name}</div>
                                <div className="text-xs text-muted-foreground">{user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{user.unicorn_role}</div>
                                <div className="text-xs text-muted-foreground">{user.user_type}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{user.tenant_name || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Badge 
                                  variant="outline" 
                                  className={STATUS_COLORS[user.computed_status] || ''}
                                >
                                  {STATUS_LABELS[user.computed_status] || user.computed_status}
                                </Badge>
                                {user.auth_user_exists && (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-700 text-xs">Auth ✓</Badge>
                                )}
                                {user.has_active_membership && (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 text-xs">Member ✓</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{user.tenant_memberships_count}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {user.last_sign_in_at 
                                  ? format(new Date(user.last_sign_in_at), 'MMM d, yyyy')
                                  : 'Never'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => navigate(`/user-profile/${user.user_uuid}`)}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                                {user.computed_status !== 'ok' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleFixUser(user)}
                                    disabled={isFixingUserLinkage}
                                  >
                                    <Wrench className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {userAuditData.length > 100 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Showing 100 of {userAuditData.length} rows. Export CSV for full data.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bulk Repairs Tab */}
          <TabsContent value="repairs">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Repair Actions</CardTitle>
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
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
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
                  description="Users in auth.users that have no matching public.users row"
                  loading={loadingOrphanAuth}
                  data={orphanAuthUsers || []}
                  columns={['auth_user_id', 'email', 'created_at', 'last_sign_in_at', 'issue']}
                  onExport={() => exportCsv(orphanAuthUsers || [], 'orphan_auth_users')}
                />
              </TabsContent>

              <TabsContent value="orphan-profiles">
                <AuditTable
                  title="Orphan Profiles"
                  description="Profiles with null or invalid user_uuid"
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