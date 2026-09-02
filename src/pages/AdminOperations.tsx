import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, RefreshCw, Download, Play, Pause, FileWarning, Mail, Settings, Activity } from 'lucide-react';
import { useOperationsDashboard } from '@/hooks/useOperationsDashboard';
import { format } from 'date-fns';

export default function AdminOperations() {
  const {
    loading,
    failedGenerations,
    failedEmails,
    settings,
    stats,
    fetchFailedGenerations,
    fetchFailedEmails,
    fetchSettings,
    fetchStats,
    updateSettings,
    retryGeneration,
    retryAllFailed,
    exportFailureReport
  } = useOperationsDashboard();

  const [daysFilter, setDaysFilter] = useState('7');
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchStats();
  }, [fetchSettings, fetchStats]);

  useEffect(() => {
    fetchFailedGenerations(parseInt(daysFilter));
    fetchFailedEmails(parseInt(daysFilter));
  }, [daysFilter, fetchFailedGenerations, fetchFailedEmails]);

  const handleRetry = async (docId: string) => {
    setRetrying(docId);
    await retryGeneration(docId);
    await fetchFailedGenerations(parseInt(daysFilter));
    setRetrying(null);
  };

  const handleRetryAll = async () => {
    if (!confirm('Retry all failed generations? This may take a while.')) return;
    await retryAllFailed();
  };

  const generationDisabled = settings && !settings.generation_enabled;
  const emailDisabled = settings && !settings.email_sending_enabled;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage document generation and email operations</p>
        </div>
        <Button variant="outline" onClick={() => { fetchStats(); fetchFailedGenerations(parseInt(daysFilter)); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Emergency Stop Banners */}
      {generationDisabled && (
        <Alert variant="destructive">
          <Pause className="h-4 w-4" />
          <AlertTitle>Document Generation Disabled</AlertTitle>
          <AlertDescription>
            Document generation is currently paused. No new documents will be generated until re-enabled.
          </AlertDescription>
        </Alert>
      )}
      {emailDisabled && (
        <Alert variant="destructive">
          <Pause className="h-4 w-4" />
          <AlertTitle>Email Sending Disabled</AlertTitle>
          <AlertDescription>
            Email sending is currently paused. No notification emails will be sent until re-enabled.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Generations (7d)</CardDescription>
            <CardTitle className="text-3xl">{stats?.failed_generations_7d ?? '-'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Generations (30d)</CardDescription>
            <CardTitle className="text-3xl">{stats?.failed_generations_30d ?? '-'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Emails (7d)</CardDescription>
            <CardTitle className="text-3xl">{stats?.failed_emails_7d ?? '-'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Generations</CardDescription>
            <CardTitle className="text-3xl">{stats?.pending_generations ?? '-'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Emergency Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Controls
          </CardTitle>
          <CardDescription>Emergency stop controls and rate limiting settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Document Generation</p>
              <p className="text-sm text-muted-foreground">Enable/disable all document generation</p>
            </div>
            <Switch
              checked={settings?.generation_enabled ?? true}
              onCheckedChange={(checked) => updateSettings({ generation_enabled: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Sending</p>
              <p className="text-sm text-muted-foreground">Enable/disable all notification emails</p>
            </div>
            <Switch
              checked={settings?.email_sending_enabled ?? true}
              onCheckedChange={(checked) => updateSettings({ email_sending_enabled: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Rate Limit</p>
              <p className="text-sm text-muted-foreground">Max generations per tenant per hour</p>
            </div>
            <span className="font-mono">{settings?.generation_rate_limit_per_hour ?? 50}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Max Retries</p>
              <p className="text-sm text-muted-foreground">Maximum retry attempts per document</p>
            </div>
            <span className="font-mono">{settings?.max_generation_retries ?? 3}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Failures */}
      <Tabs defaultValue="generations">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="generations" className="flex items-center gap-2">
              <FileWarning className="h-4 w-4" />
              Failed Generations ({failedGenerations.length})
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Failed Emails ({failedEmails.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Select value={daysFilter} onValueChange={setDaysFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="generations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Failed Document Generations</CardTitle>
                <CardDescription>Documents that failed to generate</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportFailureReport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetryAll}
                  disabled={failedGenerations.length === 0}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {failedGenerations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No failed generations in the selected period</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedGenerations.map((gen) => (
                      <TableRow key={gen.id}>
                        <TableCell>{gen.tenant_name || gen.tenant_id}</TableCell>
                        <TableCell>{gen.stage_title || gen.stage_id}</TableCell>
                        <TableCell>{gen.document_title || gen.source_document_id}</TableCell>
                        <TableCell className="max-w-xs truncate" title={gen.error_message || ''}>
                          {gen.error_message || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={gen.retry_count >= 3 ? 'destructive' : 'secondary'}>
                            {gen.retry_count}/3
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(gen.created_at), 'MMM d, HH:mm')}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetry(gen.id)}
                            disabled={retrying === gen.id || gen.retry_count >= 3}
                          >
                            {retrying === gen.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails">
          <Card>
            <CardHeader>
              <CardTitle>Failed Email Sends</CardTitle>
              <CardDescription>Notification emails that failed to send</CardDescription>
            </CardHeader>
            <CardContent>
              {failedEmails.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No failed emails in the selected period</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>{email.tenant_name || email.tenant_id}</TableCell>
                        <TableCell>{email.to_email}</TableCell>
                        <TableCell className="max-w-xs truncate">{email.subject}</TableCell>
                        <TableCell className="max-w-xs truncate" title={email.error_message || ''}>
                          {email.error_message || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{email.retry_count}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(email.created_at), 'MMM d, HH:mm')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
