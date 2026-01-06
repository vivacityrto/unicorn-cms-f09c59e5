-- Update stage 127 with proper details
UPDATE documents_stages 
SET 
  short_name = 'Client Onboarding',
  description = 'Initial onboarding stage to welcome the client, confirm engagement details, assign Client Success Consultant, and prepare the client for delivery.',
  stage_type = 'onboarding',
  is_reusable = true
WHERE id = 127;

-- Insert Team Tasks for stage 127, package 39
INSERT INTO package_staff_tasks (package_id, stage_id, name, description, order_number, owner_role, is_mandatory)
VALUES 
  (39, 127, 'ADMIN: Assign Client Success Consultant (CSC)', 'Allocate a CSC to the client package and confirm handover.', 1, 'Admin', true),
  (39, 127, 'ADMIN: Confirm Package Scope and Entitlements', 'Confirm package inclusions, hours, duration, and delivery expectations.', 2, 'Admin', true),
  (39, 127, 'EMAIL: Welcome and Next Steps', 'Send onboarding welcome email to the client.', 3, 'Admin', true),
  (39, 127, 'ADMIN: Activate Client Portal Access', 'Confirm tenant users can access the client portal.', 4, 'Admin', true);

-- Insert Client Tasks for stage 127, package 39
INSERT INTO package_client_tasks (package_id, stage_id, name, instructions, order_number)
VALUES 
  (39, 127, 'Review Welcome Information', 'Read the welcome email and familiarise yourself with your Vivacity membership.', 1),
  (39, 127, 'Confirm Primary Contact Details', 'Confirm or update your primary contact details in the portal.', 2);

-- Create the email template with all required fields
INSERT INTO email_templates (id, internal_name, slug, subject, html_body, description)
VALUES (
  gen_random_uuid(),
  'Welcome to Vivacity – Getting Started',
  'welcome-to-vivacity-getting-started',
  'Welcome to Vivacity – Let''s get started',
  '<p>Hello {{ClientName}},</p>
<p>Welcome to Vivacity.</p>
<p>Your {{PackageName}} has now commenced and your Client Success Consultant is {{CSCName}}.</p>
<p>Next steps:</p>
<ul>
<li>Access the Unicorn client portal</li>
<li>Review your package inclusions</li>
<li>Prepare for document delivery</li>
</ul>
<p>If you have any questions, contact {{CSCEmail}}.</p>
<p>Kind regards,<br/>Vivacity Team</p>',
  'Onboarding welcome email sent to new clients when their package commences.'
)
ON CONFLICT (slug) DO NOTHING;

-- Link the email to the stage
INSERT INTO package_stage_emails (package_id, stage_id, email_template_id, trigger_type, recipient_type, sort_order, is_active)
SELECT 
  39, 
  127, 
  id,
  'manual',
  'tenant',
  1,
  true
FROM email_templates 
WHERE internal_name = 'Welcome to Vivacity – Getting Started'
LIMIT 1;