import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, subDays, addDays } from 'date-fns';
import { Calendar, Clock, Users, Video, Plus, RefreshCw, Check, X, Sparkles, Link2, Loader2, Bug, CheckCircle, XCircle, AlertCircle, Bot } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOutlookCalendar, CalendarEvent, TimeDraft, getOutlookRedirectUri } from '@/hooks/useOutlookCalendar';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Debug panel for admins
interface DiagnosticsResult {
  tokenCount: number;
  eventsCount: number;
  lastSync: string | null;
  connected: boolean;
  redirectUri: string;
  origin: string;
}

function AdminDebugPanel() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [running, setRunning] = useState(false);
  const [testResults, setTestResults] = useState<{
    connection: 'pending' | 'pass' | 'fail';
    tokens: 'pending' | 'pass' | 'fail';
    sync: 'pending' | 'pass' | 'fail';
    events: 'pending' | 'pass' | 'fail';
  }>({
    connection: 'pending',
    tokens: 'pending',
    sync: 'pending',
    events: 'pending'
  });

  const runDiagnostics = async () => {
    setRunning(true);
    setTestResults({ connection: 'pending', tokens: 'pending', sync: 'pending', events: 'pending' });

    try {
      // Test 1: Connection status
      const { data: statusData } = await supabase.functions.invoke('outlook-auth', {
        body: { action: 'status' }
      });
      setTestResults(prev => ({ ...prev, connection: statusData?.connected ? 'pass' : 'fail' }));

      // Test 2: Check tokens in database
      const { count: tokenCount } = await supabase
        .from('oauth_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('provider', 'microsoft');
      setTestResults(prev => ({ ...prev, tokens: (tokenCount || 0) > 0 ? 'pass' : 'fail' }));

      // Test 3: Try sync (if connected)
      if (statusData?.connected) {
        try {
          const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-outlook-calendar', {});
          setTestResults(prev => ({ ...prev, sync: syncError ? 'fail' : 'pass' }));
        } catch {
          setTestResults(prev => ({ ...prev, sync: 'fail' }));
        }
      } else {
        setTestResults(prev => ({ ...prev, sync: 'fail' }));
      }

      // Test 4: Check events in database
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: eventsCount } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('provider', 'outlook')
        .gte('last_synced_at', sevenDaysAgo);
      setTestResults(prev => ({ ...prev, events: (eventsCount || 0) > 0 ? 'pass' : 'fail' }));

      // Get last sync time
      const { data: lastEvent } = await supabase
        .from('calendar_events')
        .select('last_synced_at')
        .eq('provider', 'outlook')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .single();

      setDiagnostics({
        tokenCount: tokenCount || 0,
        eventsCount: eventsCount || 0,
        lastSync: lastEvent?.last_synced_at || null,
        connected: statusData?.connected || false,
        redirectUri: getOutlookRedirectUri(),
        origin: window.location.origin
      });
    } catch (error) {
      console.error('Diagnostics error:', error);
    } finally {
      setRunning(false);
    }
  };

  const getStatusIcon = (status: 'pending' | 'pass' | 'fail') => {
    switch (status) {
      case 'pass': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'fail': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
          <Bug className="h-3 w-3 mr-1" /> Debug
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Outlook Integration Diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" onClick={runDiagnostics} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Run Diagnostics
            </Button>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.connection)}
                <span>Connection Status</span>
                <span className="text-muted-foreground ml-auto">{testResults.connection.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.tokens)}
                <span>Token Stored</span>
                <span className="text-muted-foreground ml-auto">{testResults.tokens.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.sync)}
                <span>Sync Works</span>
                <span className="text-muted-foreground ml-auto">{testResults.sync.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.events)}
                <span>Events Visible</span>
                <span className="text-muted-foreground ml-auto">{testResults.events.toUpperCase()}</span>
              </div>
            </div>

            {diagnostics && (
              <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
                <p><strong>Redirect URI:</strong> {diagnostics.redirectUri}</p>
                <p><strong>Origin:</strong> {diagnostics.origin}</p>
                <p><strong>Tokens:</strong> {diagnostics.tokenCount}</p>
                <p><strong>Events (7d):</strong> {diagnostics.eventsCount}</p>
                <p><strong>Last Sync:</strong> {diagnostics.lastSync ? format(new Date(diagnostics.lastSync), 'PPpp') : 'Never'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function CalendarTimeCapture() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { canAccessAdmin } = useRBAC();
  const { 
    loading, initializing, connected, events, drafts,
    connect, disconnect, syncCalendar, checkConnection,
    fetchEvents, fetchDrafts, createDraft, updateDraft, postDraft, discardDraft,
    runDiagnostics
  } = useOutlookCalendar();

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingDraft, setEditingDraft] = useState<TimeDraft | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [packages, setPackages] = useState<Array<{ id: number; name: string }>>([]);
  const [stages, setStages] = useState<Array<{ id: number; name: string }>>([]);

  // Iframe OAuth flow state
  const [awaitingOAuthReturn, setAwaitingOAuthReturn] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);

  // Filter state
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 14), 'yyyy-MM-dd'),
    end: format(addDays(new Date(), 7), 'yyyy-MM-dd')
  });

  // Draft form state
  const [draftForm, setDraftForm] = useState({
    client_id: null as number | null,
    package_id: null as number | null,
    stage_id: null as number | null,
    minutes: 0,
    work_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (connected) {
      fetchEvents({ startDate: dateRange.start, endDate: dateRange.end });
      fetchDrafts();
    }
  }, [connected, dateRange]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    if (data) setClients(data);
  };

  const fetchPackagesForClient = async (clientId: number) => {
    // Use package_instances as source of truth
    const { data: instances } = await supabase
      .from('package_instances')
      .select('package_id')
      .eq('tenant_id', clientId)
      .eq('is_complete', false);
    
    if (instances && instances.length > 0) {
      const packageIds = [...new Set(instances.map(i => i.package_id))];
      const { data: packages } = await supabase
        .from('packages')
        .select('id, name')
        .in('id', packageIds);
      setPackages((packages || []).map(p => ({ id: p.id, name: p.name })));
    } else {
      setPackages([]);
    }
  };

  const fetchStagesForPackage = async (packageId: number) => {
    const { data } = await supabase
      .from('package_stages')
      .select('stage:stages(id, name)')
      .eq('package_id', packageId);
    if (data) {
      setStages(data.map(s => ({ 
        id: (s.stage as { id: number; name: string }).id, 
        name: (s.stage as { id: number; name: string }).name 
      })));
    }
  };

  const handleConnect = async () => {
    const tenantId = profile?.tenant_id || 1; // Default to 1 for now
    const result = await connect(tenantId);
    
    if (result) {
      if (result.openedInNewTab) {
        // User needs to complete OAuth in new tab, then refresh connection
        setAwaitingOAuthReturn(true);
      } else if (result.authUrl) {
        // Popup was blocked, show fallback link
        setPendingAuthUrl(result.authUrl);
      }
    }
  };

  const handleRefreshConnection = async () => {
    const isNowConnected = await checkConnection();
    if (isNowConnected) {
      setAwaitingOAuthReturn(false);
      setPendingAuthUrl(null);
      // Trigger initial sync and fetch
      await syncCalendar();
      await fetchEvents({ startDate: dateRange.start, endDate: dateRange.end });
    }
  };

  const handleCreateDraft = async (event: CalendarEvent) => {
    const draftId = await createDraft(event.id);
    if (draftId) {
      // Find the created draft and open editor
      await fetchDrafts();
    }
  };

  const openDraftEditor = (draft: TimeDraft, event?: CalendarEvent) => {
    setEditingDraft(draft);
    setDraftForm({
      client_id: draft.client_id,
      package_id: draft.package_id,
      stage_id: draft.stage_id,
      minutes: draft.minutes,
      work_date: draft.work_date,
      notes: draft.notes || ''
    });
    if (draft.client_id) fetchPackagesForClient(draft.client_id);
    if (draft.package_id) fetchStagesForPackage(draft.package_id);
    setDraftDialogOpen(true);
  };

  const handleSaveDraft = async () => {
    if (!editingDraft) return;
    await updateDraft(editingDraft.id, {
      client_id: draftForm.client_id,
      package_id: draftForm.package_id,
      stage_id: draftForm.stage_id,
      minutes: draftForm.minutes,
      work_date: draftForm.work_date,
      notes: draftForm.notes
    });
    setDraftDialogOpen(false);
  };

  const handlePostDraft = async () => {
    if (!editingDraft) return;
    // Save first, then post
    await updateDraft(editingDraft.id, {
      client_id: draftForm.client_id,
      package_id: draftForm.package_id,
      stage_id: draftForm.stage_id,
      minutes: draftForm.minutes,
      work_date: draftForm.work_date,
      notes: draftForm.notes
    });
    const success = await postDraft(editingDraft.id);
    if (success) setDraftDialogOpen(false);
  };

  const handleDiscardDraft = async () => {
    if (!editingDraft) return;
    await discardDraft(editingDraft.id);
    setDraftDialogOpen(false);
  };

  const getDurationMinutes = (event: CalendarEvent) => {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    return Math.round((end.getTime() - start.getTime()) / 60000);
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getEventDraft = (eventId: string) => {
    return drafts.find(d => d.calendar_event_id === eventId);
  };

  // Show loading state while checking connection
  if (initializing) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading calendar...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!connected) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Time Capture</h1>
            <p className="text-muted-foreground">Log time from your calendar meetings</p>
          </div>
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Connect Outlook Calendar
              </CardTitle>
              <CardDescription>
                Connect your Microsoft Outlook calendar to import meetings and create time entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {awaitingOAuthReturn ? (
                <>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Complete the Microsoft login in the new tab, then click below.
                  </p>
                  <Button onClick={handleRefreshConnection} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Connection
                      </>
                    )}
                  </Button>
                </>
              ) : pendingAuthUrl ? (
                <>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Popup was blocked. Click the link below to open Microsoft login:
                  </p>
                  <a 
                    href={pendingAuthUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline text-sm"
                    onClick={() => setAwaitingOAuthReturn(true)}
                  >
                    Open Microsoft Login
                  </a>
                  <Button onClick={handleRefreshConnection} variant="outline" size="sm" disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    I've completed login
                  </Button>
                </>
              ) : (
                <Button onClick={handleConnect} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Outlook'
                  )}
                </Button>
              )}
              
              {canAccessAdmin && <AdminDebugPanel />}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Time Capture</h1>
            <p className="text-muted-foreground">Log time from your calendar meetings</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600 border-green-600">
              <Check className="h-3 w-3 mr-1" /> Connected
            </Badge>
            <Button variant="outline" size="sm" onClick={syncCalendar} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>From</Label>
                <Input 
                  type="date" 
                  value={dateRange.start}
                  onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label>To</Label>
                <Input 
                  type="date" 
                  value={dateRange.end}
                  onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-40"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Events list */}
          <Card>
            <CardHeader>
              <CardTitle>Meetings</CardTitle>
              <CardDescription>{events.length} events found</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : events.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No meetings found in this date range
                </p>
              ) : (
                events.map(event => {
                  const draft = getEventDraft(event.id);
                  const duration = getDurationMinutes(event);
                  const isProcessed = user && Array.isArray(event.processed_users) && 
                    (event.processed_users as string[]).includes(user.id);
                  return (
                    <div 
                      key={event.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedEvent?.id === event.id ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium truncate">{event.title}</h4>
                            {isProcessed && !draft && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Bot className="h-3 w-3" />
                                    Processed
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Auto-processed by time capture worker
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(event.start_at), 'MMM d, h:mm a')}
                            <span className="text-xs">({formatDuration(duration)})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {draft ? (
                            <Badge 
                              variant={draft.status === 'posted' ? 'default' : 'secondary'}
                              className="cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); openDraftEditor(draft, event); }}
                            >
                              {draft.status === 'posted' ? 'Posted' : 'Draft'}
                            </Badge>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); handleCreateDraft(event); }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Event detail */}
          <Card>
            <CardHeader>
              <CardTitle>Meeting Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEvent ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedEvent.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedEvent.start_at), 'EEEE, MMMM d, yyyy')}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {format(new Date(selectedEvent.start_at), 'h:mm a')} - 
                        {format(new Date(selectedEvent.end_at), 'h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatDuration(getDurationMinutes(selectedEvent))}
                      </span>
                    </div>
                  </div>

                  {selectedEvent.meeting_url && (
                    <a 
                      href={selectedEvent.meeting_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Video className="h-4 w-4" />
                      Join meeting
                    </a>
                  )}

                  {selectedEvent.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Link2 className="h-4 w-4" />
                      {selectedEvent.location}
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      {selectedEvent.description}
                    </div>
                  )}

                  <div className="pt-4">
                    {getEventDraft(selectedEvent.id) ? (
                      <Button onClick={() => openDraftEditor(getEventDraft(selectedEvent.id)!, selectedEvent)}>
                        Edit Draft
                      </Button>
                    ) : (
                      <Button onClick={() => handleCreateDraft(selectedEvent)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Time Entry
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-12">
                  Select a meeting to view details
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Draft editor dialog */}
        <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Time Entry Draft</DialogTitle>
              <DialogDescription>
                Review and confirm the time entry details
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {editingDraft && editingDraft.confidence > 0 && (
                <div className="flex items-center gap-2 p-2 bg-accent rounded-lg">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    {Math.round(Number(editingDraft.confidence) * 100)}% match confidence
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Client *</Label>
                <Select 
                  value={draftForm.client_id?.toString() || ''} 
                  onValueChange={(v) => {
                    const clientId = parseInt(v);
                    setDraftForm(prev => ({ ...prev, client_id: clientId, package_id: null, stage_id: null }));
                    fetchPackagesForClient(clientId);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Package</Label>
                <Select 
                  value={draftForm.package_id?.toString() || ''} 
                  onValueChange={(v) => {
                    const packageId = parseInt(v);
                    setDraftForm(prev => ({ ...prev, package_id: packageId, stage_id: null }));
                    fetchStagesForPackage(packageId);
                  }}
                  disabled={!draftForm.client_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Phase</Label>
                <Select 
                  value={draftForm.stage_id?.toString() || ''} 
                  onValueChange={(v) => setDraftForm(prev => ({ ...prev, stage_id: parseInt(v) }))}
                  disabled={!draftForm.package_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minutes *</Label>
                  <Input 
                    type="number" 
                    value={draftForm.minutes}
                    onChange={e => setDraftForm(prev => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Work Date *</Label>
                  <Input 
                    type="date" 
                    value={draftForm.work_date}
                    onChange={e => setDraftForm(prev => ({ ...prev, work_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  value={draftForm.notes}
                  onChange={e => setDraftForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="destructive" onClick={handleDiscardDraft}>
                <X className="h-4 w-4 mr-1" /> Discard
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={handleSaveDraft}>
                Save Draft
              </Button>
              <Button onClick={handlePostDraft} disabled={!draftForm.client_id || draftForm.minutes <= 0}>
                <Check className="h-4 w-4 mr-1" /> Post Time
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
