/**
 * EOS Test Data Fixtures
 * 
 * Mock data for EOS automated tests
 */

export const VIVACITY_TENANT_ID = 6372;
export const TEST_WORKSPACE_ID = "test-workspace-uuid";

// Mock Vivacity Team Users
export const mockVivacityUsers = {
  superAdmin: {
    user_uuid: "super-admin-uuid-001",
    email: "superadmin@vivacity.com.au",
    first_name: "Super",
    last_name: "Admin",
    unicorn_role: "Super Admin",
    global_role: "SuperAdmin",
    avatar_url: null,
    job_title: "Managing Director",
    archived: false,
  },
  teamLeader: {
    user_uuid: "team-leader-uuid-002",
    email: "teamlead@vivacity.com.au",
    first_name: "Team",
    last_name: "Leader",
    unicorn_role: "Team Leader",
    global_role: null,
    avatar_url: null,
    job_title: "Senior Consultant",
    archived: false,
  },
  teamMember: {
    user_uuid: "team-member-uuid-003",
    email: "teammember@vivacity.com.au",
    first_name: "Team",
    last_name: "Member",
    unicorn_role: "Team Member",
    global_role: null,
    avatar_url: null,
    job_title: "Consultant",
    archived: false,
  },
};

// Mock Client Users (should NOT have EOS access)
export const mockClientUsers = {
  clientAdmin: {
    user_uuid: "client-admin-uuid-101",
    email: "admin@clientrto.com",
    first_name: "Client",
    last_name: "Admin",
    unicorn_role: "Admin",
    global_role: null,
    tenant_id: 9999,
    archived: false,
  },
  clientUser: {
    user_uuid: "client-user-uuid-102",
    email: "user@clientrto.com",
    first_name: "Client",
    last_name: "User",
    unicorn_role: "User",
    global_role: null,
    tenant_id: 9999,
    archived: false,
  },
};

// Mock Auth Profile (Vivacity Team)
export const mockVivacityProfile = {
  id: mockVivacityUsers.teamMember.user_uuid,
  email: mockVivacityUsers.teamMember.email,
  first_name: mockVivacityUsers.teamMember.first_name,
  last_name: mockVivacityUsers.teamMember.last_name,
  unicorn_role: mockVivacityUsers.teamMember.unicorn_role,
  global_role: mockVivacityUsers.teamMember.global_role,
  tenant_id: VIVACITY_TENANT_ID,
};

// Mock Auth Profile (Client User)
export const mockClientProfile = {
  id: mockClientUsers.clientAdmin.user_uuid,
  email: mockClientUsers.clientAdmin.email,
  first_name: mockClientUsers.clientAdmin.first_name,
  last_name: mockClientUsers.clientAdmin.last_name,
  unicorn_role: mockClientUsers.clientAdmin.unicorn_role,
  global_role: null,
  tenant_id: 9999,
};

// Mock Rocks
export const mockRocks = {
  companyRock: {
    id: "rock-company-001",
    title: "Increase Revenue by 20%",
    rock_type: "Company",
    status: "on_track",
    owner_id: mockVivacityUsers.superAdmin.user_uuid,
    tenant_id: VIVACITY_TENANT_ID,
    quarter_number: 1,
    quarter_year: 2026,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
  teamRock: {
    id: "rock-team-001",
    title: "Launch New Client Portal",
    rock_type: "Team",
    status: "at_risk",
    owner_id: mockVivacityUsers.teamLeader.user_uuid,
    parent_rock_id: "rock-company-001",
    tenant_id: VIVACITY_TENANT_ID,
    quarter_number: 1,
    quarter_year: 2026,
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
  individualRock: {
    id: "rock-individual-001",
    title: "Complete API Integration",
    rock_type: "Individual",
    status: "on_track",
    owner_id: mockVivacityUsers.teamMember.user_uuid,
    parent_rock_id: "rock-team-001",
    tenant_id: VIVACITY_TENANT_ID,
    quarter_number: 1,
    quarter_year: 2026,
    created_at: "2026-01-10T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
};

// Mock Issues (Risks & Opportunities)
export const mockIssues = {
  openRisk: {
    id: "issue-risk-001",
    title: "Staff capacity constraint Q1",
    item_type: "risk",
    status: "Open",
    category: "Capacity",
    impact: "High",
    tenant_id: VIVACITY_TENANT_ID,
    assigned_to: mockVivacityUsers.teamLeader.user_uuid,
    created_by: mockVivacityUsers.superAdmin.user_uuid,
    source: "ro_page",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
  },
  discussingOpportunity: {
    id: "issue-opp-001",
    title: "New partnership with TAFE NSW",
    item_type: "opportunity",
    status: "Discussing",
    category: "Strategic",
    impact: "High",
    tenant_id: VIVACITY_TENANT_ID,
    assigned_to: mockVivacityUsers.superAdmin.user_uuid,
    created_by: mockVivacityUsers.teamLeader.user_uuid,
    source: "meeting_l10",
    meeting_id: "meeting-l10-001",
    created_at: "2026-01-20T00:00:00Z",
    updated_at: "2026-01-25T00:00:00Z",
  },
  solvedRisk: {
    id: "issue-risk-002",
    title: "Compliance deadline pressure",
    item_type: "risk",
    status: "Solved",
    category: "Compliance",
    impact: "Critical",
    tenant_id: VIVACITY_TENANT_ID,
    resolved_at: "2026-01-30T00:00:00Z",
    resolved_by: mockVivacityUsers.superAdmin.user_uuid,
    created_at: "2026-01-10T00:00:00Z",
    updated_at: "2026-01-30T00:00:00Z",
  },
};

// Mock Meetings
export const mockMeetings = {
  scheduledL10: {
    id: "meeting-l10-001",
    meeting_type: "L10",
    title: "Weekly L10 - Week 6",
    status: "scheduled",
    scheduled_at: "2026-02-10T09:00:00Z",
    facilitator_id: mockVivacityUsers.teamLeader.user_uuid,
    tenant_id: VIVACITY_TENANT_ID,
    workspace_id: TEST_WORKSPACE_ID,
    created_at: "2026-02-01T00:00:00Z",
  },
  inProgressL10: {
    id: "meeting-l10-002",
    meeting_type: "L10",
    title: "Weekly L10 - Week 5",
    status: "in_progress",
    scheduled_at: "2026-02-05T09:00:00Z",
    started_at: "2026-02-05T09:05:00Z",
    facilitator_id: mockVivacityUsers.superAdmin.user_uuid,
    tenant_id: VIVACITY_TENANT_ID,
    workspace_id: TEST_WORKSPACE_ID,
    created_at: "2026-01-28T00:00:00Z",
  },
  completedL10: {
    id: "meeting-l10-003",
    meeting_type: "L10",
    title: "Weekly L10 - Week 4",
    status: "completed",
    scheduled_at: "2026-01-28T09:00:00Z",
    started_at: "2026-01-28T09:02:00Z",
    ended_at: "2026-01-28T10:30:00Z",
    facilitator_id: mockVivacityUsers.teamLeader.user_uuid,
    tenant_id: VIVACITY_TENANT_ID,
    workspace_id: TEST_WORKSPACE_ID,
    is_complete: true,
    created_at: "2026-01-21T00:00:00Z",
  },
};

// Mock QC Records
export const mockQCs = {
  scheduled: {
    id: "qc-001",
    reviewee_id: mockVivacityUsers.teamMember.user_uuid,
    manager_id: mockVivacityUsers.teamLeader.user_uuid,
    status: "scheduled",
    scheduled_date: "2026-02-15",
    quarter: "Q1",
    year: 2026,
    tenant_id: VIVACITY_TENANT_ID,
    created_at: "2026-02-01T00:00:00Z",
  },
  completed: {
    id: "qc-002",
    reviewee_id: mockVivacityUsers.teamLeader.user_uuid,
    manager_id: mockVivacityUsers.superAdmin.user_uuid,
    status: "completed",
    scheduled_date: "2026-01-15",
    completed_at: "2026-01-15T14:30:00Z",
    quarter: "Q4",
    year: 2025,
    tenant_id: VIVACITY_TENANT_ID,
    created_at: "2025-12-20T00:00:00Z",
  },
};

// Mock Accountability Chart
export const mockAccountability = {
  chart: {
    id: "chart-001",
    tenant_id: VIVACITY_TENANT_ID,
    status: "active",
    created_by: mockVivacityUsers.superAdmin.user_uuid,
    created_at: "2026-01-01T00:00:00Z",
  },
  functions: [
    {
      id: "func-001",
      chart_id: "chart-001",
      name: "Integrator",
      function_type: "integrator",
      tenant_id: VIVACITY_TENANT_ID,
      sort_order: 1,
    },
    {
      id: "func-002",
      chart_id: "chart-001",
      name: "Operations",
      function_type: "operations",
      tenant_id: VIVACITY_TENANT_ID,
      sort_order: 2,
    },
  ],
  seats: [
    {
      id: "seat-001",
      chart_id: "chart-001",
      function_id: "func-001",
      seat_name: "Managing Director",
      tenant_id: VIVACITY_TENANT_ID,
      eos_role_type: "integrator",
      sort_order: 1,
    },
    {
      id: "seat-002",
      chart_id: "chart-001",
      function_id: "func-002",
      seat_name: "Operations Manager",
      tenant_id: VIVACITY_TENANT_ID,
      eos_role_type: null,
      sort_order: 1,
    },
  ],
  assignments: [
    {
      id: "assign-001",
      seat_id: "seat-001",
      user_id: mockVivacityUsers.superAdmin.user_uuid,
      assignment_type: "primary",
      tenant_id: VIVACITY_TENANT_ID,
      start_date: "2026-01-01",
    },
    {
      id: "assign-002",
      seat_id: "seat-002",
      user_id: mockVivacityUsers.teamLeader.user_uuid,
      assignment_type: "primary",
      tenant_id: VIVACITY_TENANT_ID,
      start_date: "2026-01-01",
    },
  ],
};

// Enum validation data
export const validEnumValues = {
  rockStatus: ["Not_Started", "On_Track", "At_Risk", "Off_Track", "Complete"],
  issueStatus: [
    "Open",
    "Discussing",
    "Solved",
    "Archived",
    "In Review",
    "Actioning",
    "Escalated",
    "Closed",
  ],
  todoStatus: ["Open", "Complete", "Cancelled"],
  meetingStatus: [
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
    "ready_to_close",
    "closed",
    "locked",
  ],
  meetingType: ["L10", "Quarterly", "Annual", "Focus_Day", "Custom", "Same_Page"],
  issueType: ["risk", "opportunity"],
  issueCategory: [
    "Delivery",
    "Compliance",
    "Financial",
    "Capacity",
    "Systems",
    "Client",
    "Strategic",
    "Growth",
  ],
  issueImpact: ["Low", "Medium", "High", "Critical"],
};

// Helper to create test run ID for cleanup
export const createTestRunId = () => `test-run-${Date.now()}`;
