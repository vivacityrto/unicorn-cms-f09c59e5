import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Building2, Armchair, Search, RefreshCw, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePeopleAnalyzer } from '@/hooks/usePeopleAnalyzer';
import {
  PersonTrendView,
  SeatTrendView,
  TenantTrendSummary,
  PeopleAnalyzerAlerts,
} from '@/components/eos/people-analyzer';
import type { PeopleAnalyzerTrend, PersonTrendSummary as PersonSummary } from '@/types/peopleAnalyzer';

const VIVACITY_TENANT_ID = 1;

export default function EosPeopleAnalyzer() {
  const { profile, isSuperAdmin } = useAuth();
  const { buildPersonSummary, calculateTrends, atRiskTrends, isStaff } = usePeopleAnalyzer();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('people');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const canView = isSuperAdmin() || profile?.unicorn_role === 'Team Leader';

  // Fetch all trends
  const { data: allTrends, isLoading: trendsLoading, refetch } = useQuery({
    queryKey: ['people-analyzer-all-trends', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people_analyzer_trends')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('quarter_year', { ascending: false })
        .order('quarter_number', { ascending: false });
      
      if (error) throw error;
      return data as unknown as PeopleAnalyzerTrend[];
    },
    enabled: isStaff,
  });

  // Fetch team members
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members-for-pa', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .not('unicorn_role', 'is', null);
      
      if (error) throw error;
      return data;
    },
    enabled: isStaff,
  });

  // Fetch seats
  const { data: seats } = useQuery({
    queryKey: ['seats-for-pa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID);
      
      if (error) throw error;
      return data;
    },
    enabled: isStaff,
  });

  // Build person summaries
  const personSummaries: PersonSummary[] = [];
  if (allTrends && teamMembers) {
    const byUser: Record<string, PeopleAnalyzerTrend[]> = {};
    for (const t of allTrends) {
      if (!byUser[t.user_id]) byUser[t.user_id] = [];
      byUser[t.user_id].push(t);
    }

    for (const [userId, userTrends] of Object.entries(byUser)) {
      const member = teamMembers.find(m => m.user_uuid === userId);
      const userName = member 
        ? `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Unknown'
        : 'Unknown User';
      
      const seatId = userTrends[0]?.seat_id;
      const seat = seats?.find(s => s.id === seatId);
      
      personSummaries.push(
        buildPersonSummary(
          userId,
          userName,
          userTrends,
          seatId,
          seat?.seat_name
        )
      );
    }
  }

  // Filter by search
  const filteredPeople = personSummaries.filter(p =>
    p.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.seatName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Build seat summaries
  const seatSummaries: { seatId: string; seatName: string; functionName: string; trends: PeopleAnalyzerTrend[] }[] = [];
  if (allTrends && seats) {
    const bySeat: Record<string, PeopleAnalyzerTrend[]> = {};
    for (const t of allTrends) {
      if (t.seat_id) {
        if (!bySeat[t.seat_id]) bySeat[t.seat_id] = [];
        bySeat[t.seat_id].push(t);
      }
    }

    for (const [seatId, seatTrends] of Object.entries(bySeat)) {
      const seat = seats.find(s => s.id === seatId);
      if (seat) {
        seatSummaries.push({
          seatId,
          seatName: seat.seat_name,
          functionName: (seat.accountability_functions as any)?.name || '',
          trends: seatTrends,
        });
      }
    }
  }

  if (!canView) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">
            You don't have permission to view People Analyzer trends.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <PageHeader
            title="People Analyzer Trends"
            description="Core Values alignment tracking across quarters"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={trendsLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${trendsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Info Banner */}
        <Card className="bg-muted/30 border-muted">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">People Analyzer</p>
                <p>
                  Values alignment trends derived from Quarterly Conversations. 
                  Patterns matter more than single scores. This is <strong>read-only</strong> — 
                  ratings come from signed QC data only.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts Panel */}
        {atRiskTrends && atRiskTrends.length > 0 && (
          <PeopleAnalyzerAlerts trends={atRiskTrends} showLink={false} />
        )}

        {/* Tenant Overview */}
        {allTrends && allTrends.length > 0 && (
          <TenantTrendSummary trends={allTrends} />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="people" className="gap-2">
                <Users className="h-4 w-4" />
                By Person
              </TabsTrigger>
              <TabsTrigger value="seats" className="gap-2">
                <Armchair className="h-4 w-4" />
                By Seat
              </TabsTrigger>
            </TabsList>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value="people" className="mt-0">
            {trendsLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading trends...</p>
                </CardContent>
              </Card>
            ) : filteredPeople.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No People Analyzer data yet. Trends are derived from Quarterly Conversations.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4 pr-4">
                  {filteredPeople
                    .sort((a, b) => b.atRiskCount - a.atRiskCount)
                    .map((person) => (
                      <PersonTrendView key={person.userId} summary={person} />
                    ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="seats" className="mt-0">
            {trendsLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading trends...</p>
                </CardContent>
              </Card>
            ) : seatSummaries.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Armchair className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No seat-level trends available.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4 pr-4">
                  {seatSummaries.map((seat) => (
                    <SeatTrendView
                      key={seat.seatId}
                      seatId={seat.seatId}
                      seatName={seat.seatName}
                      functionName={seat.functionName}
                      trends={seat.trends}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
