import * as React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Sparkles } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { useDashboardData } from "@/hooks/useDashboardData";

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = profile?.unicorn_role === "Super Admin";
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  const { stats, packageData, monthlyData, statusData, activities, recentClients } = useDashboardData();

  // Redirect Admin/User roles to their tenant detail page
  useEffect(() => {
    if (isAdminOrUser && profile?.tenant_id) {
      navigate(`/tenant/${profile.tenant_id}`, { replace: true });
    }
  }, [isAdminOrUser, profile?.tenant_id, navigate]);

  // Show modern dashboard for Super Admin and Team Leader
  if (isSuperAdmin || isTeamLeader) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <Sparkles className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <p className="text-muted-foreground mt-1">
                Welcome back! Here's an overview of your compliance management system.
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <DashboardStats stats={stats} />

          {/* Charts */}
          <DashboardCharts 
            packageData={packageData} 
            monthlyData={monthlyData} 
            statusData={statusData.length > 0 ? statusData : [
              { name: "Active", value: 10, color: "hsl(142, 76%, 36%)" },
              { name: "Pending", value: 3, color: "hsl(38, 92%, 50%)" },
            ]} 
          />

          {/* Recent Activity */}
          <RecentActivity activities={activities} recentClients={recentClients} />
        </div>
      </DashboardLayout>
    );
  }

  // Admin/User - show loading while redirecting to tenant detail page
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
