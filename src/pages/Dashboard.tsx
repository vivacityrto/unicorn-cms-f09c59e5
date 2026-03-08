import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientQuickNav } from "@/components/client/ClientQuickNav";
import { useDashboardTriage, type AttentionTenant } from "@/hooks/useDashboardTriage";
import { PortfolioFilterBar } from "@/components/portfolio/PortfolioFilterBar";
import { TodaysFocusSection } from "@/components/dashboard/TodaysFocusSection";
import { AttentionRankingSection } from "@/components/dashboard/AttentionRankingSection";
import { PriorityInboxPanel } from "@/components/portfolio/PriorityInboxPanel";
import { LabourEfficiencyPanel } from "@/components/dashboard/LabourEfficiencyPanel";
import { RiskClusterSnapshot } from "@/components/dashboard/RiskClusterSnapshot";
import { ExpandablePortfolioSection } from "@/components/dashboard/ExpandablePortfolioSection";
import { OverloadBanner } from "@/components/dashboard/OverloadBanner";
import { TenantDrawer } from "@/components/portfolio/TenantDrawer";

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  useEffect(() => {
    if (isAdminOrUser) navigate("/client/home", { replace: true });
  }, [isAdminOrUser, navigate]);

  const {
    todaysFocus, top5, activePortfolio, lowAttention,
    tenantsLoading, priorityInbox, inboxLoading,
    riskClusters, labourMetrics, isOverloaded,
    tenantNames, cscNameMap, kpis,
    filters, setFilters, savedView, setSavedView,
    canSeeAll, isExec, isVivacityStaff,
    acknowledgeItem, snoozeItem, fetchTenantComms, logDashboardEvent, profile: userProfile,
  } = useDashboardTriage();

  const [drawerTenant, setDrawerTenant] = useState<AttentionTenant | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = (tenant: AttentionTenant) => {
    setDrawerTenant(tenant);
    setDrawerOpen(true);
  };

  const openDrawerById = (tenantId: number) => {
    const t = [...activePortfolio, ...lowAttention].find(p => p.tenant_id === tenantId);
    if (t) openDrawer(t);
  };

  useEffect(() => {
    if (isVivacityStaff) logDashboardEvent('dashboard_viewed');
  }, [isVivacityStaff]);

  if (!isVivacityStaff) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 min-h-full bg-background flex flex-col">
        <OverloadBanner show={isOverloaded} />

        {/* Compact header */}
        <div className="border-b bg-card/50 backdrop-blur-sm px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-foreground">Triage Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                {savedView === 'my_tenants' ? 'My Tenants' : 'All Tenants'} · {activePortfolio.length + lowAttention.length} active
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/manage-tenants')}
                className="gap-1.5"
              >
                <Building2 className="h-3.5 w-3.5" />
                Manage Clients
              </Button>
              <ClientQuickNav currentTenantId={0} />
            </div>
          </div>
        </div>

        <PortfolioFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          savedView={savedView}
          onSavedViewChange={setSavedView}
          canSeeAll={canSeeAll}
        />

        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {tenantsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Section 1: Today's Focus */}
              <TodaysFocusSection
                items={todaysFocus}
                onAction={(item) => {
                  if (item.actionRoute) {
                    navigate(item.actionRoute);
                  } else {
                    openDrawerById(item.tenantId);
                  }
                }}
                onSnooze={(item, days) => snoozeItem({ itemId: item.id, days })}
              />

              {/* Section 2: Attention Ranking (Top 5) */}
              <AttentionRankingSection
                tenants={top5}
                cscNameMap={cscNameMap}
                onRowClick={openDrawer}
                onViewFullPortfolio={() => document.getElementById('full-portfolio')?.scrollIntoView({ behavior: 'smooth' })}
              />

              {/* Section 3: Priority Inbox */}
              <PriorityInboxPanel
                items={priorityInbox}
                loading={inboxLoading}
                tenantNames={tenantNames}
                onAcknowledge={acknowledgeItem}
                onSnooze={snoozeItem}
                onOpenDrawer={openDrawerById}
              />

              {/* Section 4: Labour Efficiency (exec+) */}
              {isExec && labourMetrics.length > 0 && (
                <LabourEfficiencyPanel metrics={labourMetrics} currentUserId={userProfile?.user_uuid} />
              )}

              {/* Section 5: Risk Cluster Snapshot */}
              <RiskClusterSnapshot clusters={riskClusters} />

              {/* Section 6: Full Portfolio (expandable) */}
              <ExpandablePortfolioSection
                activeTenants={activePortfolio}
                lowAttentionTenants={lowAttention}
                cscNameMap={cscNameMap}
                onRowClick={openDrawer}
              />
            </>
          )}
        </div>

        <TenantDrawer
          tenant={drawerTenant}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          fetchComms={fetchTenantComms}
          onLogEvent={logDashboardEvent}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
