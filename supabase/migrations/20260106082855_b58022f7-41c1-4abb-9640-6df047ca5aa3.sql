-- Create the reusable Offboarding stage
INSERT INTO public.documents_stages (title, short_name, description, stage_type, is_reusable, ai_hint, status, dashboard_visible)
VALUES (
  'Offboarding – Client Closure',
  'offboarding-closure',
  'Formal client closure including documentation, communications, and internal wrap-up.',
  'offboarding',
  true,
  'Formal client closure, documentation, communications, and internal wrap-up.',
  'not_started',
  true
);

-- Insert all related data
DO $$
DECLARE
  v_stage_id bigint;
BEGIN
  SELECT id INTO v_stage_id FROM public.documents_stages 
  WHERE title = 'Offboarding – Client Closure' 
  ORDER BY created_at DESC LIMIT 1;

  -- Insert Email Templates
  INSERT INTO public.email_templates (internal_name, slug, subject, html_body, description, editor_type)
  VALUES 
    ('Client Closure Notification', 'offboarding-closure-notification', 'Notice of package closure',
     '<p>Hello {{ClientName}},</p><p>This email confirms the closure of your {{PackageName}} package with Vivacity.</p><p><strong>Effective date:</strong> {{ClosureDate}}</p><p>If you have questions regarding this closure, please contact {{CSCName}}.</p><p>Kind regards,<br>Vivacity Team</p>',
     'Formal closure notification sent to client at offboarding start.', 'html'),
    ('Internal Closure Confirmation', 'offboarding-internal-confirmation', 'Client closed – {{ClientName}}',
     '<p>The following client has been closed:</p><p><strong>Client:</strong> {{ClientName}}<br><strong>Package:</strong> {{PackageName}}<br><strong>Reason:</strong> {{ClosureReason}}</p><p>Please complete final tasks and archive records.</p>',
     'Internal notification when a client is closed.', 'html'),
    ('Final Thank You', 'offboarding-thank-you', 'Thank you from Vivacity',
     '<p>Hello {{ClientName}},</p><p>Thank you for working with Vivacity.</p><p>We wish you all the best moving forward.</p><p>Regards,<br>Vivacity Team</p>',
     'Optional thank you email sent manually during offboarding.', 'html');

  -- Insert stage-linked emails
  INSERT INTO public.emails (order_number, name, description, subject, content, stage_id, "to")
  VALUES 
    (1, 'Client Closure Notification', 'Formal closure notification to client', 'Notice of package closure', 
     E'Hello {{ClientName}},\n\nThis email confirms the closure of your {{PackageName}} package with Vivacity.\n\nEffective date: {{ClosureDate}}\n\nIf you have questions regarding this closure, please contact {{CSCName}}.\n\nKind regards,\nVivacity Team', v_stage_id, 'client'),
    (2, 'Internal Closure Confirmation', 'Internal notification of client closure', 'Client closed – {{ClientName}}',
     E'The following client has been closed:\n\nClient: {{ClientName}}\nPackage: {{PackageName}}\nReason: {{ClosureReason}}\n\nPlease complete final tasks and archive records.', v_stage_id, 'internal'),
    (3, 'Final Thank You', 'Optional thank you email', 'Thank you from Vivacity',
     E'Hello {{ClientName}},\n\nThank you for working with Vivacity.\n\nWe wish you all the best moving forward.\n\nRegards,\nVivacity Team', v_stage_id, 'client');

  -- Insert Team Tasks
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, order_number, owner_role, is_mandatory)
  VALUES 
    (v_stage_id, 'team', 'Confirm Reason for Offboarding', 'Confirm whether closure is planned, client-initiated, or Vivacity-initiated.', 1, 'CSC', true),
    (v_stage_id, 'team', 'Internal Risk Review', 'Review any outstanding compliance, risk, or advice considerations.', 2, 'Compliance', true),
    (v_stage_id, 'team', 'Prepare Final Documentation', 'Generate final letters, warnings, or termination documents as applicable.', 3, 'Admin', true),
    (v_stage_id, 'team', 'Send Client Closure Email', 'Send formal closure communication to client.', 4, 'Admin', true),
    (v_stage_id, 'team', 'Update Client Status', 'Update client record to Closed or Archived.', 5, 'Admin', true),
    (v_stage_id, 'team', 'Archive Client Files', 'Lock and archive client folders and records.', 6, 'Admin', true),
    (v_stage_id, 'team', 'Internal Debrief (Optional)', 'Record any lessons learned or follow-up actions.', 7, 'CSC', false);

  -- Insert Client Tasks
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, order_number, is_mandatory)
  VALUES 
    (v_stage_id, 'client', 'Acknowledge Closure Notice', 'Confirm receipt of the closure notice.', 1, true),
    (v_stage_id, 'client', 'Download Final Documents', 'Download any final documents provided by Vivacity.', 2, true);

  -- Log to audit
  INSERT INTO public.package_builder_audit_log (action, entity_type, entity_id, after_data)
  VALUES ('create', 'stage', v_stage_id::text, 
    jsonb_build_object('title', 'Offboarding – Client Closure', 'stage_type', 'offboarding', 'is_reusable', true, 'team_tasks', 7, 'client_tasks', 2, 'emails', 3));

END $$;