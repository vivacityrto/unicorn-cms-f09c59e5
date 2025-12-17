import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, isPast, startOfWeek, endOfWeek } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface WeekTask {
  id: string;
  note_details: string;
  note_type: string | null;
  priority: string | null;
  started_date: string | null;
  completed_date: string | null;
  tenant_id: number;
  tenant_name?: string;
}

export const WeekTasksTable = () => {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["dashboard-week-tasks"],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("documents_notes")
        .select(`
          id,
          note_details,
          note_type,
          priority,
          started_date,
          completed_date,
          tenant_id,
          tenants (name)
        `)
        .or(`started_date.gte.${weekStart.toISOString()},started_date.is.null`)
        .is("completed_date", null)
        .order("started_date", { ascending: true })
        .limit(10);

      if (error) throw error;

      return (data || []).map((task: any) => ({
        id: task.id,
        note_details: task.note_details,
        note_type: task.note_type,
        priority: task.priority,
        started_date: task.started_date,
        completed_date: task.completed_date,
        tenant_id: task.tenant_id,
        tenant_name: task.tenants?.name,
      }));
    },
  });

  const getPriorityBadge = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case "medium":
        return <Badge variant="default" className="text-xs bg-orange-500">Medium</Badge>;
      case "low":
        return <Badge variant="secondary" className="text-xs">Low</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">-</Badge>;
    }
  };

  const getStatusIcon = (startedDate: string | null, completedDate: string | null) => {
    if (completedDate) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (startedDate && isPast(new Date(startedDate))) {
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const formatDueDate = (date: string | null) => {
    if (!date) return "No date";
    const d = new Date(date);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "MMM d");
  };

  if (isLoading) {
    return (
      <Card className="col-span-full lg:col-span-2 border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Week Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full lg:col-span-2 border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-primary" />
          Week Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500/50 mb-3" />
            <p className="text-muted-foreground">No pending tasks this week</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    {getStatusIcon(task.started_date, task.completed_date)}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {task.note_details || "Untitled task"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task.tenant_name || "-"}
                  </TableCell>
                  <TableCell>
                    {getPriorityBadge(task.priority)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDueDate(task.started_date)}
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
