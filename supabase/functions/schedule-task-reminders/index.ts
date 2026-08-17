import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ScheduleTaskRemindersRequest {
  task_id: string;
  tenant_id: number;
  assigned_to?: string;
  due_date: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { task_id, tenant_id, assigned_to, due_date }: ScheduleTaskRemindersRequest = await req.json();

    console.log("Scheduling reminders for task:", { task_id, tenant_id, due_date });

    // Get user preferences for the assigned user
    let userPrefs = null;
    if (assigned_to) {
      const { data: prefs } = await supabase
        .from("user_notification_prefs")
        .select("*")
        .eq("user_id", assigned_to)
        .eq("tenant_id", tenant_id)
        .single();

      userPrefs = prefs;
    }

    // Default settings if no preferences found
    const eventSettings = userPrefs?.event_settings || {
      task_due_soon: { email: true, inapp: true, days_before: 3 },
      task_overdue: { email: true, inapp: true, escalate_after_days: 3 }
    };

    const dueDate = new Date(due_date);
    const scheduledNotifications = [];

    // Schedule "due soon" reminder (X days before due date)
    if (eventSettings.task_due_soon?.email || eventSettings.task_due_soon?.inapp) {
      const daysBefore = eventSettings.task_due_soon.days_before || 3;
      const dueSoonDate = new Date(dueDate);
      dueSoonDate.setDate(dueSoonDate.getDate() - daysBefore);

      // Only schedule if in the future
      if (dueSoonDate > new Date()) {
        const { data: notification, error: dueSoonError } = await supabase
          .from("notification_schedule")
          .insert({
            tenant_id,
            user_id: assigned_to,
            entity_type: "task",
            entity_id: task_id,
            notification_type: "due_soon",
            scheduled_for: dueSoonDate.toISOString(),
            status: "pending"
          })
          .select()
          .single();

        if (dueSoonError) {
          console.error("Error scheduling due soon notification:", dueSoonError);
        } else {
          scheduledNotifications.push(notification);
          console.log("Scheduled due soon notification:", notification.id);
        }
      }
    }

    // Schedule "overdue" reminder (1 day after due date)
    if (eventSettings.task_overdue?.email || eventSettings.task_overdue?.inapp) {
      const overdueDate = new Date(dueDate);
      overdueDate.setDate(overdueDate.getDate() + 1);
      overdueDate.setHours(9, 0, 0, 0); // 9 AM next day

      const { data: notification, error: overdueError } = await supabase
        .from("notification_schedule")
        .insert({
          tenant_id,
          user_id: assigned_to,
          entity_type: "task",
          entity_id: task_id,
          notification_type: "overdue",
          scheduled_for: overdueDate.toISOString(),
          status: "pending"
        })
        .select()
        .single();

      if (overdueError) {
        console.error("Error scheduling overdue notification:", overdueError);
      } else {
        scheduledNotifications.push(notification);
        console.log("Scheduled overdue notification:", notification.id);
      }
    }

    // Log to workflow logs
    await supabase.from("package_workflow_logs").insert({
      tenant_id,
      package_id: null,
      action: "reminders_scheduled",
      details: {
        task_id,
        notifications_count: scheduledNotifications.length,
        notification_types: scheduledNotifications.map(n => n.notification_type)
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_count: scheduledNotifications.length,
        notifications: scheduledNotifications
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in schedule-task-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
