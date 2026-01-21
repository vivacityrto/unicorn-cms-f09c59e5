import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useProcess, useProcessVersions, useProcessAuditLog, useProcesses, getCategoryLabel, getStatusLabel, ProcessStatus } from '@/hooks/useProcesses';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  ArrowLeft, 
  Pencil, 
  Archive, 
  CheckCircle2,
  SendHorizontal,
  User,
  Calendar,
  Tag,
  FileText,
  History,
  Clock,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { sanitizeHtml } from '@/lib/sanitize';

function getStatusBadgeVariant(status: ProcessStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'approved': return 'default';
    case 'under_review': return 'secondary';
    case 'archived': return 'outline';
    default: return 'secondary';
  }
}

export default function ProcessDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: process, isLoading } = useProcess(id);
  const { data: versions } = useProcessVersions(id);
  const { data: auditLog } = useProcessAuditLog(id);
  const { submitForReview, approveProcess, archiveProcess } = useProcesses();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'content');
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);

  const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
  const isAdmin = profile?.unicorn_role === 'Admin';
  const canEdit = (isSuperAdmin || isAdmin) && process?.status !== 'archived';
  const canApprove = isSuperAdmin || isAdmin;
  const canSubmitForReview = process?.status === 'draft';

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!process) {
    return (
      <DashboardLayout>
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Process not found</h2>
          <p className="text-muted-foreground mb-4">The process you're looking for doesn't exist or you don't have access.</p>
          <Button onClick={() => navigate('/processes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Processes
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const getOwnerName = () => {
    if (!process.owner) return 'Unassigned';
    const { first_name, last_name, email } = process.owner;
    if (first_name || last_name) {
      return `${first_name || ''} ${last_name || ''}`.trim();
    }
    return email;
  };

  const handleSubmitForReview = async () => {
    await submitForReview.mutateAsync(process.id);
  };

  const handleApprove = async () => {
    await approveProcess.mutateAsync(process.id);
    setApproveDialogOpen(false);
  };

  const handleArchive = async () => {
    await archiveProcess.mutateAsync(process.id);
    setArchiveDialogOpen(false);
    navigate('/processes');
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      created: 'Created',
      updated: 'Updated',
      approved: 'Approved',
      submitted_for_review: 'Submitted for Review',
      archived: 'Archived',
      version_created: 'Version Created',
      edit_requested: 'Edit Requested',
    };
    return labels[action] || action;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/processes')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{process.title}</h1>
                <Badge variant={getStatusBadgeVariant(process.status)}>
                  {getStatusLabel(process.status)}
                </Badge>
                <Badge variant="outline">v{process.version}</Badge>
              </div>
              {process.short_description && (
                <p className="text-muted-foreground">{process.short_description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canSubmitForReview && (
              <Button variant="outline" onClick={handleSubmitForReview} disabled={submitForReview.isPending}>
                <SendHorizontal className="h-4 w-4 mr-2" />
                Submit for Review
              </Button>
            )}
            {canApprove && process.status === 'under_review' && (
              <Button onClick={() => setApproveDialogOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => navigate(`/processes/${process.id}/edit`)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => setArchiveDialogOpen(true)}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Metadata Card */}
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{getCategoryLabel(process.category)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Owner</p>
                  <p className="font-medium">{getOwnerName()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Review Date</p>
                  <p className="font-medium">
                    {process.review_date ? format(new Date(process.review_date), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Applies To</p>
                  <p className="font-medium capitalize">{process.applies_to.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(process.created_at), 'MMM d, yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{format(new Date(process.updated_at), 'MMM d, yyyy')}</p>
                </div>
              </div>
            </div>
            {process.tags && process.tags.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Tags:</span>
                  {process.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="content">
              <FileText className="h-4 w-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Version History
            </TabsTrigger>
            <TabsTrigger value="audit">
              <Shield className="h-4 w-4 mr-2" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6">
            <div className="grid gap-6">
              {process.purpose && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Purpose</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(process.purpose) }}
                    />
                  </CardContent>
                </Card>
              )}

              {process.scope && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Scope</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(process.scope) }}
                    />
                  </CardContent>
                </Card>
              )}

              {process.instructions && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Step-by-Step Instructions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(process.instructions) }}
                    />
                  </CardContent>
                </Card>
              )}

              {process.evidence_records && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Evidence / Records Generated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(process.evidence_records) }}
                    />
                  </CardContent>
                </Card>
              )}

              {process.related_standards && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Related Standards or EOS Tools</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(process.related_standards) }}
                    />
                  </CardContent>
                </Card>
              )}

              {!process.purpose && !process.scope && !process.instructions && !process.evidence_records && !process.related_standards && (
                <Card>
                  <CardContent className="py-16 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No content has been added to this process yet.</p>
                    {canEdit && (
                      <Button className="mt-4" onClick={() => navigate(`/processes/${process.id}/edit`)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Add Content
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Version History</CardTitle>
                <CardDescription>All published versions of this process</CardDescription>
              </CardHeader>
              <CardContent>
                {versions && versions.length > 0 ? (
                  <div className="space-y-4">
                    {versions.map((version) => (
                      <div key={version.id} className="flex items-start gap-4 p-4 border rounded-lg">
                        <Badge variant="outline">v{version.version}</Badge>
                        <div className="flex-1">
                          <p className="font-medium">{version.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {getStatusLabel(version.status as ProcessStatus)} • {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No version history available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Complete history of all changes to this process</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLog && auditLog.length > 0 ? (
                  <div className="space-y-4">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-4 p-4 border rounded-lg">
                        <Badge variant="secondary">{getActionLabel(entry.action)}</Badge>
                        <div className="flex-1">
                          <p className="font-medium">
                            {entry.actor?.first_name} {entry.actor?.last_name || entry.actor?.email || 'System'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                          {entry.reason && (
                            <p className="text-sm mt-1">Reason: {entry.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No audit entries available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Archive Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Process</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this process? This will hide it from the active list but preserve all version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Process</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the process as approved and lock it for editing. Any future edits will require a reason and create a new version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
