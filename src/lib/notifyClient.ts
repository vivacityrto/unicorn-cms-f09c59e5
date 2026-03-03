import { supabase } from '@/integrations/supabase/client';

interface NotifyClientParams {
  tenantId: number;
  /** Context of notification, e.g. "Action Created", "Note Added", "Time Logged" */
  context: string;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  createdByName?: string;
  packageId?: number;
}

/**
 * Sends an email to the tenant's Primary Contact with full details
 * via the send-composed-email edge function (Mailgun).
 */
export async function notifyClientPrimaryContact(params: NotifyClientParams): Promise<void> {
  const { tenantId, context, title, description, priority, dueDate, createdByName, packageId } = params;

  try {
    // 1. Resolve primary contact email
    const { data: primaryTu } = await supabase
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('primary_contact', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!primaryTu?.user_id) {
      console.warn('No primary contact found for tenant', tenantId);
      return;
    }

    const { data: contactUser } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('user_uuid', primaryTu.user_id)
      .single();

    if (!contactUser?.email) {
      console.warn('Primary contact has no email', primaryTu.user_id);
      return;
    }

    // 2. Get tenant name
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single();

    const tenantName = tenant?.name || `Tenant #${tenantId}`;
    const contactName = contactUser.first_name || 'there';

    // 3. Build email
    const subject = `${context}: ${title} — ${tenantName}`;

    const detailRows: string[] = [];
    detailRows.push(`<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#555;">Title</td><td style="padding:4px 0;">${escapeHtml(title)}</td></tr>`);
    if (description) {
      detailRows.push(`<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#555;">Description</td><td style="padding:4px 0;">${escapeHtml(description)}</td></tr>`);
    }
    if (priority) {
      detailRows.push(`<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#555;">Priority</td><td style="padding:4px 0;">${escapeHtml(priority)}</td></tr>`);
    }
    if (dueDate) {
      detailRows.push(`<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#555;">Due Date</td><td style="padding:4px 0;">${escapeHtml(dueDate)}</td></tr>`);
    }
    if (createdByName) {
      detailRows.push(`<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#555;">Created By</td><td style="padding:4px 0;">${escapeHtml(createdByName)}</td></tr>`);
    }

    const body_html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <p>Hi ${escapeHtml(contactName)},</p>
        <p>A new update has been recorded for <strong>${escapeHtml(tenantName)}</strong>:</p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
          ${detailRows.join('')}
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">This is an automated notification from Unicorn 2.0 by Vivacity Coaching & Consulting.</p>
      </div>
    `;

    // 4. Send via send-composed-email
    const { error } = await supabase.functions.invoke('send-composed-email', {
      body: {
        tenant_id: tenantId,
        package_id: packageId,
        to: contactUser.email,
        subject,
        body_html,
      },
    });

    if (error) {
      console.error('Failed to send client notification email:', error);
    }
  } catch (err) {
    console.error('notifyClientPrimaryContact error:', err);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
