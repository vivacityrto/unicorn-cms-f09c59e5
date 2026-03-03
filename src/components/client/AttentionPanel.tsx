import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Bell, Lock, ShieldAlert, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useClientAllTasks } from "@/hooks/useClientAllTasks";
import { useClientNotifications } from "@/hooks/useClientNotifications";
import { useClientProgress } from "@/hooks/useClientProgress";
import { useClientTenant } from "@/contexts/ClientTenantContext";

interface AttentionItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  severity: "destructive" | "warning" | "info";
}

export function AttentionPanel() {
  const { activeTenantId } = useClientTenant();
  const { data: tasks = [] } = useClientAllTasks();
  const { unreadCount } = useClientNotifications();
  const { data: progressList } = useClientProgress(activeTenantId);

  const items: AttentionItem[] = [];

  // Overdue tasks
  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  if (overdueCount > 0) {
    items.push({
      key: "overdue",
      icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      label: `${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}`,
      href: "/client/tasks",
      severity: "destructive",
    });
  }

  // Due soon tasks
  const dueSoonCount = tasks.filter((t) => t.isDueSoon).length;
  if (dueSoonCount > 0) {
    items.push({
      key: "due_soon",
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      label: `${dueSoonCount} task${dueSoonCount !== 1 ? "s" : ""} due soon`,
      href: "/client/tasks",
      severity: "warning",
    });
  }

  // Unread notifications
  if (unreadCount > 0) {
    items.push({
      key: "notifications",
      icon: <Bell className="h-4 w-4 text-primary" />,
      label: `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`,
      href: "/client/notifications",
      severity: "info",
    });
  }

  // Risk alerts from progress
  if (progressList) {
    for (const p of progressList) {
      if (p.risk_state === "action_required") {
        items.push({
          key: `risk-${p.package_instance_id}`,
          icon: <ShieldAlert className="h-4 w-4 text-destructive" />,
          label: `${p.package_name}: Action required`,
          href: "/client/tasks",
          severity: "destructive",
        });
      }
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-muted-foreground py-8">
          You're all caught up — nothing needs your attention right now.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-1">
        <h3 className="font-semibold text-foreground mb-3">What needs attention</h3>
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60 transition-colors group"
          >
            {item.icon}
            <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
