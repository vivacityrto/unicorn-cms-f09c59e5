import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDashboardData = () => {
  // Fetch total clients (tenants)
  const { data: tenantsCount = 0 } = useQuery({
    queryKey: ["dashboard-tenants-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tenants")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch active packages
  const { data: packagesCount = 0 } = useQuery({
    queryKey: ["dashboard-packages-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("packages")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch total users
  const { data: usersCount = 0 } = useQuery({
    queryKey: ["dashboard-users-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("archived", false);
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch documents count
  const { data: documentsCount = 0 } = useQuery({
    queryKey: ["dashboard-documents-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch pending tasks
  const { data: pendingTasks = 0 } = useQuery({
    queryKey: ["dashboard-pending-tasks"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("documents_notes")
        .select("*", { count: "exact", head: true })
        .is("completed_date", null);
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch completed tasks this month
  const { data: completedThisMonth = 0 } = useQuery({
    queryKey: ["dashboard-completed-tasks"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { count, error } = await supabase
        .from("documents_notes")
        .select("*", { count: "exact", head: true })
        .not("completed_date", "is", null)
        .gte("completed_date", startOfMonth.toISOString());
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch active inspections
  const { data: activeInspections = 0 } = useQuery({
    queryKey: ["dashboard-active-inspections"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("audit_inspection")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_progress");
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch upcoming meetings
  const { data: upcomingMeetings = 0 } = useQuery({
    queryKey: ["dashboard-upcoming-meetings"],
    queryFn: async () => {
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);
      
      const { count, error } = await supabase
        .from("eos_meetings")
        .select("*", { count: "exact", head: true })
        .gte("scheduled_date", now.toISOString())
        .lte("scheduled_date", nextWeek.toISOString());
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch packages with client counts
  const { data: packageData = [] } = useQuery({
    queryKey: ["dashboard-package-data"],
    queryFn: async () => {
      const { data: packages, error } = await supabase
        .from("packages")
        .select("id, name")
        .eq("status", "active")
        .limit(6);
      
      if (error) throw error;
      
      const result = await Promise.all(
        (packages || []).map(async (pkg) => {
          const { count: clientCount } = await supabase
            .from("tenants")
            .select("*", { count: "exact", head: true })
            .contains("package_ids", [pkg.id]);
          
          return {
            name: pkg.name?.substring(0, 10) || `Pkg ${pkg.id}`,
            clients: clientCount || 0,
            completed: Math.floor((clientCount || 0) * 0.6), // Simulated completed
          };
        })
      );
      
      return result;
    },
  });

  // Fetch recent clients
  const { data: recentClients = [] } = useQuery({
    queryKey: ["dashboard-recent-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, status, packages(name)")
        .order("created_at", { ascending: false })
        .limit(8);
      
      if (error) throw error;
      
      return (data || []).map((t) => ({
        id: t.id,
        name: t.name || `Tenant ${t.id}`,
        status: t.status || "active",
        package: t.packages?.name,
        created_at: new Date().toISOString(),
      }));
    },
  });

  // Fetch tenant status distribution
  const { data: statusData = [] } = useQuery({
    queryKey: ["dashboard-status-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("status");
      
      if (error) throw error;
      
      const counts = (data || []).reduce((acc, t) => {
        const status = t.status || "active";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return [
        { name: "Active", value: counts.active || 0, color: "hsl(142, 76%, 36%)" },
        { name: "Pending", value: counts.pending || 0, color: "hsl(38, 92%, 50%)" },
        { name: "Inactive", value: counts.inactive || 0, color: "hsl(0, 84%, 60%)" },
        { name: "On Hold", value: counts.hold || 0, color: "hsl(215, 20%, 65%)" },
      ].filter(s => s.value > 0);
    },
  });

  // Mock monthly data (would come from actual analytics in production)
  const monthlyData = [
    { month: "Jul", tasks: 45, completed: 38 },
    { month: "Aug", tasks: 52, completed: 45 },
    { month: "Sep", tasks: 48, completed: 42 },
    { month: "Oct", tasks: 61, completed: 55 },
    { month: "Nov", tasks: 55, completed: 48 },
    { month: "Dec", tasks: 67, completed: 58 },
  ];

  // Mock activities (would come from audit_events in production)
  const activities = [
    { id: "1", type: "document" as const, title: "Document Updated", description: "RTO Policy Manual was updated", timestamp: new Date(Date.now() - 1000 * 60 * 30), user: { name: "Angela Smith" } },
    { id: "2", type: "user" as const, title: "New User Added", description: "John Doe was added to Metro RTO", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), user: { name: "Admin User" } },
    { id: "3", type: "task" as const, title: "Task Completed", description: "Mock Audit stage completed", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), user: { name: "Sarah Johnson" } },
    { id: "4", type: "inspection" as const, title: "Inspection Started", description: "New compliance inspection begun", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8), user: { name: "Michael Lee" } },
    { id: "5", type: "package" as const, title: "Package Assigned", description: "Kickstart RTO assigned to client", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), user: { name: "Angela Smith" } },
  ];

  const stats = {
    totalClients: tenantsCount,
    activePackages: packagesCount,
    totalUsers: usersCount,
    documentsCount,
    pendingTasks,
    completedThisMonth,
    activeInspections,
    upcomingMeetings,
  };

  return {
    stats,
    packageData,
    monthlyData,
    statusData,
    activities,
    recentClients,
  };
};
