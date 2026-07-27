import { supabase } from '@/integrations/supabase/client';

export interface ActionItemNotifyRecipient {
  user_uuid: string;
  first_name: string | null;
  email: string | null;
}

interface NotifyActionItemCreatedParams {
  tenantId: number;
  tenantName: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  createdByName?: string;
  recipients: ActionItemNotifyRecipient[];
  /** 'created' (default) for a brand-new item, 'added' when notifying someone newly added on an edit. */
  context?: 'created' | 'added';
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748b',
  normal: '#2563eb',
  medium: '#2563eb',
  high: '#ea580c',
  urgent: '#dc2626',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDueDate(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Branded action-item email — kept visually in sync by hand with the
 * server-side template in supabase/functions/send-action-item-due-reminders
 * (different runtimes, so not literally shared code).
 */
function buildActionItemEmailHtml(opts: {
  recipientName: string;
  tenantName: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  createdByName?: string;
  actionUrl: string;
  context: 'created' | 'added';
}): string {
  const { recipientName, tenantName, title, description, priority, dueDate, createdByName, actionUrl, context } = opts;
  const priorityColor = PRIORITY_COLORS[priority] || '#64748b';
  const eyebrow = context === 'added' ? 'Added to an action item' : 'New action item';
  const intro = context === 'added'
    ? `Hi ${escapeHtml(recipientName)}, you've been added to notifications for an action item for <strong>${escapeHtml(tenantName)}</strong>.`
    : `Hi ${escapeHtml(recipientName)}, a new action item has been created for <strong>${escapeHtml(tenantName)}</strong>.`;

  const rows: string[] = [];
  if (description) {
    rows.push(`<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;width:110px;">Description</td><td style="padding:6px 0;color:#333;">${escapeHtml(description)}</td></tr>`);
  }
  rows.push(`<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;">Priority</td><td style="padding:6px 0;"><span style="display:inline-block;padding:2px 10px;border-radius:10px;background:${priorityColor};color:#fff;font-size:12px;font-weight:600;text-transform:capitalize;">${escapeHtml(priority)}</span></td></tr>`);
  if (dueDate) {
    rows.push(`<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;">Due Date</td><td style="padding:6px 0;color:#333;">${formatDueDate(dueDate)}</td></tr>`);
  }
  if (createdByName) {
    rows.push(`<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#44235F;vertical-align:top;">Created By</td><td style="padding:6px 0;color:#333;">${escapeHtml(createdByName)}</td></tr>`);
  }

  return `
<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#7130A0,#ED1878);padding:20px 28px;border-radius:8px 8px 0 0;">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Unicorn</span>
  </div>
  <div style="border:1px solid #DFD8E8;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
    <p style="margin:0 0 4px;color:#44235F;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
      ${eyebrow}
    </p>
    <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:19px;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 20px;color:#333;font-size:14px;">
      ${intro}
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px;">
      ${rows.join('')}
    </table>
    <a href="${actionUrl}" style="display:inline-block;background:#7130A0;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600;">View in Unicorn</a>
    <p style="margin:28px 0 0;color:#888;font-size:11px;">This is an automated notification from Unicorn 2.0 by Vivacity Coaching &amp; Consulting.</p>
  </div>
</div>`;
}

/**
 * Emails every recipient (internal staff + tenant users) that a new action
 * item was created for their client, using the existing send-composed-email
 * edge function (already auth'd for staff/tenant-member callers). Best-effort
 * per recipient — one failure doesn't block the others.
 */
export async function notifyActionItemCreated(params: NotifyActionItemCreatedParams): Promise<void> {
  const { tenantId, tenantName, title, description, priority, dueDate, createdByName, recipients, context = 'created' } = params;
  const actionUrl = `${window.location.origin}/tenant/${tenantId}?tab=actions`;
  const subject = context === 'added'
    ? `You've been added to an action item: ${title} — ${tenantName}`
    : `New action item: ${title} — ${tenantName}`;

  await Promise.all(
    recipients
      .filter((r) => !!r.email)
      .map(async (recipient) => {
        const html = buildActionItemEmailHtml({
          recipientName: recipient.first_name || 'there',
          tenantName,
          title,
          description,
          priority,
          dueDate,
          createdByName,
          actionUrl,
          context,
        });

        try {
          const { error } = await supabase.functions.invoke('send-composed-email', {
            body: {
              tenant_id: tenantId,
              to: recipient.email,
              subject,
              body_html: html,
            },
          });
          if (error) console.error('Failed to send action item email to', recipient.email, error);
        } catch (err) {
          console.error('notifyActionItemCreated error for', recipient.email, err);
        }
      }),
  );
}
