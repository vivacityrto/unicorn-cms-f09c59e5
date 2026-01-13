import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StageVersion } from '@/hooks/useStageVersions';
import { format } from 'date-fns';
import { 
  FileText, 
  Users, 
  Mail, 
  CheckSquare,
  Calendar,
} from 'lucide-react';

interface VersionSnapshotViewerProps {
  version: StageVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionSnapshotViewer({
  version,
  open,
  onOpenChange,
}: VersionSnapshotViewerProps) {
  if (!version) return null;

  const { snapshot } = version;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Version {version.version_number} Snapshot
            <Badge variant="outline">{version.status}</Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Published {format(new Date(version.created_at), 'PPpp')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh]">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="team-tasks">Team Tasks</TabsTrigger>
              <TabsTrigger value="client-tasks">Client Tasks</TabsTrigger>
              <TabsTrigger value="emails">Emails</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Phase Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{snapshot.stage.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline">{snapshot.stage.type}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Package Type</span>
                    <span>{snapshot.stage.package_type || 'Any'}</span>
                  </div>
                  {snapshot.stage.is_certified && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Certified</span>
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        Yes
                      </Badge>
                    </div>
                  )}
                  {snapshot.stage.description && (
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground block mb-1">Description</span>
                      <p>{snapshot.stage.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {version.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Release Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{version.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Content Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Content Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{snapshot.team_tasks.length} Team Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{snapshot.client_tasks.length} Client Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{snapshot.emails.length} Emails</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{snapshot.documents.length} Documents</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team-tasks" className="mt-4">
              <div className="space-y-2">
                {snapshot.team_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No team tasks</p>
                ) : (
                  snapshot.team_tasks.map((task, idx) => (
                    <Card key={idx}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{task.name}</p>
                            {task.description && (
                              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {task.owner_role && (
                              <Badge variant="outline" className="text-xs">{task.owner_role}</Badge>
                            )}
                            {task.is_mandatory && (
                              <Badge className="text-xs">Required</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="client-tasks" className="mt-4">
              <div className="space-y-2">
                {snapshot.client_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No client tasks</p>
                ) : (
                  snapshot.client_tasks.map((task, idx) => (
                    <Card key={idx}>
                      <CardContent className="py-3">
                        <p className="font-medium text-sm">{task.name}</p>
                        {task.instructions && (
                          <p className="text-sm text-muted-foreground mt-1">{task.instructions}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="emails" className="mt-4">
              <div className="space-y-2">
                {snapshot.emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No emails configured</p>
                ) : (
                  snapshot.emails.map((email, idx) => (
                    <Card key={idx}>
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{email.template_name || 'Email Template'}</p>
                            <p className="text-xs text-muted-foreground">
                              Trigger: {email.trigger_type} • Recipient: {email.recipient_type}
                            </p>
                          </div>
                          <Badge variant={email.is_active ? 'default' : 'secondary'}>
                            {email.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <div className="space-y-2">
                {snapshot.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No documents linked</p>
                ) : (
                  snapshot.documents.map((doc, idx) => (
                    <Card key={idx}>
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{doc.document_name || `Document ${doc.document_id}`}</span>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">{doc.visibility}</Badge>
                            <Badge variant="outline" className="text-xs">{doc.delivery_type}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
