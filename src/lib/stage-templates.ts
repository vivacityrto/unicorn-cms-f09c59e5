// Stage Builder deterministic templates
// These provide pre-configured stage content for common use cases

export interface TemplateTask {
  name: string;
  instructions?: string;
  ownerRole?: string;
  estimatedHours?: number;
  isMandatory?: boolean;
}

export interface TemplateEmail {
  subject: string;
  bodyPreview: string;
  triggerType: string;
  recipientType: string;
}

export interface StageTemplate {
  key: string;
  name: string;
  description: string;
  defaultStageType: string;
  teamTasks: TemplateTask[];
  clientTasks: TemplateTask[];
  emails: TemplateEmail[];
  documentTypes: string[]; // Placeholder document categories to link
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  // A) Onboarding – Client Commencement
  {
    key: 'onboarding_commencement',
    name: 'Onboarding – Client Commencement',
    description: 'Welcome email and key onboarding tasks for new clients',
    defaultStageType: 'onboarding',
    teamTasks: [
      {
        name: 'Schedule welcome call',
        instructions: 'Contact the client to schedule an initial welcome call to discuss expectations and timelines.',
        ownerRole: 'CSC',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Prepare client folder',
        instructions: 'Create the client folder structure in the document management system.',
        ownerRole: 'Admin',
        estimatedHours: 0.25,
        isMandatory: true,
      },
      {
        name: 'Send welcome pack',
        instructions: 'Send the welcome pack including key contacts, portal access, and getting started guide.',
        ownerRole: 'CSC',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Complete client intake form review',
        instructions: 'Review the client intake form and flag any missing information.',
        ownerRole: 'Admin',
        estimatedHours: 1,
        isMandatory: true,
      },
      {
        name: 'Assign CSC to client',
        instructions: 'Assign a dedicated Client Success Coordinator to manage this client relationship.',
        ownerRole: 'SuperAdmin',
        estimatedHours: 0.25,
        isMandatory: true,
      },
    ],
    clientTasks: [
      {
        name: 'Complete client intake form',
        instructions: 'Please complete the client intake form with your organisation details.',
        isMandatory: true,
      },
      {
        name: 'Provide RTO registration details',
        instructions: 'Please provide your RTO number and registration details.',
        isMandatory: true,
      },
      {
        name: 'Upload logo and branding assets',
        instructions: 'Upload your organisation logo (PNG or SVG) and any branding guidelines.',
        isMandatory: false,
      },
      {
        name: 'Confirm key contacts',
        instructions: 'Confirm the primary and secondary contacts for your organisation.',
        isMandatory: true,
      },
    ],
    emails: [
      {
        subject: 'Welcome to {{company_name}}!',
        bodyPreview: 'Dear {{client_name}},\n\nWelcome to {{company_name}}! We are excited to have you on board. This email contains important information about getting started with your new package...',
        triggerType: 'on_stage_start',
        recipientType: 'tenant',
      },
      {
        subject: 'New client onboarding started: {{tenant_name}}',
        bodyPreview: 'A new client onboarding has been initiated for {{tenant_name}}. Please ensure all welcome tasks are completed within the first week.',
        triggerType: 'on_stage_start',
        recipientType: 'internal',
      },
    ],
    documentTypes: ['Welcome Pack', 'Client Intake Form', 'Getting Started Guide'],
  },

  // B) Documentation Delivery – Documents Ready
  {
    key: 'documentation_delivery',
    name: 'Documentation Delivery – Documents Ready',
    description: 'Release, download, and confirm delivery of documentation',
    defaultStageType: 'documentation',
    teamTasks: [
      {
        name: 'Generate client documents',
        instructions: 'Generate all tailored documents for the client using the document generation system.',
        ownerRole: 'Admin',
        estimatedHours: 2,
        isMandatory: true,
      },
      {
        name: 'Quality check documents',
        instructions: 'Review all generated documents for accuracy, completeness, and correct branding.',
        ownerRole: 'CSC',
        estimatedHours: 1,
        isMandatory: true,
      },
      {
        name: 'Upload documents to client portal',
        instructions: 'Upload all approved documents to the client portal for download.',
        ownerRole: 'Admin',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Send documents ready notification',
        instructions: 'Notify the client that their documents are ready for download.',
        ownerRole: 'CSC',
        estimatedHours: 0.25,
        isMandatory: true,
      },
      {
        name: 'Confirm client has downloaded documents',
        instructions: 'Follow up with the client to confirm they have successfully downloaded their documents.',
        ownerRole: 'CSC',
        estimatedHours: 0.25,
        isMandatory: true,
      },
    ],
    clientTasks: [
      {
        name: 'Download your documents',
        instructions: 'Log in to the client portal and download your tailored documents.',
        isMandatory: true,
      },
      {
        name: 'Review documents for accuracy',
        instructions: 'Please review all documents and notify us of any corrections needed.',
        isMandatory: true,
      },
      {
        name: 'Confirm documents received',
        instructions: 'Confirm that you have received and reviewed all documents.',
        isMandatory: true,
      },
    ],
    emails: [
      {
        subject: 'Your documents are ready for download!',
        bodyPreview: 'Dear {{client_name}},\n\nGreat news! Your tailored documents are now ready for download. Please log in to your portal to access them...',
        triggerType: 'on_stage_start',
        recipientType: 'tenant',
      },
      {
        subject: 'Reminder: Documents awaiting download',
        bodyPreview: 'Dear {{client_name}},\n\nThis is a friendly reminder that your documents are still waiting to be downloaded. Please log in to your portal...',
        triggerType: 'manual',
        recipientType: 'tenant',
      },
    ],
    documentTypes: ['Policies & Procedures', 'Forms & Templates', 'Training Resources'],
  },

  // C) Membership Support – Ongoing Cadence
  {
    key: 'membership_support',
    name: 'Membership Support – Ongoing Cadence',
    description: 'Monthly support and check-in cadence for membership clients',
    defaultStageType: 'support',
    teamTasks: [
      {
        name: 'Monthly check-in call',
        instructions: 'Conduct a monthly check-in call with the client to discuss progress and any support needs.',
        ownerRole: 'CSC',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Review client usage metrics',
        instructions: 'Review the client usage metrics and prepare a summary for the check-in.',
        ownerRole: 'Admin',
        estimatedHours: 0.5,
        isMandatory: false,
      },
      {
        name: 'Send monthly newsletter',
        instructions: 'Send the monthly newsletter with updates, tips, and upcoming webinar dates.',
        ownerRole: 'Admin',
        estimatedHours: 0.25,
        isMandatory: true,
      },
      {
        name: 'Log support tickets',
        instructions: 'Review and respond to any outstanding support tickets from this client.',
        ownerRole: 'CSC',
        estimatedHours: 1,
        isMandatory: true,
      },
      {
        name: 'Update client health score',
        instructions: 'Update the client health score based on engagement and satisfaction indicators.',
        ownerRole: 'CSC',
        estimatedHours: 0.25,
        isMandatory: false,
      },
    ],
    clientTasks: [
      {
        name: 'Complete monthly feedback survey',
        instructions: 'Please complete our brief monthly feedback survey to help us improve our service.',
        isMandatory: false,
      },
    ],
    emails: [
      {
        subject: 'Your monthly membership update',
        bodyPreview: 'Dear {{client_name}},\n\nHere is your monthly update including new resources, upcoming webinars, and tips to get the most from your membership...',
        triggerType: 'on_stage_start',
        recipientType: 'tenant',
      },
      {
        subject: 'Monthly check-in scheduled',
        bodyPreview: 'Dear {{client_name}},\n\nYour monthly check-in call has been scheduled. Please find the details below...',
        triggerType: 'manual',
        recipientType: 'tenant',
      },
    ],
    documentTypes: ['Monthly Newsletter', 'Resource Updates', 'Webinar Recordings'],
  },

  // D) Offboarding – Client Closure
  {
    key: 'offboarding_closure',
    name: 'Offboarding – Client Closure',
    description: 'Closure email, data export, and archive reminders',
    defaultStageType: 'offboarding',
    teamTasks: [
      {
        name: 'Conduct exit interview',
        instructions: 'Schedule and conduct an exit interview to understand reasons for departure and gather feedback.',
        ownerRole: 'CSC',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Export client data',
        instructions: 'Export all client data and documents for handover or archiving.',
        ownerRole: 'Admin',
        estimatedHours: 1,
        isMandatory: true,
      },
      {
        name: 'Send final invoice',
        instructions: 'Generate and send the final invoice for any outstanding services.',
        ownerRole: 'Admin',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Revoke portal access',
        instructions: 'Revoke client portal access and deactivate user accounts.',
        ownerRole: 'SuperAdmin',
        estimatedHours: 0.25,
        isMandatory: true,
      },
      {
        name: 'Archive client records',
        instructions: 'Archive all client records according to data retention policy.',
        ownerRole: 'Admin',
        estimatedHours: 0.5,
        isMandatory: true,
      },
      {
        name: 'Send goodbye email',
        instructions: 'Send a professional goodbye email thanking the client for their business.',
        ownerRole: 'CSC',
        estimatedHours: 0.25,
        isMandatory: true,
      },
    ],
    clientTasks: [
      {
        name: 'Download your documents',
        instructions: 'Please download any documents you need before your portal access is revoked.',
        isMandatory: true,
      },
      {
        name: 'Complete exit survey',
        instructions: 'Please complete our exit survey to help us improve our services.',
        isMandatory: false,
      },
      {
        name: 'Confirm data handover',
        instructions: 'Please confirm you have received all necessary data and documents.',
        isMandatory: true,
      },
    ],
    emails: [
      {
        subject: 'Important: Your account closure is being processed',
        bodyPreview: 'Dear {{client_name}},\n\nWe are processing the closure of your account. Please ensure you have downloaded any documents you need before your access expires on {{closure_date}}...',
        triggerType: 'on_stage_start',
        recipientType: 'tenant',
      },
      {
        subject: 'Thank you for being our client',
        bodyPreview: 'Dear {{client_name}},\n\nWe wanted to take a moment to thank you for being a valued client. We wish you all the best in your future endeavors...',
        triggerType: 'manual',
        recipientType: 'tenant',
      },
      {
        subject: 'Client offboarding completed: {{tenant_name}}',
        bodyPreview: 'The offboarding process for {{tenant_name}} has been completed. All records have been archived and portal access has been revoked.',
        triggerType: 'on_task_complete',
        recipientType: 'internal',
      },
    ],
    documentTypes: ['Data Export', 'Final Statement', 'Handover Documents'],
  },
];

export function getTemplateByKey(key: string): StageTemplate | undefined {
  return STAGE_TEMPLATES.find(t => t.key === key);
}
