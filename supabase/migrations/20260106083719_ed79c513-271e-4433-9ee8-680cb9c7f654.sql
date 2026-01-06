-- First clean up partial inserts from failed migrations
DELETE FROM public.documents_stages WHERE title IN ('Onboarding – Membership Clients', 'Onboarding – Regulatory Clients (RTO / CRICOS / GTO)');

-- =============================================
-- Stage A: Onboarding – Membership Clients
-- =============================================
INSERT INTO public.documents_stages (title, stage_type, is_reusable, ai_hint, created_at, updated_at)
VALUES (
  'Onboarding – Membership Clients',
  'onboarding',
  true,
  'Membership client onboarding focused on welcome experience, benefits, and ongoing support cadence.',
  now(),
  now()
);

-- =============================================
-- Stage B: Onboarding – Regulatory Clients
-- =============================================
INSERT INTO public.documents_stages (title, stage_type, is_reusable, ai_hint, created_at, updated_at)
VALUES (
  'Onboarding – Regulatory Clients (RTO / CRICOS / GTO)',
  'onboarding',
  true,
  'Regulatory client onboarding focused on compliance scope, evidence requirements, and regulatory timelines.',
  now(),
  now()
);

-- Now insert all the related data
DO $$
DECLARE
  membership_stage_id INTEGER;
  regulatory_stage_id INTEGER;
BEGIN
  -- Get stage IDs
  SELECT id INTO membership_stage_id FROM public.documents_stages 
  WHERE title = 'Onboarding – Membership Clients' ORDER BY created_at DESC LIMIT 1;
  
  SELECT id INTO regulatory_stage_id FROM public.documents_stages 
  WHERE title = 'Onboarding – Regulatory Clients (RTO / CRICOS / GTO)' ORDER BY created_at DESC LIMIT 1;

  -- =============================================
  -- Membership Stage: Team Tasks
  -- =============================================
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, owner_role, is_mandatory, order_number, created_at, updated_at) VALUES
  (membership_stage_id, 'team', 'Internal Notification – New Membership Client', 'Notify internal team of new membership client assignment and package details.', 'Admin', true, 1, now(), now()),
  (membership_stage_id, 'team', 'Create Client Workspace', 'Create client folder structure in OneDrive. Confirm permissions.', 'Admin', true, 2, now(), now()),
  (membership_stage_id, 'team', 'Release Welcome Documents', 'Generate and release membership welcome documents for the client.', 'Admin', true, 3, now(), now()),
  (membership_stage_id, 'team', 'Allocate Client Success Consultant (CSC)', 'Assign CSC and confirm primary contact details.', 'Operations Manager', true, 4, now(), now()),
  (membership_stage_id, 'team', 'Send Welcome Pack', 'Send digital welcome pack. Trigger welcome email sequence.', 'Admin', true, 5, now(), now()),
  (membership_stage_id, 'team', 'Schedule Initial Meeting', 'Book 30-minute introduction meeting with CSC.', 'Admin', true, 6, now(), now()),
  (membership_stage_id, 'team', 'Conduct Initial CSC Meeting', 'Walk through membership inclusions, support hours, and expectations.', 'CSC', true, 7, now(), now()),
  (membership_stage_id, 'team', 'Explain Membership Inclusions and Hours', 'Clearly explain membership benefits, included hours, and how to use support effectively.', 'CSC', true, 8, now(), now()),
  (membership_stage_id, 'team', 'Confirm Client Access and Contacts', 'Confirm authorised contacts, escalation path, and availability.', 'CSC', true, 9, now(), now()),
  (membership_stage_id, 'team', 'Confirm Package Start', 'Mark onboarding complete and move client to next stage.', 'CSC', true, 10, now(), now());

  -- =============================================
  -- Membership Stage: Client Tasks
  -- =============================================
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, owner_role, is_mandatory, order_number, created_at, updated_at) VALUES
  (membership_stage_id, 'client', 'Confirm Primary Contacts', 'Confirm your main contact, backup contact, and decision maker.', NULL, true, 1, now(), now()),
  (membership_stage_id, 'client', 'Book Introduction Meeting', 'Use the booking link to schedule your first meeting.', NULL, true, 2, now(), now()),
  (membership_stage_id, 'client', 'Review Welcome Information', 'Review the welcome pack and note key timelines and responsibilities.', NULL, true, 3, now(), now()),
  (membership_stage_id, 'client', 'Review Membership Inclusions and Support Hours', 'Review what is included in your membership and how to access support effectively.', NULL, true, 4, now(), now());

  -- =============================================
  -- Membership Stage: Emails
  -- =============================================
  INSERT INTO public.emails (stage_id, order_number, name, description, subject, content, "to", created_at) VALUES
  (membership_stage_id, 1, 'New Membership Client Assigned – Internal', 'Internal notification for new membership client', 'New membership client assigned – {{ClientName}}', 'Hello team,

A new membership client has been assigned.

Client: {{ClientName}}
Package: {{PackageName}}
CSC: {{CSCName}}

Please begin onboarding tasks as outlined in Unicorn.

Thank you.', 'internal', now()),
  (membership_stage_id, 2, 'Welcome to Vivacity Membership', 'Welcome email for membership clients', 'Welcome to Vivacity – your membership begins', 'Hello {{ClientName}},

Welcome to Vivacity.

We are pleased to confirm the commencement of your {{PackageName}} membership.

Your Client Success Consultant is {{CSCName}}.
They will guide you through onboarding and ongoing support.

Next steps:
- Review your welcome pack.
- Book your introduction meeting.
- Understand your membership inclusions.

If you have questions, contact {{CSCEmail}}.

Kind regards,
Vivacity Team', 'client', now()),
  (membership_stage_id, 3, 'Introduction Meeting Booking', 'Booking link for introduction meeting', 'Book your introduction meeting', 'Hello {{ClientName}},

Please book your introduction meeting using the link below:

{{BookingLink}}

This meeting confirms scope, timelines, and priorities.

Regards,
Vivacity Team', 'client', now()),
  (membership_stage_id, 4, 'Membership Support Explanation', 'Explains how membership support works', 'Your Vivacity Membership – how support works', 'Hello {{ClientName}},

Your Vivacity Membership includes ongoing support hours and advisory services.

Your CSC will help you plan how to use these hours effectively.

Regards,
Vivacity Team', 'client', now()),
  (membership_stage_id, 5, 'Onboarding Complete', 'Confirms onboarding completion', 'Onboarding complete – next phase begins', 'Hello {{ClientName}},

Your onboarding is now complete.

We will move into the next phase of your membership and continue working with you on agreed priorities.

If anything changes, contact your CSC.

Kind regards,
Vivacity Team', 'client', now());

  -- Log Membership stage creation
  INSERT INTO public.package_builder_audit_log (package_id, action, entity_type, entity_id, after_data, created_at)
  VALUES (NULL, 'create', 'stage', membership_stage_id::text, 
    jsonb_build_object(
      'stage_name', 'Onboarding – Membership Clients',
      'stage_type', 'onboarding',
      'team_tasks_count', 10,
      'client_tasks_count', 4,
      'emails_count', 5
    ),
    now());

  -- =============================================
  -- Regulatory Stage: Team Tasks
  -- =============================================
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, owner_role, is_mandatory, order_number, created_at, updated_at) VALUES
  (regulatory_stage_id, 'team', 'Internal Notification – New Regulatory Client', 'Notify internal team of new regulatory client assignment and package details.', 'Admin', true, 1, now(), now()),
  (regulatory_stage_id, 'team', 'Create Client Workspace', 'Create client folder structure in OneDrive. Confirm permissions.', 'Admin', true, 2, now(), now()),
  (regulatory_stage_id, 'team', 'Release Core Documents', 'Generate and release all onboarding documents for the client.', 'Admin', true, 3, now(), now()),
  (regulatory_stage_id, 'team', 'Allocate Client Success Consultant (CSC)', 'Assign CSC and confirm primary contact details.', 'Operations Manager', true, 4, now(), now()),
  (regulatory_stage_id, 'team', 'Send Welcome Pack', 'Send digital welcome pack. Trigger welcome email sequence.', 'Admin', true, 5, now(), now()),
  (regulatory_stage_id, 'team', 'Schedule Initial Meeting', 'Book 30-minute introduction meeting with CSC.', 'Admin', true, 6, now(), now()),
  (regulatory_stage_id, 'team', 'Conduct Initial CSC Meeting', 'Walk through compliance scope, evidence requirements, and regulatory timelines.', 'CSC', true, 7, now(), now()),
  (regulatory_stage_id, 'team', 'Confirm Regulatory Scope and Risk Areas', 'Confirm regulator type, scope of registration, and key risk areas for the client.', 'CSC', true, 8, now(), now()),
  (regulatory_stage_id, 'team', 'Confirm Client Access and Contacts', 'Confirm authorised contacts, escalation path, and availability.', 'CSC', true, 9, now(), now()),
  (regulatory_stage_id, 'team', 'Confirm Package Start', 'Mark onboarding complete and move client to next stage.', 'CSC', true, 10, now(), now());

  -- =============================================
  -- Regulatory Stage: Client Tasks
  -- =============================================
  INSERT INTO public.stage_task_templates (stage_id, task_type, name, instructions, owner_role, is_mandatory, order_number, created_at, updated_at) VALUES
  (regulatory_stage_id, 'client', 'Confirm Primary Contacts', 'Confirm your main contact, backup contact, and decision maker.', NULL, true, 1, now(), now()),
  (regulatory_stage_id, 'client', 'Provide Required Background Documents', 'Upload requested documents, including prior ASQA reports, FPP, and declarations.', NULL, true, 2, now(), now()),
  (regulatory_stage_id, 'client', 'Book Introduction Meeting', 'Use the booking link to schedule your first meeting.', NULL, true, 3, now(), now()),
  (regulatory_stage_id, 'client', 'Review Welcome Information', 'Review the welcome pack and note key timelines and responsibilities.', NULL, true, 4, now(), now()),
  (regulatory_stage_id, 'client', 'Confirm Regulator, Scope, and Delivery Mode', 'Confirm your regulator (ASQA/TAC/etc.), scope of registration, and delivery arrangements.', NULL, true, 5, now(), now());

  -- =============================================
  -- Regulatory Stage: Emails
  -- =============================================
  INSERT INTO public.emails (stage_id, order_number, name, description, subject, content, "to", created_at) VALUES
  (regulatory_stage_id, 1, 'New Regulatory Client Assigned – Internal', 'Internal notification for new regulatory client', 'New regulatory client assigned – {{ClientName}}', 'Hello team,

A new regulatory client has been assigned.

Client: {{ClientName}}
Package: {{PackageName}}
CSC: {{CSCName}}

Please begin onboarding tasks as outlined in Unicorn.

Thank you.', 'internal', now()),
  (regulatory_stage_id, 2, 'Welcome to Vivacity', 'Welcome email for regulatory clients', 'Welcome to Vivacity – next steps', 'Hello {{ClientName}},

Welcome to Vivacity.

We are pleased to confirm the commencement of your {{PackageName}} package.

Your Client Success Consultant is {{CSCName}}.
They will guide you through onboarding and ongoing support.

Next steps:
- Review your welcome pack.
- Upload requested documents.
- Book your introduction meeting.

If you have questions, contact {{CSCEmail}}.

Kind regards,
Vivacity Team', 'client', now()),
  (regulatory_stage_id, 3, 'Introduction Meeting Booking', 'Booking link for introduction meeting', 'Book your introduction meeting', 'Hello {{ClientName}},

Please book your introduction meeting using the link below:

{{BookingLink}}

This meeting confirms scope, timelines, and priorities.

Regards,
Vivacity Team', 'client', now()),
  (regulatory_stage_id, 4, 'Request for Previous ASQA Documents', 'Request for regulatory background documents', 'Request for previous ASQA documents', 'Hello {{ClientName}},

To complete onboarding, please upload:
- Previous ASQA audit reports.
- Financial Performance and Position (FPP).
- CEO statutory declarations.

These documents help us provide accurate advice.

Thank you,
Vivacity Team', 'client', now()),
  (regulatory_stage_id, 5, 'Regulatory Onboarding Required Information', 'Request for regulatory scope confirmation', 'Regulatory onboarding – required information', 'Hello {{ClientName}},

To begin regulatory support, we need to confirm your scope, regulator, and delivery arrangements.

Please complete the requested information as soon as possible.

Kind regards,
Vivacity Team', 'client', now()),
  (regulatory_stage_id, 6, 'Onboarding Complete', 'Confirms onboarding completion', 'Onboarding complete – next phase begins', 'Hello {{ClientName}},

Your onboarding is now complete.

We will move into the next phase of your package and continue working with you on agreed priorities.

If anything changes, contact your CSC.

Kind regards,
Vivacity Team', 'client', now());

  -- Log Regulatory stage creation
  INSERT INTO public.package_builder_audit_log (package_id, action, entity_type, entity_id, after_data, created_at)
  VALUES (NULL, 'create', 'stage', regulatory_stage_id::text, 
    jsonb_build_object(
      'stage_name', 'Onboarding – Regulatory Clients (RTO / CRICOS / GTO)',
      'stage_type', 'onboarding',
      'team_tasks_count', 10,
      'client_tasks_count', 5,
      'emails_count', 6
    ),
    now());

END $$;