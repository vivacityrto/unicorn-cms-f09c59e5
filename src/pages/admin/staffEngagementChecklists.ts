export type ChecklistItem = {
  key: string;
  label: string;
  owner: string;
  critical: boolean;
};
export type ChecklistSection = {
  key: string;
  label: string;
  items: ChecklistItem[];
};
export type ChecklistPhase = {
  key: string;
  label: string;
  sections: ChecklistSection[];
};

export const ONBOARDING_PHASES: ChecklistPhase[] = [
  {
    key: "legal_contracts",
    label: "LEGAL & CONTRACTS",
    sections: [
      {
        key: "legal",
        label: "Legal & Contractual",
        items: [
          { key: "legal.contract_prepared", label: "Contract prepared and sent for signature", owner: "Manager", critical: false },
          { key: "legal.contract_signed", label: "Signed contract returned and filed", owner: "Nova", critical: true },
          { key: "legal.nda_signed", label: "NDA and Confidentiality Agreement signed", owner: "Nova", critical: true },
          { key: "legal.privacy_signed", label: "Privacy and Data Handling acknowledgement signed", owner: "Nova", critical: true },
          { key: "legal.engagement_type_confirmed", label: "Engagement type confirmed with Angela", owner: "Nova / Angela", critical: false },
        ],
      },
    ],
  },
  {
    key: "setup",
    label: "SETUP",
    sections: [
      {
        key: "access",
        label: "System & Platform Access",
        items: [
          { key: "access.google_workspace", label: "Vivacity Google Workspace account created", owner: "Dave", critical: true },
          { key: "access.complyhub_provisioned", label: "ComplyHub AI platform access provisioned", owner: "Rhald", critical: false },
          { key: "access.unicorn_provisioned", label: "Unicorn CMS access provisioned", owner: "Nova", critical: false },
          { key: "access.google_drive_shared", label: "Shared Google Drive folders shared", owner: "Nova", critical: false },
          { key: "access.m365_licence", label: "Microsoft 365 licence assigned if applicable", owner: "Nova / Carl", critical: false },
          { key: "access.password_manager", label: "Password manager entry set up and shared", owner: "Nova", critical: false },
        ],
      },
      {
        key: "profile",
        label: "Profile Set Up",
        items: [
          { key: "profile.team_channels", label: "Added to relevant team channels / groups", owner: "Nova", critical: false },
          { key: "profile.email_signature", label: "Email signature template set up", owner: "Admin", critical: false },
          { key: "profile.vivacity_profile", label: "Vivacity profile set up", owner: "Nova", critical: false },
          { key: "profile.team_announcement", label: "New team member introduced to team", owner: "Nova", critical: false },
        ],
      },
      {
        key: "equipment",
        label: "Equipment & Resources",
        items: [
          { key: "equipment.own_equipment_confirmed", label: "Own equipment confirmed and specs acceptable", owner: "Nova", critical: false },
          { key: "equipment.software_licences", label: "Software licences identified and procured", owner: "Nova / Carl", critical: false },
          { key: "equipment.vpn_access", label: "VPN or secure access confirmed if applicable", owner: "Carl / Khian", critical: false },
          { key: "equipment.branded_templates", label: "Vivacity branded templates provided", owner: "Nova / AJ", critical: false },
          { key: "equipment.business_card_assets", label: "Business card / email footer assets provided if applicable", owner: "AJ", critical: false },
        ],
      },
    ],
  },
  {
    key: "compliance_financial",
    label: "COMPLIANCE & FINANCIAL",
    sections: [
      {
        key: "compliance",
        label: "Compliance & Policy Documents",
        items: [
          { key: "compliance.code_of_conduct", label: "Code of Conduct provided and signed", owner: "Nova", critical: true },
          { key: "compliance.whs_briefing", label: "WHS obligations briefing completed", owner: "Nova", critical: false },
          { key: "compliance.privacy_policy_read", label: "Privacy Policy and Data Handling Policy read and acknowledged", owner: "Nova", critical: true },
          { key: "compliance.brand_guide_shared", label: "Brand and Style Guide shared", owner: "Nova", critical: false },
          { key: "compliance.sop_access", label: "SOP Master Manual access granted and overview provided", owner: "Nova", critical: false },
          { key: "compliance.regulatory_framework", label: "RTO regulatory framework overview shared", owner: "Nova / Angela", critical: false },
          { key: "compliance.conflict_of_interest", label: "Conflict of Interest declaration completed", owner: "Nova", critical: false },
        ],
      },
      {
        key: "financial",
        label: "Payroll & Financial Setup",
        items: [
          { key: "financial.bank_details", label: "Bank account details collected securely", owner: "Nova / Beverly", critical: false },
          { key: "financial.payment_schedule", label: "Payment schedule and invoicing process explained", owner: "Nova / Beverly", critical: false },
          { key: "financial.superannuation", label: "Superannuation details collected if applicable", owner: "Nova", critical: false },
          { key: "financial.first_invoice", label: "First invoice / payment milestone agreed", owner: "Nova / Beverly", critical: false },
          { key: "financial.expense_policy", label: "Expense reimbursement policy shared", owner: "Nova", critical: false },
        ],
      },
    ],
  },
];

export const OFFBOARDING_PHASES: ChecklistPhase[] = [
  {
    key: "notice_period",
    label: "NOTICE PERIOD",
    sections: [
      {
        key: "handover",
        label: "Handover Planning",
        items: [
          { key: "handover.last_day_confirmed", label: "Last day confirmed in writing", owner: "Nova", critical: true },
          { key: "handover.active_tasks_identified", label: "All active tasks and responsibilities identified", owner: "Nova", critical: false },
          { key: "handover.handover_plan_drafted", label: "Handover plan drafted and agreed", owner: "Nova / Staff Member", critical: false },
          { key: "handover.successor_assigned", label: "Successor or interim owner assigned for each responsibility", owner: "Nova / Angela", critical: false },
          { key: "handover.meetings_scheduled", label: "Handover meetings scheduled", owner: "Nova / Staff Member", critical: false },
        ],
      },
      {
        key: "knowledge",
        label: "Knowledge Transfer",
        items: [
          { key: "knowledge.sops_updated", label: "All SOPs and documentation updated and transferred to shared drive", owner: "Staff Member / Nova", critical: true },
          { key: "knowledge.credentials_rotated", label: "Passwords or shared credentials rotated or transferred", owner: "IT Support", critical: true },
          { key: "knowledge.client_relationships_handed", label: "Client-facing relationships handed over with context notes", owner: "New CHC", critical: false },
          { key: "knowledge.unicorn_tasks_reassigned", label: "Unicorn CMS tickets and open tasks reassigned", owner: "Admin", critical: false },
          { key: "knowledge.complyhub_wip_documented", label: "ComplyHub AI work in progress documented", owner: "Admin", critical: false },
          { key: "knowledge.clarity_calls_transferred", label: "Pending Clarity Call follow-ups documented and transferred", owner: "Staff Member / Admin", critical: false },
        ],
      },
      {
        key: "exit_interview",
        label: "Exit Interview",
        items: [
          {
            key: "exit_interview.completed",
            label: "Exit interview completed and submitted by staff member",
            owner: "Nova / Staff Member",
            critical: false,
          },
        ],
      },
    ],
  },
  {
    key: "last_day",
    label: "LAST DAY",
    sections: [
      {
        key: "access_revoke",
        label: "System & Platform Access Revocation",
        items: [
          { key: "access_revoke.google_workspace", label: "Google Workspace account suspended and scheduled for deletion", owner: "Dave", critical: true },
          { key: "access_revoke.complyhub", label: "ComplyHub AI access revoked", owner: "Rhald", critical: true },
          { key: "access_revoke.xero", label: "Xero access removed", owner: "Nova", critical: true },
          { key: "access_revoke.m365", label: "Microsoft 365 licence unassigned", owner: "Dave", critical: false },
          { key: "access_revoke.teams", label: "Teams communication platform access removed", owner: "Admin", critical: false },
          { key: "access_revoke.zoom", label: "Zoom licence unassigned if applicable", owner: "Admin", critical: false },
          { key: "access_revoke.password_manager", label: "Password manager entry removed or credentials rotated", owner: "Dave", critical: true },
          { key: "access_revoke.email_aliases", label: "Shared email aliases or forwarding rules updated", owner: "Admin", critical: false },
          { key: "access_revoke.unicorn", label: "Unicorn CMS access revoked", owner: "Nova", critical: true },
        ],
      },
      {
        key: "data",
        label: "Data & Device",
        items: [
          { key: "data.no_data_retained", label: "Confirmed no Vivacity or client data retained on personal devices", owner: "Staff Member / Nova", critical: true },
          { key: "data.equipment_returned", label: "Vivacity-provided equipment returned and logged if applicable", owner: "Nova", critical: false },
          { key: "data.templates_removed", label: "Branded templates and assets removed from personal storage", owner: "Staff Member", critical: false },
          { key: "data.work_product_owned", label: "All work product confirmed as owned by Vivacity", owner: "Nova / Angela", critical: false },
        ],
      },
      {
        key: "farewell",
        label: "Final Communications & Farewell",
        items: [
          { key: "farewell.exit_conversation", label: "Exit conversation completed", owner: "Nova / Angela", critical: false },
          { key: "farewell.exit_feedback", label: "Exit feedback / debrief captured", owner: "Nova", critical: false },
          { key: "farewell.team_notified", label: "Team notified of departure", owner: "Nova", critical: false },
          { key: "farewell.farewell_message", label: "Farewell message shared with team", owner: "Angela / Nova", critical: false },
          { key: "farewell.reference_discussed", label: "LinkedIn or professional reference process discussed", owner: "Nova / Angela", critical: false },
        ],
      },
    ],
  },
  {
    key: "post_departure",
    label: "POST-DEPARTURE",
    sections: [
      {
        key: "financial_final",
        label: "Payroll & Financial Finalisation",
        items: [
          { key: "financial_final.invoice_processed", label: "Final invoice or payment processed and confirmed", owner: "Nova / Angela", critical: true },
          { key: "financial_final.super_contributions", label: "Superannuation final contributions made if applicable", owner: "Nova / Angela", critical: false },
          { key: "financial_final.xero_closed", label: "Xero contractor / employee record closed and archived", owner: "Nova", critical: false },
          { key: "financial_final.expenses_processed", label: "Outstanding expense reimbursements processed", owner: "Nova", critical: false },
          { key: "financial_final.no_obligations", label: "No outstanding financial obligations remain", owner: "Nova / Angela", critical: false },
        ],
      },
      {
        key: "legal_final",
        label: "Legal & Compliance Records",
        items: [
          { key: "legal_final.records_archived", label: "Signed contract, NDA, and all onboarding documents archived", owner: "Nova", critical: true },
          { key: "legal_final.checklist_filed", label: "Completed offboarding checklist filed in personnel record", owner: "Nova", critical: true },
          { key: "legal_final.confidentiality_communicated", label: "Post-engagement confidentiality obligations communicated", owner: "Nova / Angela", critical: true },
          { key: "legal_final.non_compete_reviewed", label: "Non-compete / restraint obligations reviewed if applicable", owner: "Nova / Angela", critical: false },
          { key: "legal_final.stp_finalised", label: "ATO Single Touch Payroll finalisation completed if employee", owner: "Nova / Beverly", critical: false },
          { key: "legal_final.records_retention", label: "Statutory records retention obligations confirmed (7-year minimum)", owner: "Nova", critical: false },
        ],
      },
      {
        key: "improvement",
        label: "Continuous Improvement",
        items: [
          { key: "improvement.exit_feedback_reviewed", label: "Exit feedback reviewed and actionable items noted", owner: "Nova", critical: false },
          { key: "improvement.checklist_reviewed", label: "Offboarding checklist reviewed for gaps", owner: "Nova", critical: false },
          { key: "improvement.issues_escalated", label: "System access or process issues escalated to Carl / Rhald if needed", owner: "Nova", critical: false },
          { key: "improvement.lessons_shared", label: "Lessons learned shared with Angela if relevant", owner: "Nova", critical: false },
        ],
      },
    ],
  },
  
];

export function findItemLabel(itemKey: string): string | null {
  for (const phases of [ONBOARDING_PHASES, OFFBOARDING_PHASES]) {
    for (const phase of phases) {
      for (const section of phase.sections) {
        const found = section.items.find((i) => i.key === itemKey);
        if (found) return found.label;
      }
    }
  }
  return null;
}
