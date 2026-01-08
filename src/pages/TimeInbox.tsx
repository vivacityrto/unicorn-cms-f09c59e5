import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { Inbox, Clock, Calendar, Check, X, Edit, ChevronDown, Filter, Users, Building2, DollarSign, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useTimeInbox, TimeDraftRow, DateFilter, ConfidenceFilter } from '@/hooks/useTimeInbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.85) {
    return <Badge variant="default" className="bg-green-600">High</Badge>;
  } else if (confidence >= 0.5) {
    return <Badge variant="secondary">Medium</Badge>;
  } else {
    return <Badge variant="outline" className="text-amber-600 border-amber-600">Low</Badge>;
  }
}

export default function TimeInbox() {
  const { profile } = useAuth();
  const {
    loading,
    drafts,
    stats,
    selectedIds,
    dateFilter,
    setDateFilter,
    customDateRange,
    setCustomDateRange,
    confidenceFilter,
    setConfidenceFilter,
    fetchDrafts,
    updateDraft,
    postDraft,
    discardDraft,
    bulkPost,
    bulkDiscard,
    toggleSelection,
    selectAll,
    clearSelection
  } = useTimeInbox();

  // Drawer state
  const [editingDraft, setEditingDraft] = useState<TimeDraftRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for drawer
  const [formData, setFormData] = useState({
    client_id: null as number | null,
    package_id: null as number | null,
    stage_id: null as number | null,
    work_type: 'meeting',
    is_billable: true,
    minutes: 0,
    work_date: '',
    notes: ''
  });

  // Lookup data
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [packages, setPackages] = useState<Array<{ id: number; name: string }>>([]);
  const [stages, setStages] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    if (data) setClients(data);
  };

  const fetchPackagesForClient = async (clientId: number) => {
    const { data } = await supabase
      .from('client_packages')
      .select('id, package_id, packages(name)')
      .eq('tenant_id', clientId)
      .eq('status', 'active');
    if (data) {
      setPackages(data.map(p => ({ 
        id: p.package_id, 
        name: (p.packages as { name: string })?.name || 'Unknown' 
      })));
    }
  };

  const fetchStagesForPackage = async (packageId: number) => {
    const { data } = await supabase
      .from('package_stages')
      .select('stage_id, documents_stages(title)')
      .eq('package_id', packageId);
    if (data) {
      setStages(data.map(s => ({ 
        id: s.stage_id, 
        name: (s.documents_stages as unknown as { title: string })?.title || 'Unknown' 
      })));
    }
  };

  const openDrawer = (draft: TimeDraftRow) => {
    setEditingDraft(draft);
    setFormData({
      client_id: draft.client_id,
      package_id: draft.package_id,
      stage_id: draft.stage_id,
      work_type: draft.work_type || 'meeting',
      is_billable: draft.is_billable ?? true,
      minutes: draft.minutes,
      work_date: draft.work_date,
      notes: draft.notes || ''
    });
    if (draft.client_id) fetchPackagesForClient(draft.client_id);
    if (draft.package_id) fetchStagesForPackage(draft.package_id);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!editingDraft) return;
    setSaving(true);
    const success = await updateDraft(editingDraft.id, formData);
    if (success) {
      setDrawerOpen(false);
    }
    setSaving(false);
  };

  const handlePost = async () => {
    if (!editingDraft) return;
    setSaving(true);
    // Save first, then post
    await updateDraft(editingDraft.id, formData);
    const success = await postDraft(editingDraft.id);
    if (success) {
      setDrawerOpen(false);
    }
    setSaving(false);
  };

  const handleDiscard = async () => {
    if (!editingDraft) return;
    setSaving(true);
    const success = await discardDraft(editingDraft.id);
    if (success) {
      setDrawerOpen(false);
    }
    setSaving(false);
  };

  const getDuration = (draft: TimeDraftRow) => {
    if (draft.event_start_at && draft.event_end_at) {
      return differenceInMinutes(new Date(draft.event_end_at), new Date(draft.event_start_at));
    }
    return draft.minutes;
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Inbox className="h-8 w-8" />
              Time Inbox
            </h1>
            <p className="text-muted-foreground">Review and post time drafts from your calendar meetings</p>
          </div>
          {stats && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold">{stats.total_drafts}</p>
                <p className="text-sm text-muted-foreground">Total drafts</p>
              </div>
              {stats.overdue_count > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  {stats.overdue_count} overdue
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Date filter */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Date:</Label>
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 days</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dateFilter === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={customDateRange.from}
                    onChange={e => setCustomDateRange(prev => ({ ...prev, from: e.target.value }))}
                    className="w-36"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={customDateRange.to}
                    onChange={e => setCustomDateRange(prev => ({ ...prev, to: e.target.value }))}
                    className="w-36"
                  />
                </>
              )}

              {/* Confidence filter */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Confidence:</Label>
                <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as ConfidenceFilter)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="high">High (≥85%)</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchDrafts}>
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={bulkPost}>
                    <Check className="h-4 w-4 mr-1" />
                    Post Selected
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkDiscard}>
                    <X className="h-4 w-4 mr-1" />
                    Discard Selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Drafts list */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>Drafts</CardTitle>
              {drafts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={selectedIds.size === drafts.length ? clearSelection : selectAll}>
                  {selectedIds.size === drafts.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
            <CardDescription>{drafts.length} drafts found</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : drafts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No drafts found</p>
                <p className="text-sm">All caught up!</p>
              </div>
            ) : (
              drafts.map(draft => {
                const duration = getDuration(draft);
                const isSelected = selectedIds.has(draft.id);
                return (
                  <div
                    key={draft.id}
                    className={`p-4 border rounded-lg hover:bg-accent/50 transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(draft.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDrawer(draft)}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-medium">{draft.event_title || 'Untitled Meeting'}</h4>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(draft.work_date), 'MMM d, yyyy')}
                              </span>
                              {draft.event_start_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(draft.event_start_at), 'h:mm a')}
                                </span>
                              )}
                              <span>{formatDuration(duration)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {draft.client_name ? (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {draft.client_name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-600">
                                No client
                              </Badge>
                            )}
                            <ConfidenceBadge confidence={draft.confidence} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => openDrawer(draft)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Review</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-green-600 hover:text-green-700"
                              onClick={() => postDraft(draft.id)}
                              disabled={!draft.client_id}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Post</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-red-600 hover:text-red-700"
                              onClick={() => discardDraft(draft.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Discard</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Edit Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-[500px] sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle>Edit Time Draft</SheetTitle>
              <SheetDescription>
                {editingDraft?.event_title || 'Meeting'}
              </SheetDescription>
            </SheetHeader>
            
            {editingDraft && (
              <div className="mt-6 space-y-6">
                {/* Meeting info */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {editingDraft.event_start_at && format(new Date(editingDraft.event_start_at), 'EEEE, MMMM d, yyyy')}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {editingDraft.event_start_at && format(new Date(editingDraft.event_start_at), 'h:mm a')} - 
                    {editingDraft.event_end_at && format(new Date(editingDraft.event_end_at), 'h:mm a')}
                    <span className="text-muted-foreground">({formatDuration(getDuration(editingDraft))})</span>
                  </div>
                </div>

                {/* Why this match */}
                {editingDraft.suggestion && Object.keys(editingDraft.suggestion).length > 0 && (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Why this match
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(editingDraft.suggestion as { source?: string }).source === 'auto_worker' 
                        ? 'Auto-created from ended calendar meeting' 
                        : 'Created from calendar event'}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Confidence:</span>
                      <ConfidenceBadge confidence={editingDraft.confidence} />
                    </div>
                  </div>
                )}

                {/* Form fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Client *</Label>
                    <Select 
                      value={formData.client_id?.toString() || ''} 
                      onValueChange={(v) => {
                        const clientId = parseInt(v);
                        setFormData(prev => ({ ...prev, client_id: clientId, package_id: null, stage_id: null }));
                        fetchPackagesForClient(clientId);
                        setStages([]);
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
                      value={formData.package_id?.toString() || ''} 
                      onValueChange={(v) => {
                        const packageId = parseInt(v);
                        setFormData(prev => ({ ...prev, package_id: packageId, stage_id: null }));
                        fetchStagesForPackage(packageId);
                      }}
                      disabled={!formData.client_id}
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
                    <Label>Stage</Label>
                    <Select 
                      value={formData.stage_id?.toString() || ''} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, stage_id: parseInt(v) }))}
                      disabled={!formData.package_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
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
                      <Label>Work Type</Label>
                      <Select 
                        value={formData.work_type} 
                        onValueChange={(v) => setFormData(prev => ({ ...prev, work_type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting">Meeting</SelectItem>
                          <SelectItem value="consulting">Consulting</SelectItem>
                          <SelectItem value="training">Training</SelectItem>
                          <SelectItem value="document_review">Document Review</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Minutes</Label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.minutes}
                        onChange={e => setFormData(prev => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Work Date</Label>
                      <Input
                        type="date"
                        value={formData.work_date}
                        onChange={e => setFormData(prev => ({ ...prev, work_date: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Billable</Label>
                      <div className="flex items-center gap-2 h-10">
                        <Switch
                          checked={formData.is_billable}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_billable: checked }))}
                        />
                        <span className="text-sm">{formData.is_billable ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}

            <SheetFooter className="mt-6 gap-2">
              <Button variant="destructive" onClick={handleDiscard} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Discard
              </Button>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                Save Draft
              </Button>
              <Button onClick={handlePost} disabled={saving || !formData.client_id || formData.minutes <= 0}>
                <Check className="h-4 w-4 mr-1" />
                Post
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
