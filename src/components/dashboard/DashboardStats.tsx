import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Package, FileText, CheckCircle2, Clock, TrendingUp, Building2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color: "primary" | "green" | "orange" | "purple" | "blue" | "red";
}

const colorClasses = {
  primary: "bg-primary/10 text-primary",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const StatCard = ({ title, value, subtitle, icon, trend, color }: StatCardProps) => (
  <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <span className={cn("text-xs font-semibold", trend.isPositive ? "text-green-600" : "text-red-600")}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("p-3 rounded-xl transition-transform group-hover:scale-110", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

interface DashboardStatsProps {
  stats: {
    totalClients: number;
    activePackages: number;
    totalUsers: number;
    documentsCount: number;
    pendingTasks: number;
    completedThisMonth: number;
    activeInspections: number;
    upcomingMeetings: number;
  };
}

export const DashboardStats = ({ stats }: DashboardStatsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Clients"
        value={stats.totalClients}
        subtitle="Active tenants"
        icon={<Building2 className="h-6 w-6" />}
        color="primary"
        trend={{ value: 12, isPositive: true }}
      />
      <StatCard
        title="Active Packages"
        value={stats.activePackages}
        subtitle="In progress"
        icon={<Package className="h-6 w-6" />}
        color="purple"
      />
      <StatCard
        title="Team Members"
        value={stats.totalUsers}
        subtitle="Across all tenants"
        icon={<Users className="h-6 w-6" />}
        color="blue"
      />
      <StatCard
        title="Documents"
        value={stats.documentsCount}
        subtitle="Total managed"
        icon={<FileText className="h-6 w-6" />}
        color="green"
      />
      <StatCard
        title="Pending Tasks"
        value={stats.pendingTasks}
        subtitle="Awaiting action"
        icon={<Clock className="h-6 w-6" />}
        color="orange"
      />
      <StatCard
        title="Completed This Month"
        value={stats.completedThisMonth}
        subtitle="Tasks finished"
        icon={<CheckCircle2 className="h-6 w-6" />}
        color="green"
      />
      <StatCard
        title="Active Inspections"
        value={stats.activeInspections}
        subtitle="In progress"
        icon={<AlertCircle className="h-6 w-6" />}
        color="red"
      />
      <StatCard
        title="Upcoming Meetings"
        value={stats.upcomingMeetings}
        subtitle="Next 7 days"
        icon={<TrendingUp className="h-6 w-6" />}
        color="blue"
      />
    </div>
  );
};
