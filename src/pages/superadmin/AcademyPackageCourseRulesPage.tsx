import { useState } from "react";
import { Activity, GraduationCap, Layers, Plus, Sparkles, Unlink } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";
import RulesMatrixTab from "@/components/academy/admin/rules/RulesMatrixTab";
import RulesListTab from "@/components/academy/admin/rules/RulesListTab";
import CreateRuleModal from "@/components/academy/admin/rules/CreateRuleModal";
import { useRuleStats, useRulesRealtime } from "@/hooks/academy/useAcademyPackageRules";

export default function AcademyPackageCourseRulesPage() {
  useRulesRealtime();
  const { data: stats, isLoading } = useRuleStats();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 relative pb-24">
        <PageHeader
          title="Package → Course Mapping"
          description="Control which Academy courses are auto-enrolled when a client has a given package. Changes take effect on the next package instance created. Use Backfill to apply to existing clients."
          icon={GraduationCap}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AcademyStatCard
            label="Active rules"
            value={stats?.active_rules ?? 0}
            icon={<Sparkles className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Total mappings"
            value={stats?.total_mappings ?? 0}
            icon={<Layers className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Auto-enrollments to date"
            value={stats?.auto_enrollments_to_date ?? 0}
            icon={<Activity className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Unmapped packages"
            value={stats?.unmapped_packages ?? 0}
            icon={<Unlink className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
        </div>

        <Tabs defaultValue="matrix" className="w-full">
          <TabsList>
            <TabsTrigger value="matrix">Matrix view</TabsTrigger>
            <TabsTrigger value="list">Rules list</TabsTrigger>
          </TabsList>
          <TabsContent value="matrix" className="mt-4">
            <RulesMatrixTab />
          </TabsContent>
          <TabsContent value="list" className="mt-4">
            <RulesListTab />
          </TabsContent>
        </Tabs>

        <Button
          onClick={() => setCreateOpen(true)}
          size="lg"
          className="fixed bottom-6 right-6 shadow-lg z-40 rounded-full"
        >
          <Plus className="h-5 w-5 mr-2" />
          New rule
        </Button>

        <CreateRuleModal open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </DashboardLayout>
  );
}
