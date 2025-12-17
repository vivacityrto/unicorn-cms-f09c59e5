import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isPast } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";

interface FollowerUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface OverdueTask {
  id: string;
  task_name: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  tenant_id: number;
  tenant_name?: string;
  followers: string[];
  follower_users?: FollowerUser[];
}

export const WeekTasksTable = () => {
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["dashboard-overdue-tasks"],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Get total count of overdue tasks
      const { count: totalCount } = await supabase
        .from("tasks_tenants")
        .select("*", { count: "exact", head: true })
        .lt("due_date", today)
        .neq("status", "completed");

      const { data, error } = await supabase
        .from("tasks_tenants")
        .select(`
          id,
          task_name,
          description,
          due_date,
          status,
          tenant_id,
          followers,
          tenants (name)
        `)
        .lt("due_date", today)
        .neq("status", "completed")
        .order("due_date", { ascending: true })
        .limit(5);

      if (error) throw error;

      // Get all unique follower IDs
      const allFollowerIds = [...new Set((data || []).flatMap((t: any) => t.followers || []))];
      
      // Fetch follower user details
      let followerUsers: FollowerUser[] = [];
      if (allFollowerIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name, avatar_url")
          .in("user_uuid", allFollowerIds);
        followerUsers = usersData || [];
      }

      const tasks = (data || []).map((task: any) => ({
        id: task.id,
        task_name: task.task_name,
        description: task.description,
        due_date: task.due_date,
        status: task.status,
        tenant_id: task.tenant_id,
        tenant_name: task.tenants?.name,
        followers: task.followers || [],
        follower_users: (task.followers || []).map((fid: string) => 
          followerUsers.find(u => u.user_uuid === fid)
        ).filter(Boolean),
      }));

      return { tasks, totalCount: totalCount || 0 };
    },
  });

  const tasks = queryResult?.tasks || [];
  const totalCount = queryResult?.totalCount || 0;

  const getStatusBadge = (status: string | null, dueDate: string | null) => {
    const isOverdue = dueDate && isPast(new Date(dueDate)) && status !== "completed";
    
    if (isOverdue) {
      return (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
            Overdue
          </Badge>
        </div>
      );
    }

    const variants: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      completed: {
        label: "Completed",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium",
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      },
      in_progress: {
        label: "In Progress",
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]",
        icon: <Clock className="h-4 w-4 text-yellow-600" />
      },
      not_started: {
        label: "Not Started",
        className: "bg-muted text-muted-foreground border-border text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]",
        icon: <Clock className="h-4 w-4 text-muted-foreground" />
      }
    };
    const key = status?.toLowerCase() || "not_started";
    const { label, className, icon } = variants[key] || variants.not_started;
    return (
      <div className="flex items-center gap-1.5">
        {icon}
        <Badge variant="outline" className={className}>{label}</Badge>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Overdue Tasks
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
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Overdue Tasks
        </CardTitle>
        <Link 
          to="/tasks" 
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          View More ({totalCount})
        </Link>
      </CardHeader>
      <CardContent className="p-0 h-[280px] overflow-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-6">
            <CheckCircle2 className="h-10 w-10 text-green-500/50 mb-2" />
            <p className="text-sm text-muted-foreground">No overdue tasks</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Followers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium max-w-[180px] truncate">
                    {task.task_name || "Untitled task"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {task.tenant_name || "-"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(task.status, task.due_date)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center gap-1">
                      {task.follower_users && task.follower_users.length > 0 ? (
                        task.follower_users.slice(0, 3).map((follower) => (
                          <Avatar key={follower.user_uuid} className="h-8 w-8 border border-background">
                            {follower.avatar_url && <AvatarImage src={follower.avatar_url} />}
                            <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
                              {follower.first_name?.[0]}{follower.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                      {task.follower_users && task.follower_users.length > 3 && (
                        <span className="text-xs text-muted-foreground ml-1">+{task.follower_users.length - 3}</span>
                      )}
                    </div>
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
