import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TenantGWCSummary, GWCTrendsTable } from '@/components/eos/gwc';
import { RoleInfoPanel } from '@/components/eos/RoleInfoPanel';

export default function EosGWCTrends() {

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <PageHeader
            title="GWC Trends"
            description="Track Get It, Want It, and Capacity alignment by seat over time"
          />
          <RoleInfoPanel />
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="seats">By Seat</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <TenantGWCSummary />
          </TabsContent>

          <TabsContent value="seats">
            <GWCTrendsTable />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
