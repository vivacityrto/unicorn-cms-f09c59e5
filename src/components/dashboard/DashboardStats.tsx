import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekTasksTable } from "./WeekTasksTable";

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
  <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <span className={cn("text-xs font-semibold", trend.isPositive ? "text-green-600" : "text-red-600")}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className={cn("p-2 rounded-lg transition-transform group-hover:scale-110 shrink-0", colorClasses[color])}>
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
    <div className="grid grid-cols-4 gap-4">
      {/* Week Tasks Table - spans 3 columns */}
      <div className="col-span-3">
        <WeekTasksTable />
      </div>
      
      {/* 4 stat cards stacked in 1 column */}
      <div className="col-span-1 grid grid-rows-4 gap-3">
        <StatCard
          title="Team Members"
          value={stats.totalUsers}
          subtitle="All tenants"
          icon={<Users className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="Documents"
          value={stats.documentsCount}
          subtitle="Total managed"
          icon={<FileText className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="Inspections"
          value={stats.activeInspections}
          subtitle="In progress"
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
        />
        <StatCard
          title="Meetings"
          value={stats.upcomingMeetings}
          subtitle="Next 7 days"
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />
      </div>
    </div>
  );
};
