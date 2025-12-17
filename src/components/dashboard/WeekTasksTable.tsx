import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, isPast, startOfWeek } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface WeekTask {
  id: string;
  task_name: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  tenant_id: number;
  tenant_name?: string;
}

export const WeekTasksTable = () => {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["dashboard-week-tasks"],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data, error } = await supabase
        .from("tasks_tenants")
        .select(`
          id,
          task_name,
          description,
          due_date,
          status,
          tenant_id,
          tenants (name)
        `)
        .gte("due_date", weekStart.toISOString().split('T')[0])
        .lte("due_date", weekEnd.toISOString().split('T')[0])
        .neq("status", "completed")
        .order("due_date", { ascending: true })
        .limit(8);

      if (error) throw error;

      return (data || []).map((task: any) => ({
        id: task.id,
        task_name: task.task_name,
        description: task.description,
        due_date: task.due_date,
        status: task.status,
        tenant_id: task.tenant_id,
        tenant_name: task.tenants?.name,
      }));
    },
  });

  const getStatusBadge = (status: string | null) => {
    const variants: Record<string, { label: string; className: string }> = {
      completed: {
        label: "Completed",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium"
      },
      in_progress: {
        label: "In Progress",
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      },
      not_started: {
        label: "Not Started",
        className: "bg-muted text-muted-foreground border-border text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      }
    };
    const key = status?.toLowerCase() || "not_started";
    const { label, className } = variants[key] || variants.not_started;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  const getStatusIcon = (status: string | null, dueDate: string | null) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (dueDate && isPast(new Date(dueDate))) {
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const formatDueDate = (date: string | null) => {
    if (!date) return "No date";
    const d = new Date(date + 'T00:00:00');
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "MMM d");
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Week Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-primary" />
          Week Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-6">
            <CheckCircle2 className="h-10 w-10 text-green-500/50 mb-2" />
            <p className="text-sm text-muted-foreground">No pending tasks this week</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32px] pl-4"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="pl-4">
                    {getStatusIcon(task.status, task.due_date)}
                  </TableCell>
                  <TableCell className="font-medium max-w-[180px] truncate">
                    {task.task_name || "Untitled task"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {task.tenant_name || "-"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(task.status)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm pr-4">
                    {formatDueDate(task.due_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
