/**
 * Package Lifecycle Test Data Fixtures
 * 
 * Mock data for package workflow tests
 */

export const VIVACITY_TENANT_ID = 6372;
export const CLIENT_TENANT_ID = 9999;

// Mock Packages
export const mockPackages = {
  kickStart: {
    id: 1,
    name: 'KickStart',
    full_text: 'KickStart Package',
    details: 'Initial compliance setup package',
    status: 'active',
    slug: 'kickstart',
    duration_months: 3,
    package_type: 'kickstart',
    total_hours: 40,
    progress_mode: 'stage',
    created_at: '2026-01-01T00:00:00Z',
  },
  healthCheck: {
    id: 2,
    name: 'Health Check',
    full_text: 'Health Check Package',
    details: 'Annual compliance review',
    status: 'active',
    slug: 'health-check',
    duration_months: 1,
    package_type: 'healthcheck',
    total_hours: 20,
    progress_mode: 'stage',
    created_at: '2026-01-01T00:00:00Z',
  },
  membership: {
    id: 3,
    name: 'Membership',
    full_text: 'Ongoing Membership',
    details: 'Monthly consulting hours',
    status: 'active',
    slug: 'membership',
    duration_months: 12,
    package_type: 'membership',
    total_hours: 120,
    progress_mode: 'hours',
    created_at: '2026-01-01T00:00:00Z',
  },
  inactivePackage: {
    id: 4,
    name: 'Legacy Package',
    full_text: 'Legacy Package',
    details: 'No longer offered',
    status: 'inactive',
    slug: 'legacy',
    duration_months: 6,
    package_type: 'custom',
    total_hours: 50,
    progress_mode: 'stage',
    created_at: '2025-01-01T00:00:00Z',
  },
};

// Mock Package Instances (client subscriptions)
export const mockPackageInstances = {
  activeKickStart: {
    id: 101,
    tenant_id: CLIENT_TENANT_ID,
    package_id: mockPackages.kickStart.id,
    start_date: '2026-01-15',
    end_date: '2026-04-15',
    hours_included: 40,
    hours_used: 10,
    is_complete: false,
    status: 'active',
    created_at: '2026-01-15T00:00:00Z',
  },
  completedHealthCheck: {
    id: 102,
    tenant_id: CLIENT_TENANT_ID,
    package_id: mockPackages.healthCheck.id,
    start_date: '2025-12-01',
    end_date: '2026-01-01',
    hours_included: 20,
    hours_used: 20,
    is_complete: true,
    status: 'complete',
    created_at: '2025-12-01T00:00:00Z',
  },
  activeMembership: {
    id: 103,
    tenant_id: CLIENT_TENANT_ID,
    package_id: mockPackages.membership.id,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    hours_included: 120,
    hours_used: 15,
    is_complete: false,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
  },
};

// Mock Stages
export const mockStages = {
  scopingCall: {
    id: 10,
    title: 'Scoping Call',
    short_name: 'Scoping',
    description: 'Initial discovery call',
    stage_type: 'kickoff',
    is_reusable: true,
    stage_key: 'scoping-call',
    dashboard_visible: true,
    is_certified: true,
    created_at: '2026-01-01T00:00:00Z',
    requires_stage_keys: null as string[] | null,
  },
  policyReview: {
    id: 11,
    title: 'Policy Review',
    short_name: 'Policies',
    description: 'Review and update policies',
    stage_type: 'delivery',
    is_reusable: true,
    stage_key: 'policy-review',
    dashboard_visible: true,
    is_certified: true,
    requires_stage_keys: ['scoping-call'] as string[] | null,
    created_at: '2026-01-01T00:00:00Z',
  },
  finalReport: {
    id: 12,
    title: 'Final Report',
    short_name: 'Report',
    description: 'Deliverable summary report',
    stage_type: 'closeout',
    is_reusable: true,
    stage_key: 'final-report',
    dashboard_visible: true,
    is_certified: false,
    requires_stage_keys: ['policy-review'] as string[] | null,
    created_at: '2026-01-01T00:00:00Z',
  },
};

// Mock Package Stages (linking packages to stages)
export const mockPackageStages = {
  kickStartScoping: {
    id: 1001,
    package_id: mockPackages.kickStart.id,
    stage_id: mockStages.scopingCall.id,
    sort_order: 1,
    is_required: true,
    dashboard_group: 'Setup',
  },
  kickStartPolicies: {
    id: 1002,
    package_id: mockPackages.kickStart.id,
    stage_id: mockStages.policyReview.id,
    sort_order: 2,
    is_required: true,
    dashboard_group: 'Delivery',
  },
  kickStartReport: {
    id: 1003,
    package_id: mockPackages.kickStart.id,
    stage_id: mockStages.finalReport.id,
    sort_order: 3,
    is_required: true,
    dashboard_group: 'Closeout',
  },
};

// Mock Stage Instances (per-client stage progress)
export const mockStageInstances = {
  scopingComplete: {
    id: 2001,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.scopingCall.id,
    tenant_id: CLIENT_TENANT_ID,
    status: 'complete',
    started_at: '2026-01-16T09:00:00Z',
    completed_at: '2026-01-16T10:30:00Z',
    created_at: '2026-01-16T09:00:00Z',
  },
  policiesInProgress: {
    id: 2002,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.policyReview.id,
    tenant_id: CLIENT_TENANT_ID,
    status: 'in_progress',
    started_at: '2026-01-20T09:00:00Z',
    completed_at: null,
    created_at: '2026-01-20T09:00:00Z',
  },
  reportPending: {
    id: 2003,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.finalReport.id,
    tenant_id: CLIENT_TENANT_ID,
    status: 'pending',
    started_at: null,
    completed_at: null,
    created_at: '2026-01-15T00:00:00Z',
  },
};

// Mock Time Entries
export const mockTimeEntries = {
  manualEntry: {
    id: 'time-001',
    tenant_id: CLIENT_TENANT_ID,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.scopingCall.id,
    user_id: 'team-member-uuid-003',
    duration_minutes: 90,
    source: 'manual',
    notes: 'Scoping call with client',
    work_date: '2026-01-16',
    created_at: '2026-01-16T11:00:00Z',
  },
  timerEntry: {
    id: 'time-002',
    tenant_id: CLIENT_TENANT_ID,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.policyReview.id,
    user_id: 'team-member-uuid-003',
    duration_minutes: 180,
    source: 'timer',
    notes: 'Policy document review',
    work_date: '2026-01-20',
    created_at: '2026-01-20T15:00:00Z',
  },
  calendarEntry: {
    id: 'time-003',
    tenant_id: CLIENT_TENANT_ID,
    package_instance_id: mockPackageInstances.activeKickStart.id,
    stage_id: mockStages.policyReview.id,
    user_id: 'team-leader-uuid-002',
    duration_minutes: 60,
    source: 'calendar',
    notes: 'Follow-up meeting',
    work_date: '2026-01-22',
    created_at: '2026-01-22T14:00:00Z',
  },
};

// Mock Alerts
export const mockAlerts = {
  warningAlert: {
    id: 'alert-001',
    tenant_id: CLIENT_TENANT_ID,
    client_id: CLIENT_TENANT_ID,
    package_id: mockPackages.kickStart.id,
    client_package_id: String(mockPackageInstances.activeKickStart.id),
    alert_type: 'hours_warning',
    severity: 'warning',
    title: 'Package hours at 75%',
    body: 'KickStart package has used 75% of allocated hours',
    threshold_percent: 75,
    is_dismissed: false,
    created_at: '2026-02-01T00:00:00Z',
  },
  criticalAlert: {
    id: 'alert-002',
    tenant_id: CLIENT_TENANT_ID,
    client_id: CLIENT_TENANT_ID,
    package_id: mockPackages.kickStart.id,
    client_package_id: String(mockPackageInstances.activeKickStart.id),
    alert_type: 'hours_critical',
    severity: 'critical',
    title: 'Package hours at 90%',
    body: 'KickStart package has used 90% of allocated hours',
    threshold_percent: 90,
    is_dismissed: false,
    created_at: '2026-02-05T00:00:00Z',
  },
  dismissedAlert: {
    id: 'alert-003',
    tenant_id: CLIENT_TENANT_ID,
    client_id: CLIENT_TENANT_ID,
    package_id: mockPackages.membership.id,
    client_package_id: String(mockPackageInstances.activeMembership.id),
    alert_type: 'hours_warning',
    severity: 'warning',
    title: 'Membership hours at 50%',
    body: null,
    threshold_percent: 50,
    is_dismissed: true,
    created_at: '2026-01-20T00:00:00Z',
  },
};

// Usage calculation helpers
export function calculatePackageUsage(packageInstance: typeof mockPackageInstances.activeKickStart) {
  const includedMinutes = packageInstance.hours_included * 60;
  const usedMinutes = packageInstance.hours_used * 60;
  const remainingMinutes = includedMinutes - usedMinutes;
  const usedPercent = (usedMinutes / includedMinutes) * 100;
  
  return {
    included_minutes: includedMinutes,
    used_minutes: usedMinutes,
    remaining_minutes: remainingMinutes,
    used_percent: usedPercent,
    package_id: packageInstance.package_id,
  };
}

// Staff task templates
export const mockStaffTasks = {
  scheduleCall: {
    id: 'task-template-001',
    package_id: mockPackages.kickStart.id,
    stage_id: mockStages.scopingCall.id,
    name: 'Schedule scoping call',
    description: 'Book meeting with client contact',
    due_date_offset: 3,
    order_number: 1,
    owner_role: 'Team Member',
    estimated_hours: 0.25,
    is_mandatory: true,
  },
  prepareAgenda: {
    id: 'task-template-002',
    package_id: mockPackages.kickStart.id,
    stage_id: mockStages.scopingCall.id,
    name: 'Prepare meeting agenda',
    description: 'Draft agenda and share with client',
    due_date_offset: 2,
    order_number: 2,
    owner_role: 'Team Member',
    estimated_hours: 0.5,
    is_mandatory: true,
  },
};
