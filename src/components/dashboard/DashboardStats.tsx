import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekTasksTable } from "./WeekTasksTable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

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
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <span className={cn("text-xs font-semibold", trend.isPositive ? "text-green-600" : "text-red-600")}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className={cn("p-3 rounded-xl transition-transform group-hover:scale-110 shrink-0", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

interface Activity {
  id: string;
  type: "document" | "user" | "package" | "task" | "inspection";
  title: string;
  description: string;
  timestamp: Date;
}

const activityColors = {
  document: "bg-blue-500/10 text-blue-600",
  user: "bg-green-500/10 text-green-600",
  package: "bg-purple-500/10 text-purple-600",
  task: "bg-primary/10 text-primary",
  inspection: "bg-orange-500/10 text-orange-600",
};

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
  activities?: Activity[];
}

export const DashboardStats = ({ stats, activities = [] }: DashboardStatsProps) => {
  // Fetch task-specific stats
  const { data: taskStats } = useQuery({
    queryKey: ["dashboard-task-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];

      // Total pending tasks
      const { count: pendingCount } = await supabase
        .from("tasks_tenants")
        .select("*", { count: "exact", head: true })
        .neq("status", "completed");

      // Overdue tasks
      const { count: overdueCount } = await supabase
        .from("tasks_tenants")
        .select("*", { count: "exact", head: true })
        .lt("due_date", today)
        .neq("status", "completed");

      // Completed this week
      const { count: completedCount } = await supabase
        .from("tasks_tenants")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("updated_at", weekAgoStr);

      // Total clients
      const { count: clientsCount } = await supabase
        .from("tenants")
        .select("*", { count: "exact", head: true });

      return {
        pending: pendingCount || 0,
        overdue: overdueCount || 0,
        completedThisWeek: completedCount || 0,
        totalClients: clientsCount || 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      {/* Top Stats Row - 4 cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Tasks"
          value={taskStats?.pending || 0}
          subtitle="In progress & pending"
          icon={<FileText className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Overdue Tasks"
          value={taskStats?.overdue || 0}
          subtitle="Needs attention"
          icon={<AlertTriangle className="h-6 w-6" />}
          color="red"
        />
        <StatCard
          title="Completed"
          value={taskStats?.completedThisWeek || 0}
          subtitle="This week"
          icon={<CheckCircle2 className="h-6 w-6" />}
          color="green"
        />
        <StatCard
          title="Total Clients"
          value={taskStats?.totalClients || stats.totalClients}
          subtitle="All tenants"
          icon={<Users className="h-6 w-6" />}
          color="purple"
        />
      </div>
      
      {/* Overdue Tasks Table + Recent Activity */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <WeekTasksTable />
        </div>
        <div className="col-span-1">
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0 px-4 pb-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {activities.length > 0 ? activities.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex gap-3 items-start p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className={`p-1.5 rounded-lg shrink-0 ${activityColors[activity.type]}`}>
                        <FileText className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-medium truncate">{activity.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
