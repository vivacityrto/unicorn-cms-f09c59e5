import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, BarChart3 } from "lucide-react";
import { usePortfolioCockpit, type PortfolioTenant } from "@/hooks/usePortfolioCockpit";
import { PortfolioFilterBar } from "@/components/portfolio/PortfolioFilterBar";
import { PortfolioSummaryTiles } from "@/components/portfolio/PortfolioSummaryTiles";
import { PriorityInboxPanel } from "@/components/portfolio/PriorityInboxPanel";
import { PortfolioTable } from "@/components/portfolio/PortfolioTable";
import { TenantDrawer } from "@/components/portfolio/TenantDrawer";

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  // Redirect client roles to the isolated client portal
  useEffect(() => {
    if (isAdminOrUser) {
      navigate("/client/home", { replace: true });
    }
  }, [isAdminOrUser, navigate]);

  const {
    portfolio,
    portfolioLoading,
    priorityInbox,
    inboxLoading,
    kpis,
    filters,
    setFilters,
    savedView,
    setSavedView,
    canSeeAll,
    isExec,
    isVivacityStaff,
    cscNameMap,
    acknowledgeItem,
    snoozeItem,
    fetchTenantComms,
    logDashboardEvent,
  } = usePortfolioCockpit();

  // Drawer state
  const [drawerTenant, setDrawerTenant] = useState<PortfolioTenant | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = (tenant: PortfolioTenant) => {
    setDrawerTenant(tenant);
    setDrawerOpen(true);
  };

  const openDrawerByTenantId = (tenantId: number) => {
    const t = portfolio.find(p => p.tenant_id === tenantId);
    if (t) openDrawer(t);
  };

  // Tenant name map for inbox
  const tenantNames: Record<number, string> = {};
  portfolio.forEach(t => { tenantNames[t.tenant_id] = t.tenant_name; });

  // Tile click applies filters
  const handleTileClick = (filter: string) => {
    if (filter === 'risk_high') setFilters({ ...filters, riskStatus: 'high' });
    else if (filter === 'stage_critical') setFilters({ ...filters, stageHealth: 'critical' });
    else if (filter === 'gaps') setFilters({ ...filters, mandatoryGapsOnly: true });
    else if (filter === 'burn') setFilters({ ...filters, burnRiskOnly: true });
    else if (filter === 'retention') setFilters({ ...filters, riskStatus: null, stageHealth: null, mandatoryGapsOnly: false, burnRiskOnly: false });
    else setFilters({ search: '', riskStatus: null, stageHealth: null, mandatoryGapsOnly: false, burnRiskOnly: false, renewalDays: null });
  };

  // Log dashboard view
  useEffect(() => {
    if (isVivacityStaff) {
      logDashboardEvent('dashboard_viewed');
    }
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
        {/* Header */}
        <div className="border-b bg-card/50 backdrop-blur-sm px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-foreground">Portfolio Review Cockpit</h1>
              <p className="text-sm text-muted-foreground">
                {savedView === 'my_tenants' ? 'My Tenants' : 'All Tenants'} · {portfolio.length} active
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <PortfolioFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          savedView={savedView}
          onSavedViewChange={setSavedView}
          canSeeAll={canSeeAll}
        />

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Tiles */}
          <PortfolioSummaryTiles kpis={kpis} isExec={isExec} onTileClick={handleTileClick} />

          {/* Priority Inbox */}
          <PriorityInboxPanel
            items={priorityInbox}
            loading={inboxLoading}
            tenantNames={tenantNames}
            onAcknowledge={acknowledgeItem}
            onSnooze={snoozeItem}
            onOpenDrawer={openDrawerByTenantId}
          />

          {/* Portfolio Table */}
          {portfolioLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <PortfolioTable
              tenants={portfolio}
              cscNameMap={cscNameMap}
              onRowClick={openDrawer}
            />
          )}
        </div>

        {/* Tenant Drawer */}
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
