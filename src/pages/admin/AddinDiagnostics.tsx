import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Calendar,
  Mail,
  FileText,
  Clock,
  User,
  Eye,
  EyeOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface AuditEvent {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface UsageStats {
  total_email_captures: number;
  total_meeting_captures: number;
  total_attachments_linked: number;
  total_time_drafts: number;
  total_failed_actions: number;
}

// Sensitive fields to redact in the UI
const SENSITIVE_FIELDS = ['external_message_id', 'external_event_id', 'token', 'password', 'secret', 'api_key'];

function redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
      redacted[key] = typeof value === 'string' && value.length > 8 
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function getActionIcon(action: string) {
  if (action.includes('email')) return <Mail className="h-4 w-4" />;
  if (action.includes('meeting') || action.includes('time_draft')) return <Calendar className="h-4 w-4" />;
  if (action.includes('document') || action.includes('attachment')) return <FileText className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

function getActionBadgeVariant(action: string): "default" | "destructive" | "secondary" | "outline" {
  if (action.includes('failed')) return 'destructive';
  if (action.includes('created') || action.includes('linked') || action.includes('captured')) return 'default';
  return 'secondary';
}

export default function AddinDiagnostics() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showRawDetails, setShowRawDetails] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Fetch usage stats
  const { data: usageStats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['addin-usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      // Get email captures
      const { count: emailCaptures } = await supabase
        .from('email_link_audit')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'email_linked');

      // Get meeting captures
      const { count: meetingCaptures } = await supabase
        .from('meeting_capture_audit')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'meeting_captured');

      // Get time drafts
      const { count: timeDrafts } = await supabase
        .from('meeting_capture_audit')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'time_draft_created');

      // Get attachments linked
      const { count: attachmentsLinked } = await supabase
        .from('audit_events')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'document_linked_from_email');

      // Get failed actions
      const { count: failedActions } = await supabase
        .from('audit_events')
        .select('*', { count: 'exact', head: true })
        .like('action', '%_failed');

      return {
        total_email_captures: emailCaptures || 0,
        total_meeting_captures: meetingCaptures || 0,
        total_attachments_linked: attachmentsLinked || 0,
        total_time_drafts: timeDrafts || 0,
        total_failed_actions: failedActions || 0,
      };
    },
  });

  // Fetch recent audit events
  const { data: recentEvents, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['addin-audit-events', searchQuery],
    queryFn: async (): Promise<AuditEvent[]> => {
      let query = supabase
        .from('audit_events')
        .select('id, action, entity, entity_id, user_id, details, created_at')
        .eq('entity', 'addin')
        .order('created_at', { ascending: false })
        .limit(50);

      if (searchQuery) {
        query = query.or(`action.ilike.%${searchQuery}%,entity_id.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as AuditEvent[];
    },
  });

  // Fetch failed actions
  const { data: failedActions, isLoading: failedLoading, refetch: refetchFailed } = useQuery({
    queryKey: ['addin-failed-actions'],
    queryFn: async (): Promise<AuditEvent[]> => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('id, action, entity, entity_id, user_id, details, created_at')
        .like('action', '%_failed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as AuditEvent[];
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchEvents();
    refetchFailed();
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="h-8 w-8" />
            Add-in Diagnostics
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor add-in usage, view audit logs, and troubleshoot issues
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Mail className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : usageStats?.total_email_captures || 0}
              </p>
              <p className="text-sm text-muted-foreground">Emails Captured</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Calendar className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : usageStats?.total_meeting_captures || 0}
              </p>
              <p className="text-sm text-muted-foreground">Meetings Captured</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <FileText className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : usageStats?.total_attachments_linked || 0}
              </p>
              <p className="text-sm text-muted-foreground">Attachments Linked</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : usageStats?.total_time_drafts || 0}
              </p>
              <p className="text-sm text-muted-foreground">Time Drafts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-destructive" />
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : usageStats?.total_failed_actions || 0}
              </p>
              <p className="text-sm text-muted-foreground">Failed Actions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="failed" className="flex items-center gap-2">
            Failed Actions
            {(usageStats?.total_failed_actions || 0) > 0 && (
              <Badge variant="destructive" className="text-xs">
                {usageStats?.total_failed_actions}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRawDetails(!showRawDetails)}
            >
              {showRawDetails ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showRawDetails ? 'Hide' : 'Show'} Details
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add-in Activity Log</CardTitle>
              <CardDescription>
                Recent actions performed through the add-in. Sensitive data is automatically redacted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentEvents?.length === 0 ? (
                <Alert>
                  <Activity className="h-4 w-4" />
                  <AlertDescription>No add-in activity recorded yet.</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {recentEvents?.map((event) => (
                    <div
                      key={event.id}
                      className={`p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                        selectedEventId === event.id ? 'bg-muted border-primary' : ''
                      }`}
                      onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getActionIcon(event.action)}
                          <div>
                            <Badge variant={getActionBadgeVariant(event.action)}>
                              {event.action.replace(/_/g, ' ')}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {event.entity_id}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          </p>
                          {event.user_id && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                              <User className="h-3 w-3" />
                              {event.user_id.substring(0, 8)}...
                            </p>
                          )}
                        </div>
                      </div>
                      {showRawDetails && selectedEventId === event.id && event.details && (
                        <>
                          <Separator className="my-2" />
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(redactSensitiveData(event.details as Record<string, unknown>), null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Failed Actions
              </CardTitle>
              <CardDescription>
                Actions that encountered errors. Use this to troubleshoot issues.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {failedLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : failedActions?.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>No failed actions recorded. Everything is working correctly!</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {failedActions?.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border border-destructive/50 bg-destructive/5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <div>
                            <Badge variant="destructive">
                              {event.action.replace(/_/g, ' ')}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {event.entity_id}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(event.created_at), 'PPp')}
                          </p>
                        </div>
                      </div>
                      {event.details && (
                        <>
                          <Separator className="my-2" />
                          <div className="text-sm">
                            {(event.details as Record<string, unknown>).error_code && (
                              <p className="text-destructive font-medium">
                                Error: {String((event.details as Record<string, unknown>).error_code)}
                              </p>
                            )}
                            {(event.details as Record<string, unknown>).error_message && (
                              <p className="text-muted-foreground">
                                {String((event.details as Record<string, unknown>).error_message)}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
