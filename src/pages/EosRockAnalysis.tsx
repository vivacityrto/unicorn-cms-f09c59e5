import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, RefreshCw, BarChart3, Users, Calendar } from 'lucide-react';
import { 
  useQuarterlySummary, 
  useSeatRockAnalysis, 
  useRockTrends, 
  useAvailableQuarters,
  useGenerateRockOutcomes,
  useRockOutcomes
} from '@/hooks/useRockAnalysis';
import { 
  QuarterSummaryCard, 
  SeatAnalysisTable, 
  RockTrendChart,
  RockOutcomeList
} from '@/components/eos/rock-analysis';
import { getCurrentQuarter, formatQuarter, parseQuarter } from '@/types/rockAnalysis';

export default function EosRockAnalysis() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'seats' | 'detail'>('overview');
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  
  const { data: availableQuarters, isLoading: quartersLoading } = useAvailableQuarters();
  const { data: summaries, isLoading: summariesLoading } = useQuarterlySummary();
  const { data: trendData, isLoading: trendsLoading } = useRockTrends(6);
  
  // Parse selected quarter for seat/detail views
  const parsedQuarter = selectedQuarter ? parseQuarter(selectedQuarter) : null;
  
  const { data: seatData, isLoading: seatsLoading } = useSeatRockAnalysis(
    parsedQuarter?.quarter,
    parsedQuarter?.year
  );
  
  const { data: outcomes, isLoading: outcomesLoading } = useRockOutcomes(
    parsedQuarter?.quarter,
    parsedQuarter?.year
  );
  
  const generateOutcomes = useGenerateRockOutcomes();
  
  const currentQuarter = getCurrentQuarter();
  const currentQuarterStr = formatQuarter(currentQuarter.quarter, currentQuarter.year);
  
  // Stats for the current/selected quarter
  const selectedSummary = summaries?.find(s => 
    selectedQuarter ? s.quarter === selectedQuarter : s.quarter === currentQuarterStr
  );
  
  const handleGenerateOutcomes = () => {
    const qtr = parsedQuarter || currentQuarter;
    generateOutcomes.mutate({ 
      quarterNumber: qtr.quarter, 
      quarterYear: qtr.year 
    });
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Rock Success Analysis"
          description="Quarterly analysis of rock execution quality and trends"
          icon={Target}
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={selectedQuarter || 'all'}
                onValueChange={(v) => setSelectedQuarter(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All Quarters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Quarters</SelectItem>
                  {availableQuarters?.map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleGenerateOutcomes}
                disabled={generateOutcomes.isPending}
                className="gap-2"
              >
                {generateOutcomes.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Generate Outcomes
                  </>
                )}
              </Button>
            </div>
          }
        />
        
        {/* Quick Stats */}
        {selectedSummary && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Rocks</CardDescription>
                <CardTitle className="text-2xl">{selectedSummary.total_rocks}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completion Rate</CardDescription>
                <CardTitle className="text-2xl">{selectedSummary.completion_rate}%</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>On-Time Rate</CardDescription>
                <CardTitle className="text-2xl">{selectedSummary.on_time_rate}%</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Roll Rate</CardDescription>
                <CardTitle className="text-2xl">{selectedSummary.roll_rate}%</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
        
        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="seats" className="gap-2">
              <Users className="h-4 w-4" />
              By Seat
            </TabsTrigger>
            <TabsTrigger value="detail" className="gap-2">
              <Calendar className="h-4 w-4" />
              Detail
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Trend Chart */}
            {trendsLoading ? (
              <Skeleton className="h-80" />
            ) : trendData ? (
              <RockTrendChart data={trendData} />
            ) : null}
            
            {/* Quarter Cards */}
            <Card>
              <CardHeader>
                <CardTitle>Quarterly Summaries</CardTitle>
                <CardDescription>Click a quarter to see details</CardDescription>
              </CardHeader>
              <CardContent>
                {summariesLoading ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
                  </div>
                ) : summaries && summaries.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {summaries.slice(0, 6).map(summary => (
                      <QuarterSummaryCard
                        key={summary.quarter}
                        summary={summary}
                        onClick={() => {
                          setSelectedQuarter(summary.quarter);
                          setActiveTab('detail');
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-medium text-lg mb-2">No Outcomes Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate rock outcomes to see quarterly analysis
                    </p>
                    <Button onClick={handleGenerateOutcomes} disabled={generateOutcomes.isPending}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Generate for {currentQuarterStr}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="seats" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Seat-Level Analysis</CardTitle>
                    <CardDescription>
                      Rock success broken down by accountability seat
                      {selectedQuarter && ` for ${selectedQuarter}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {seatsLoading ? (
                  <Skeleton className="h-64" />
                ) : seatData ? (
                  <SeatAnalysisTable 
                    seats={seatData}
                    onSeatClick={(seatId) => {
                      navigate(`/eos/accountability?seat=${seatId}`);
                    }}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Select a quarter to view seat analysis
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="detail" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      Rock Outcomes
                      {selectedQuarter && <Badge variant="outline" className="ml-2">{selectedQuarter}</Badge>}
                    </CardTitle>
                    <CardDescription>
                      Individual rock outcomes for the selected quarter
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {outcomesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
                  </div>
                ) : outcomes ? (
                  <RockOutcomeList outcomes={outcomes} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Select a quarter to view rock outcomes
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
