import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Target, TrendingUp, TrendingDown, CheckCircle, Filter, AlertTriangle, Lightbulb, Link as LinkIcon, Armchair } from 'lucide-react';
import { useEosRocks } from '@/hooks/useEos';
import { useRisksOpportunities } from '@/hooks/useRisksOpportunities';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { RockFormDialog } from '@/components/eos/RockFormDialog';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { PermissionTooltip, CustomPermissionTooltip } from '@/components/eos/PermissionTooltip';
import { RocksInsights } from '@/components/eos/facilitator/RocksInsights';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function EosRocks() {
  return (
    <DashboardLayout>
      <RocksContent />
    </DashboardLayout>
  );
}

function RocksContent() {
  const { rocks, isLoading } = useEosRocks();
  const { items: risksOpportunities } = useRisksOpportunities();
  const { canCreateRocks, canEditOwnRocks, canEditOthersRocks } = useRBAC();
  const { user, profile } = useAuth();
  const [filter, setFilter] = useState<'all' | string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [seatFilter, setSeatFilter] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRock, setEditingRock] = useState<any>(null);

  // Fetch seats for filter and display
  const { data: seats } = useQuery({
    queryKey: ['seats-for-rocks-display', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', profile?.tenant_id!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch users for owner display
  const { data: users } = useQuery({
    queryKey: ['users-for-rocks-display', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .eq('tenant_id', profile?.tenant_id!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const getSeatInfo = (seatId: string | null | undefined) => {
    if (!seatId) return null;
    const seat = seats?.find(s => s.id === seatId);
    if (!seat) return null;
    return {
      name: seat.seat_name,
      function: (seat.accountability_functions as any)?.name || '',
    };
  };

  const getOwnerName = (userId: string | null | undefined) => {
    if (!userId) return null;
    const user = users?.find(u => u.user_uuid === userId);
    if (!user) return null;
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
  };

  // Permission helper for editing a specific rock
  const canEditRock = (rock: any) => {
    if (canEditOthersRocks()) return true;
    if (canEditOwnRocks() && rock.owner_user_id === user?.id) return true;
    return false;
  };

  // Helper to get linked R&O items for a rock
  const getLinkedROItems = (rockId: string) => {
    return risksOpportunities?.filter(item => item.linked_rock_id === rockId) || [];
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      on_track: { variant: 'default', icon: TrendingUp, label: 'On Track' },
      'on-track': { variant: 'default', icon: TrendingUp, label: 'On Track' },
      off_track: { variant: 'destructive', icon: TrendingDown, label: 'Off Track' },
      'off-track': { variant: 'destructive', icon: TrendingDown, label: 'Off Track' },
      complete: { variant: 'secondary', icon: CheckCircle, label: 'Complete' },
    };
    
    const config = variants[statusLower] || variants.on_track;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (rock: any) => {
    return (
      <Badge variant="outline" className="bg-primary/5 text-primary">
        Q{rock.quarter_number} {rock.quarter_year}
      </Badge>
    );
  };

  const filteredRocks = rocks?.filter(rock => {
    const statusMatch = filter === 'all' || rock.status === filter;
    const clientMatch = clientFilter === 'all' || rock.client_id === clientFilter;
    const seatMatch = seatFilter === 'all' || rock.seat_id === seatFilter;
    return statusMatch && clientMatch && seatMatch;
  });

  const uniqueClients = Array.from(new Set(rocks?.map(r => r.client_id).filter(Boolean)));
  const uniqueSeats = Array.from(new Set(rocks?.map(r => r.seat_id).filter(Boolean)));
  const rocksWithoutSeat = rocks?.filter(r => !r.seat_id) || [];

  const stats = {
    total: rocks?.length || 0,
    on_track: rocks?.filter(r => r.status?.toLowerCase() === 'on_track' || r.status?.toLowerCase() === 'on-track').length || 0,
    off_track: rocks?.filter(r => r.status?.toLowerCase() === 'off_track' || r.status?.toLowerCase() === 'off-track').length || 0,
    complete: rocks?.filter(r => r.status?.toLowerCase() === 'complete').length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading rocks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="w-8 h-8" />
            Rocks (90-Day Goals)
          </h1>
          <p className="text-muted-foreground mt-2">
            Focus on 3-7 most important priorities each quarter
          </p>
        </div>
        <PermissionTooltip permission="rocks:create" action="create rocks">
          <Button 
            onClick={() => { setEditingRock(null); setIsFormOpen(true); }}
            disabled={!canCreateRocks()}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Rock
          </Button>
        </PermissionTooltip>
      </div>

      {/* Facilitator Insights - only shown in facilitator mode */}
      <RocksInsights rocks={rocks || []} />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('all')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Rocks</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('on_track')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On Track</p>
                <p className="text-2xl font-bold text-green-600">{stats.on_track}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('off_track')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Off Track</p>
                <p className="text-2xl font-bold text-red-600">{stats.off_track}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('complete')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Complete</p>
                <p className="text-2xl font-bold text-blue-600">{stats.complete}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rocks Without Seat Warning */}
      {rocksWithoutSeat.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            {rocksWithoutSeat.length} Rock{rocksWithoutSeat.length > 1 ? 's are' : ' is'} not linked to an Accountability Seat.
            Link them to ensure proper ownership tracking.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        
        {/* Seat Filter */}
        {seats && seats.length > 0 && (
          <Select value={seatFilter} onValueChange={setSeatFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All seats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All seats</SelectItem>
              {seats.map((seat) => (
                <SelectItem key={seat.id} value={seat.id}>
                  {seat.seat_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {uniqueClients.length > 0 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {uniqueClients.map((clientId) => (
                <SelectItem key={clientId} value={clientId!}>
                  Client {clientId?.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filter !== 'all' || clientFilter !== 'all' || seatFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilter('all');
              setClientFilter('all');
              setSeatFilter('all');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Rocks List */}
      <div className="grid gap-4">
        {filteredRocks && filteredRocks.length > 0 ? (
          filteredRocks.map((rock) => (
            <Card key={rock.id} className={`hover:shadow-lg transition-shadow ${!rock.seat_id ? 'border-l-4 border-l-amber-400' : ''}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <CardTitle className="text-lg">{rock.title}</CardTitle>
                      {getPriorityBadge(rock)}
                      <ClientBadge clientId={rock.client_id} />
                    </div>
                    {/* Seat and Owner Display */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {rock.seat_id ? (
                        <>
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Armchair className="w-3 h-3" />
                            {getSeatInfo(rock.seat_id)?.name || 'Unknown Seat'}
                          </Badge>
                          {getOwnerName(rock.owner_id || rock.seat_owner_user_id) && (
                            <span className="text-xs text-muted-foreground">
                              — {getOwnerName(rock.owner_id || rock.seat_owner_user_id)}
                            </span>
                          )}
                        </>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                          <AlertTriangle className="w-3 h-3" />
                          No Seat Linked
                        </Badge>
                      )}
                    </div>
                    {rock.description && (
                      <p className="text-sm text-muted-foreground">{rock.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {getStatusBadge(rock.status)}
                    <RockProgressControl rock={rock} compact />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Timeline */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Q{rock.quarter_number} {rock.quarter_year}
                  </span>
                  <span>•</span>
                  <span>
                    Due: {format(new Date(rock.due_date), 'MMM d, yyyy')}
                  </span>
                  {rock.completed_date && (
                    <>
                      <span>•</span>
                      <span>
                        Completed: {format(new Date(rock.completed_date), 'MMM d, yyyy')}
                      </span>
                    </>
                  )}
                </div>

                {/* Linked Risks & Opportunities */}
                {(() => {
                  const linkedItems = getLinkedROItems(rock.id);
                  if (linkedItems.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Linked Risks & Opportunities</span>
                        <Badge variant="secondary" className="text-xs">{linkedItems.length}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {linkedItems.map((item) => (
                          <Link 
                            key={item.id} 
                            to="/eos/risks-opportunities"
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted hover:bg-muted/80 transition-colors"
                          >
                            {item.item_type === 'risk' ? (
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                            ) : (
                              <Lightbulb className="w-3 h-3 text-emerald-500" />
                            )}
                            <span className="max-w-[150px] truncate">{item.title}</span>
                            <Badge 
                              variant={item.status === 'Escalated' ? 'destructive' : 'outline'} 
                              className="text-[10px] px-1 py-0"
                            >
                              {item.status}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <CustomPermissionTooltip 
                    hasAccess={canEditRock(rock)}
                    message="You can only edit rocks you own, or require Team Leader/Admin access to edit others' rocks."
                    guidance="Contact your admin if you need to edit this rock."
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEditRock(rock)}
                      onClick={() => {
                        setEditingRock(rock);
                        setIsFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </CustomPermissionTooltip>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No rocks yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by creating your first 90-day goal (Rock)
              </p>
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Rock
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <RockFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        rock={editingRock}
      />
    </div>
  );
}
