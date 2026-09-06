import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { appUrl } from "../_shared/app-base-url.ts";
import { cronUnauthorizedResponse, isCronAuthorized } from "../_shared/cron-auth.ts";

type ServiceClient = ReturnType<typeof createClient>;
type NotificationType = "due_soon" | "overdue" | "reminder_24h" | "reminder_10m" | string;
type NotificationSchedule = {
  id: number | string;
  user_id: string;
  tenant_id: number | string;
  entity_type: string;
  entity_id: number | string;
  notification_type: NotificationType;
};
type QuietHours = { start: string; end: string };
type UserNotificationPrefs = { quiet_hours?: QuietHours | null; email_enabled?: boolean; inapp_enabled?: boolean };
type NotificationData = {
  task_name?: string;
  description?: string;
  due_date?: string;
  days_overdue?: number;
  task_url?: string;
  tenant_name?: string;
  meeting_title?: string;
  meeting_url?: string;
  [key: string]: unknown;
};
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (!await isCronAuthorized(req)) {
    return cronUnauthorizedResponse(req, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("Processing notification queue...");

    const now = new Date();
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("notification_schedule")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString())
      .limit(50);

    if (fetchError) {
      throw fetchError;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log("No pending notifications to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(req) },
        },
      );
    }

    console.log(`Processing ${pendingNotifications.length} notifications`);

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        const isValid = await validateNotification(supabase, notification);
        if (!isValid) {
          console.log(`Cancelling invalid notification ${notification.id}`);
          await supabase
            .from("notification_schedule")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", notification.id);
          continue;
        }

        const { data: userPrefs } = await supabase
          .from("user_notification_prefs")
          .select("*")
          .eq("user_id", notification.user_id)
          .eq("tenant_id", notification.tenant_id)
          .single();

        if (userPrefs && isInQuietHours(userPrefs.quiet_hours)) {
          console.log(`Skipping notification ${notification.id} due to quiet hours`);
          const rescheduleTime = calculateNextAvailableTime(userPrefs.quiet_hours);
          await supabase
            .from("notification_schedule")
            .update({
              scheduled_for: rescheduleTime.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", notification.id);
          continue;
        }

        const notificationData = await getNotificationData(supabase, notification);

        if (userPrefs?.email_enabled !== false) {
          await sendEmailNotification(supabase, notification, notificationData, userPrefs);
        }

        if (userPrefs?.inapp_enabled !== false) {
          await sendInAppNotification(supabase, notification, notificationData);
        }

        await supabase
          .from("notification_schedule")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);

        if (notification.entity_type === "task") {
          await supabase
            .from("tasks_tenants")
            .update({
              last_reminder_at: new Date().toISOString(),
              reminder_count: supabase.rpc("increment", { x: 1 }),
            })
            .eq("id", notification.entity_id);
        }

        processed++;
        console.log(`Successfully processed notification ${notification.id}`);
      } catch (error: unknown) {
        console.error(`Error processing notification ${notification.id}:`, error);
        await supabase
          .from("notification_schedule")
          .update({
            status: "failed",
            error_message: errorMessage(error),
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
        failed++;
      }
    }

    console.log(`Processed ${processed} notifications, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        total: pendingNotifications.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  } catch (error: unknown) {
    console.error("Error in process-notification-queue:", error);
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }
};

async function validateNotification(supabase: ServiceClient, notification: NotificationSchedule): Promise<boolean> {
  const { entity_type, entity_id, notification_type } = notification;

  if (entity_type === "task") {
    const { data: task } = await supabase
      .from("tasks_tenants")
      .select("completed, status")
      .eq("id", entity_id)
      .single();

    if (!task || task.completed || task.status === "completed") {
      return false;
    }

    if (notification_type === "overdue") {
      const { data: taskDetails } = await supabase
        .from("tasks_tenants")
        .select("due_date")
        .eq("id", entity_id)
        .single();

      if (taskDetails && new Date(taskDetails.due_date) > new Date()) {
        return false;
      }
    }
  }

  return true;
}

function isInQuietHours(quietHours: QuietHours | null | undefined): boolean {
  if (!quietHours) return false;

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const { start, end } = quietHours;

  if (start > end) {
    return currentTime >= start || currentTime <= end;
  }

  return currentTime >= start && currentTime <= end;
}

function calculateNextAvailableTime(quietHours: QuietHours): Date {
  const now = new Date();
  const endTime = quietHours.end;
  const [hours, minutes] = endTime.split(":").map(Number);

  const nextAvailable = new Date(now);
  nextAvailable.setHours(hours, minutes, 0, 0);

  if (nextAvailable <= now) {
    nextAvailable.setDate(nextAvailable.getDate() + 1);
  }

  return nextAvailable;
}

async function getNotificationData(supabase: ServiceClient, notification: NotificationSchedule): Promise<NotificationData> {
  const { entity_type, entity_id, notification_type } = notification;

  if (entity_type === "task") {
    const { data: task } = await supabase
      .from("tasks_tenants")
      .select("*, tenants(*)")
      .eq("id", entity_id)
      .single();

    if (!task) return null;

    return {
      task_name: task.task_name,
      description: task.description,
      due_date: task.due_date,
      days_overdue: notification_type === "overdue"
        ? Math.floor((new Date().getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      task_url: appUrl(`/tasks/${entity_id}`),
      tenant_name: task.tenants?.name,
    };
  }

  return {};
}

async function sendEmailNotification(supabase: ServiceClient, notification: NotificationSchedule, data: NotificationData, _userPrefs: UserNotificationPrefs): Promise<void> {
  const { data: user } = await supabase.auth.admin.getUserById(notification.user_id);
  if (!user?.user?.email) {
    console.error("User email not found");
    return;
  }

  const emailTypeMap: Record<string, string> = {
    due_soon: "task_due_soon",
    overdue: "task_overdue",
    reminder_24h: "meeting_reminder_24h",
    reminder_10m: "meeting_reminder_10m",
  };

  const emailType = emailTypeMap[notification.notification_type];
  if (!emailType) {
    console.error(`Unknown email type for notification: ${notification.notification_type}`);
    return;
  }

  await supabase.functions.invoke("send-notification-email", {
    body: {
      to: user.user.email,
      type: emailType,
      data,
    },
  });
}

async function sendInAppNotification(supabase: ServiceClient, notification: NotificationSchedule, data: NotificationData): Promise<void> {
  await supabase.from("notification_tenants").insert({
    tenant_id: notification.tenant_id,
    user_id: notification.user_id,
    type: notification.notification_type,
    title: getNotificationTitle(notification.notification_type, data),
    message: getNotificationMessage(notification.notification_type, data),
    link: data.task_url || data.meeting_url,
    is_read: false,
  });
}

function getNotificationTitle(type: string, _data: NotificationData): string {
  switch (type) {
    case "due_soon":
      return `Task Due Soon`;
    case "overdue":
      return `Task Overdue`;
    case "reminder_24h":
      return `Meeting Tomorrow`;
    case "reminder_10m":
      return `Meeting Starting Soon`;
    default:
      return "Notification";
  }
}

function getNotificationMessage(type: string, data: NotificationData): string {
  switch (type) {
    case "due_soon":
      return `${data.task_name} is due on ${data.due_date}`;
    case "overdue":
      return `${data.task_name} is ${data.days_overdue} day(s) overdue`;
    case "reminder_24h":
      return `${data.meeting_title} is scheduled for tomorrow`;
    case "reminder_10m":
      return `${data.meeting_title} starts in 10 minutes`;
    default:
      return "";
  }
}

serve(handler);
