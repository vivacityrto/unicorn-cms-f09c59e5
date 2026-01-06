-- Update stage details
UPDATE documents_stages SET
  short_name = 'Client Closure',
  description = 'Formal closure of the client engagement, including final communications and access reminders.',
  stage_type = 'offboarding',
  is_reusable = true
WHERE id = 128;

-- Insert Team Tasks for stage 128
INSERT INTO package_staff_tasks (package_id, stage_id, name, description, order_number, owner_role, is_mandatory)
VALUES
  (39, 128, 'ADMIN: Confirm Package Closure', 'Confirm the client engagement is ending.', 1, 'Admin', true),
  (39, 128, 'ADMIN: Archive Client Access', 'Prepare for closure of access per policy.', 2, 'Admin', true),
  (39, 128, 'EMAIL: Engagement Closure Notice', 'Send final closure email to the client.', 3, 'Admin', true);

-- Insert Client Tasks for stage 128
INSERT INTO package_client_tasks (package_id, stage_id, name, instructions, order_number)
VALUES
  (39, 128, 'Download Any Remaining Documents', 'Ensure all documents have been downloaded.', 1),
  (39, 128, 'Confirm Closure', 'Acknowledge closure of the engagement.', 2);

-- Create the email template
INSERT INTO email_templates (internal_name, slug, subject, html_body, description)
VALUES (
  'Vivacity Engagement Closure',
  'vivacity-engagement-closure',
  'Thank you – Vivacity engagement closure',
  '<p>Hello {{ClientName}},</p>
<p>This email confirms the closure of your Vivacity engagement.</p>
<p>Please ensure all documents and records have been downloaded and stored.</p>
<p>We appreciate working with you and wish you every success.</p>
<p>Kind regards,<br/>Vivacity Team</p>',
  'Final closure email sent when a client engagement ends.'
);

-- Link the email to the stage
INSERT INTO package_stage_emails (package_id, stage_id, email_template_id, trigger_type, recipient_type, sort_order, is_active)
SELECT 39, 128, id, 'manual', 'tenant', 1, true
FROM email_templates WHERE slug = 'vivacity-engagement-closure';