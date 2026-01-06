-- Create the reusable Onboarding stage
INSERT INTO public.documents_stages (title, short_name, description, stage_type, is_reusable, ai_hint, status, dashboard_visible)
VALUES (
  'Onboarding – Client Commencement',
  'onboarding-commencement',
  'Initial client onboarding including access setup, intake documentation, and first CSC meeting.',
  'onboarding',
  true,
  'Initial client onboarding, access setup, intake, and first meeting.',
  'not_started',
  true
);

-- Insert all related data
DO $$
DECLARE
  v_stage_id bigint;
BEGIN
  SELECT id INTO v_stage_id FROM public.documents_stages 
  WHERE title = 'Onboarding – Client Commencement' 
  ORDER BY created_at DESC LIMIT 1;

  -- Insert Email Templates
  INSERT INTO public.email_templates (internal_name, slug, subject, html_body, description, editor_type)
  VALUES 
    ('New Client Assigned – Internal', 'onboarding-new-client-internal', 'New client assigned – {{ClientName}}',
     '<p>Hello team,</p><p>A new client has been assigned.</p><p><strong>Client:</strong> {{ClientName}}<br><strong>Package:</strong> {{PackageName}}<br><strong>CSC:</strong> {{CSCName}}</p><p>Please begin onboarding tasks as outlined in Unicorn.</p><p>Thank you.</p>',
     'Internal notification when a new client is assigned to begin onboarding.', 'html'),
    ('Welcome to Vivacity', 'onboarding-welcome', 'Welcome to Vivacity – next steps',
     '<p>Hello {{ClientName}},</p><p>Welcome to Vivacity.</p><p>We are pleased to confirm the commencement of your {{PackageName}} package.</p><p>Your Client Success Consultant is {{CSCName}}. They will guide you through onboarding and ongoing support.</p><p><strong>Next steps:</strong></p><ul><li>Review your welcome pack.</li><li>Upload requested documents.</li><li>Book your introduction meeting.</li></ul><p>If you have questions, contact {{CSCEmail}}.</p><p>Kind regards,<br>Vivacity Team</p>',
     'Welcome email sent to new clients at the start of onboarding.', 'html'),
    ('Introduction Meeting Booking', 'onboarding-meeting-booking', 'Book your introduction meeting',
     '<p>Hello {{ClientName}},</p><p>Please book your introduction meeting using the link below:</p><p><a href="{{BookingLink}}">{{BookingLink}}</a></p><p>This meeting confirms scope, timelines, and priorities.</p><p>Regards,<br>Vivacity Team</p>',
     'Email prompting client to book their introduction meeting.', 'html'),
    ('Request for Previous ASQA Documents', 'onboarding-asqa-request', 'Request for previous ASQA documents',
     '<p>Hello {{ClientName}},</p><p>To complete onboarding, please upload:</p><ul><li>Previous ASQA audit reports.</li><li>Financial Performance and Position (FPP).</li><li>CEO statutory declarations.</li></ul><p>These documents help us provide accurate advice.</p><p>Thank you,<br>Vivacity Team</p>',
     'Manual email requesting ASQA-related documents from client.', 'html'),
    ('Onboarding Complete', 'onboarding-complete', 'Onboarding complete – next phase begins',
     '<p>Hello {{ClientName}},</p><p>Your onboarding is now complete.</p><p>We will move into the next phase of your package and continue working with you on agreed priorities.</p><p>If anything changes, contact your CSC.</p><p>Kind regards,<br>Vivacity Team</p>',
     'Email sent when onboarding stage is completed.', 'html');

  -- Insert stage-linked emails
  INSERT INTO public.emails (order_number, name, description, subject, content, stage_id, "to")
  VALUES 
    (1, 'New Client Assigned – Internal', 'Internal notification when a new client is assigned', 'New client assigned – {{ClientName}}', 
     E'Hello team,\n\nA new client has been assigned.\n\nClient: {{ClientName}}\nPackage: {{PackageName}}\nCSC: {{CSCName}}\n\nPlease begin onboarding tasks as outlined in Unicorn.\n\nThank you.', v_stage_id, 'internal'),
    (2, 'Welcome to Vivacity', 'Welcome email to new clients', 'Welcome to Vivacity – next steps',
     E'Hello {{ClientName}},\n\nWelcome to Vivacity.\n\nWe are pleased to confirm the commencement of your {{PackageName}} package.\n\nYour Client Success Consultant is {{CSCName}}.\nThey will guide you through onboarding and ongoing support.\n\nNext steps:\n- Review your welcome pack.\n- Upload requested documents.\n- Book your introduction meeting.\n\nIf you have questions, contact {{CSCEmail}}.\n\nKind regards,\nVivacity Team', v_stage_id, 'client'),
    (3, 'Introduction Meeting Booking', 'Prompt to book introduction meeting', 'Book your introduction meeting',
     E'Hello {{ClientName}},\n\nPlease book your introduction meeting using the link below:\n\n{{BookingLink}}\n\nThis meeting confirms scope, timelines, and priorities.\n\nRegards,\nVivacity Team', v_stage_id, 'client'),
    (4, 'Request for Previous ASQA Documents', 'Manual request for ASQA documents', 'Request for previous ASQA documents',
     E'Hello {{ClientName}},\n\nTo complete onboarding, please upload:\n- Previous ASQA audit reports.\n- Financial Performance and Position (FPP).\n- CEO statutory declarations.\n\nThese documents help us provide accurate advice.\n\nThank you,\nVivacity Team', v_stage_id, 'client'),
    (5, 'Onboarding Complete', 'Notification when onboarding is complete', 'Onboarding complete – next phase begins',
     E'Hello {{ClientName}},\n\nYour onboarding is now complete.\n\nWe will move into the next phase of your package and continue working with you on agreed priorities.\n\nIf anything changes, contact your CSC.\n\nKind regards,\nVivacity Team', v_stage_id, 'client');

  -- Insert Team Tasks
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, order_number, owner_role, is_mandatory)
  VALUES 
    (v_stage_id, 'team', 'Internal Notification – New Client Assigned', 'Notify internal team of new client assignment and package details.', 1, 'Admin', true),
    (v_stage_id, 'team', 'Create Client Workspace', 'Create client folder structure in OneDrive. Confirm permissions.', 2, 'Admin', true),
    (v_stage_id, 'team', 'Release Core Documents', 'Generate and release all onboarding documents for the client.', 3, 'Admin', true),
    (v_stage_id, 'team', 'Allocate Client Success Consultant (CSC)', 'Assign CSC and confirm primary contact details.', 4, 'Operations Manager', true),
    (v_stage_id, 'team', 'Send Welcome Pack', 'Send digital welcome pack. Trigger welcome email sequence.', 5, 'Admin', true),
    (v_stage_id, 'team', 'Schedule Initial Meeting', 'Book 30-minute introduction meeting with CSC.', 6, 'Admin', true),
    (v_stage_id, 'team', 'Conduct Initial CSC Meeting', 'Walk through scope, timelines, and expectations.', 7, 'CSC', true),
    (v_stage_id, 'team', 'Confirm Client Access and Contacts', 'Confirm authorised contacts, escalation path, and availability.', 8, 'CSC', true),
    (v_stage_id, 'team', 'Confirm Package Start', 'Mark onboarding complete and move client to next stage.', 9, 'CSC', true);

  -- Insert Client Tasks
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, order_number, is_mandatory)
  VALUES 
    (v_stage_id, 'client', 'Confirm Primary Contacts', 'Confirm your main contact, backup contact, and decision maker.', 1, true),
    (v_stage_id, 'client', 'Provide Required Background Documents', 'Upload requested documents, including prior ASQA reports and declarations.', 2, true),
    (v_stage_id, 'client', 'Book Introduction Meeting', 'Use the booking link to schedule your first meeting.', 3, true),
    (v_stage_id, 'client', 'Review Welcome Information', 'Review the welcome pack and note key timelines and responsibilities.', 4, true);

  -- Log to audit
  INSERT INTO public.package_builder_audit_log (action, entity_type, entity_id, after_data)
  VALUES ('create', 'stage', v_stage_id::text, 
    jsonb_build_object('title', 'Onboarding – Client Commencement', 'stage_type', 'onboarding', 'is_reusable', true, 'team_tasks', 9, 'client_tasks', 4, 'emails', 5));

END $$;