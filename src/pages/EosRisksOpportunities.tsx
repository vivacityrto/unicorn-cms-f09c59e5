import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, AlertTriangle, Lightbulb, TrendingUp, Shield, User, Calendar, Link as LinkIcon, Filter, X, Clock, History } from 'lucide-react';
import { useRisksOpportunities } from '@/hooks/useRisksOpportunities';
import { useEosRocks } from '@/hooks/useEos';
import { useEosStatusOptions, useEosCategoryOptions } from '@/hooks/useEosOptions';
import { useTenantUsers } from '@/hooks/useTenantUsers';
import { useRBAC } from '@/hooks/useRBAC';
import { format, formatDistanceToNow } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { RiskOpportunityForm, type RiskOpportunityFormData } from '@/components/eos/RiskOpportunityForm';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { WhyCantILink } from '@/components/eos/RoleInfoPanel';
import type { RiskOpportunityType, RiskOpportunityCategory, RiskOpportunityStatus } from '@/types/risksOpportunities';

export default function EosRisksOpportunities() {
  return (
    <DashboardLayout>
      <RisksOpportunitiesContent />
    </DashboardLayout>
  );
}

function RisksOpportunitiesContent() {
  const { items, isLoading, createItem, updateItem } = useRisksOpportunities();
  const { rocks } = useEosRocks();
  const { data: statusOptions = [] } = useEosStatusOptions();
  const { data: categoryOptions = [] } = useEosCategoryOptions();
  const { getUserName } = useTenantUsers();
  const { canCreateRisks, canEscalateRisks, canCloseCriticalRisks } = useRBAC();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<typeof items extends (infer T)[] | undefined ? T | null : null>(null);
  const [filterType, setFilterType] = useState<'all' | RiskOpportunityType>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | RiskOpportunityCategory>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | RiskOpportunityStatus>('Open');
  const [escalationDialog, setEscalationDialog] = useState<{ isOpen: boolean; itemId?: string; currentStatus?: string }>({ isOpen: false });
  const [escalationReason, setEscalationReason] = useState('');

  const handleCreate = async (formData: RiskOpportunityFormData) => {
    await createItem.mutateAsync({
      item_type: formData.item_type,
      title: formData.title,
      description: formData.description,
      why_it_matters: formData.why_it_matters,
      category: formData.category || undefined,
      impact: formData.impact || undefined,
      quarter_number: formData.quarter_number,
      quarter_year: formData.quarter_year,
      linked_rock_id: formData.linked_rock_id || undefined,
      source: 'ro_page',
    });
    
    setIsCreateOpen(false);
  };

  const handleEdit = (item: NonNullable<typeof items>[number]) => {
    setEditingItem(item);
    setIsEditOpen(true);
  };

  const handleUpdate = async (formData: RiskOpportunityFormData) => {
    if (!editingItem) return;
    
    await updateItem.mutateAsync({
      id: editingItem.id,
      currentStatus: editingItem.status,
      item_type: formData.item_type,
      title: formData.title,
      description: formData.description,
      why_it_matters: formData.why_it_matters,
      category: formData.category || undefined,
      impact: formData.impact || undefined,
      status: formData.status,
      quarter_number: formData.quarter_number,
      quarter_year: formData.quarter_year,
      linked_rock_id: formData.linked_rock_id || undefined,
    });
    
    setIsEditOpen(false);
    setEditingItem(null);
  };

  // Helper to get human-readable source label
  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'ro_page':
      case 'ad_hoc':
        return 'Manual';
      case 'meeting_ids':
        return 'Meeting';
      case 'meeting_l10':
        return 'Level 10';
      case 'meeting_quarterly':
        return 'Quarterly';
      case 'meeting_annual':
        return 'Annual';
      default:
        return source ? source.replace('_', ' ') : 'Manual';
    }
  };

  const handleStatusChange = async (id: string, newStatus: RiskOpportunityStatus, currentStatus?: string, escalationReasonText?: string) => {
    // If escalating, require a reason
    if (newStatus === 'Escalated' && !escalationReasonText) {
      setEscalationDialog({ isOpen: true, itemId: id, currentStatus });
      return;
    }
    
    const updates: any = { id, currentStatus, status: newStatus };
    if (newStatus === 'Closed' || newStatus === 'Solved') {
      updates.outcome_note = 'Resolved';
    }
    if (escalationReasonText) {
      updates.escalation_reason = escalationReasonText;
    }
    await updateItem.mutateAsync(updates);
  };

  const handleEscalate = async () => {
    if (!escalationDialog.itemId || !escalationReason.trim()) return;
    await handleStatusChange(
      escalationDialog.itemId, 
      'Escalated', 
      escalationDialog.currentStatus,
      escalationReason
    );
    setEscalationDialog({ isOpen: false });
    setEscalationReason('');
  };

  const filteredItems = items?.filter(item => {
    if (filterType !== 'all' && item.item_type !== filterType) return false;
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    risks: items?.filter(i => i.item_type === 'risk').length || 0,
    opportunities: items?.filter(i => i.item_type === 'opportunity').length || 0,
    critical: items?.filter(i => i.impact === 'Critical').length || 0,
    escalated: items?.filter(i => i.status === 'Escalated').length || 0,
  };

  const getItemStyles = (type: string, impact?: string) => {
    if (type === 'risk') {
      return {
        border: impact === 'Critical' ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-amber-500',
        icon: AlertTriangle,
        iconColor: impact === 'Critical' ? 'text-destructive' : 'text-amber-500',
        bg: impact === 'Critical' ? 'bg-destructive/5' : 'bg-amber-50',
      };
    }
    return {
      border: 'border-l-4 border-l-emerald-500',
      icon: Lightbulb,
      iconColor: 'text-emerald-600',
      bg: 'bg-emerald-50',
    };
  };

  const getImpactBadge = (impact?: string) => {
    const variants: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
      Critical: 'destructive',
      High: 'default',
      Medium: 'secondary',
      Low: 'outline',
    };
    return impact ? <Badge variant={variants[impact] || 'outline'}>{impact}</Badge> : null;
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Open: 'bg-blue-100 text-blue-800',
      'In Review': 'bg-purple-100 text-purple-800',
      Actioning: 'bg-yellow-100 text-yellow-800',
      Escalated: 'bg-red-100 text-red-800',
      Closed: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[status] || 'bg-gray-100'}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Risks and Opportunities
          </h1>
          <p className="text-muted-foreground mt-2">
            What Could Hurt or Help the Mission
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            This page captures anything that could materially impact delivery, revenue, compliance, or growth.
          </p>
        </div>
        <PermissionTooltip permission="risks:create" action="add risks or opportunities">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canCreateRisks()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Add Risk or Opportunity</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0">
                <RiskOpportunityForm
                  onSubmit={handleCreate}
                  onCancel={() => setIsCreateOpen(false)}
                  isSubmitting={createItem.isPending}
                />
              </div>
            </DialogContent>
          </Dialog>
        </PermissionTooltip>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setEditingItem(null);
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Edit {editingItem?.item_type === 'risk' ? 'Risk' : 'Opportunity'}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
              {editingItem && (
                <RiskOpportunityForm
                  onSubmit={handleUpdate}
                  onCancel={() => {
                    setIsEditOpen(false);
                    setEditingItem(null);
                  }}
                  isSubmitting={updateItem.isPending}
                  initialValues={{
                    item_type: editingItem.item_type,
                    title: editingItem.title,
                    description: editingItem.description || '',
                    why_it_matters: editingItem.why_it_matters || '',
                    category: editingItem.category || null,
                    impact: editingItem.impact || null,
                    status: editingItem.status,
                    quarter_number: editingItem.quarter_number,
                    quarter_year: editingItem.quarter_year,
                    linked_rock_id: editingItem.linked_rock_id || null,
                  }}
                  submitLabel="Save Changes"
                  showStatusSelector
                  currentStatus={editingItem.status}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFilterType('risk')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risks</p>
                <p className="text-2xl font-bold text-amber-600">{stats.risks}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFilterType('opportunity')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Opportunities</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.opportunities}</p>
              </div>
              <Lightbulb className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md border-destructive/20" onClick={() => setFilterStatus('Escalated')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Escalated</p>
                <p className="text-2xl font-bold text-destructive">{stats.escalated}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setFilterType('all'); setFilterStatus('Open'); setFilterCategory('all'); }}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical Impact</p>
                <p className="text-2xl font-bold">{stats.critical}</p>
              </div>
              <Shield className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="risk">Risks</SelectItem>
                <SelectItem value="opportunity">Opportunities</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterType !== 'all' || filterCategory !== 'all' || filterStatus !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setFilterType('all'); setFilterCategory('all'); setFilterStatus('Open'); }}
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <div className="space-y-4">
        {filteredItems && filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const styles = getItemStyles(item.item_type, item.impact);
            const Icon = styles.icon;
            const linkedRock = rocks?.find(r => r.id === item.linked_rock_id);
            
            return (
              <Card key={item.id} className={`${styles.border} hover:shadow-lg transition-shadow`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 flex items-start gap-3">
                      <div className={`${styles.bg} p-2 rounded-lg`}>
                        <Icon className={`w-5 h-5 ${styles.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {item.item_type === 'risk' ? 'Risk' : 'Opportunity'}
                          </Badge>
                          {item.category && (
                            <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                          )}
                          {item.source && (
                            <Badge variant="outline" className="text-xs bg-muted">
                              Source: {getSourceLabel(item.source)}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                        )}
                        {item.why_it_matters && (
                          <div className="mt-2 p-2 bg-amber-50 border-l-2 border-amber-400 rounded-r">
                            <p className="text-xs font-medium text-amber-800">Why It Matters</p>
                            <p className="text-sm text-amber-700">{item.why_it_matters}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                          {item.quarter_number && item.quarter_year && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Q{item.quarter_number} {item.quarter_year}
                            </span>
                          )}
                          {linkedRock && (
                            <span className="flex items-center gap-1">
                              <LinkIcon className="w-4 h-4" />
                              {linkedRock.title}
                            </span>
                          )}
                          {item.assigned_to && (
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {getUserName(item.assigned_to)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                          {item.resolved_at && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <History className="w-4 h-4" />
                              Resolved {format(new Date(item.resolved_at), 'MMM d, yyyy')}
                            </span>
                          )}
                          {item.escalated_at && (
                            <span className="flex items-center gap-1 text-destructive">
                              <TrendingUp className="w-4 h-4" />
                              Escalated {format(new Date(item.escalated_at), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        {/* Escalation reason display */}
                        {item.status === 'Escalated' && item.escalation_reason && (
                          <div className="mt-2 p-2 bg-destructive/10 border-l-2 border-destructive rounded-r">
                            <p className="text-xs font-medium text-destructive">Escalation Reason</p>
                            <p className="text-sm text-destructive/80">{item.escalation_reason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {getStatusBadge(item.status)}
                      {getImpactBadge(item.impact)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Select 
                      value={item.status} 
                      onValueChange={(v) => {
                        // Check permission for escalation
                        if (v === 'Escalated' && !canEscalateRisks()) {
                          return;
                        }
                        // Check permission for closing critical items
                        if ((v === 'Closed' || v === 'Solved') && item.impact === 'Critical' && !canCloseCriticalRisks()) {
                          return;
                        }
                        handleStatusChange(item.id, v as RiskOpportunityStatus, item.status);
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(status => {
                          // Disable Escalated option if user doesn't have permission
                          const isEscalated = status === 'Escalated';
                          const isClosed = status === 'Closed' || status === 'Solved';
                          const isCritical = item.impact === 'Critical';
                          const disabled = (isEscalated && !canEscalateRisks()) || 
                                          (isClosed && isCritical && !canCloseCriticalRisks());
                          return (
                            <SelectItem 
                              key={status} 
                              value={status}
                              disabled={disabled}
                            >
                              {status}
                              {disabled && ' (restricted)'}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>Edit</Button>
                    {item.status === 'Escalated' && (
                      <Badge variant="destructive" className="animate-pulse">Requires Leadership</Badge>
                    )}
                    {/* Show guidance for restricted actions */}
                    {item.impact === 'Critical' && !canCloseCriticalRisks() && item.status !== 'Closed' && item.status !== 'Solved' && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          Closing critical items requires Super Admin access.
                        </p>
                        <WhyCantILink />
                      </div>
                    )}
                    {!canEscalateRisks() && item.status !== 'Escalated' && (
                      <p className="text-xs text-muted-foreground">
                        Escalation requires Admin or Team Leader access.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No items yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by identifying risks that could hurt or opportunities that could help the mission
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Item
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Escalation Reason Dialog */}
      <Dialog open={escalationDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setEscalationDialog({ isOpen: false });
          setEscalationReason('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Item</DialogTitle>
            <DialogDescription>
              Escalating this item will flag it for leadership review. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="escalation-reason">Reason for Escalation</Label>
              <Textarea
                id="escalation-reason"
                placeholder="Why does this need to be escalated? What action is needed from leadership?"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEscalationDialog({ isOpen: false });
              setEscalationReason('');
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleEscalate}
              disabled={!escalationReason.trim()}
            >
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
