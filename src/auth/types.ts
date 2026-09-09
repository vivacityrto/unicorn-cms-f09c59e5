/**
 * Profile fields consumed by the authentication and authorization boundary.
 * Keep this contract narrower than the generated users row so consumers do
 * not couple to unrelated profile columns.
 */
export interface UserProfile {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member'
    | 'Integrator' | 'BGT' | 'CSC' | 'CET'
    | 'Admin' | 'User' | 'Academy User';
  global_role: 'SuperAdmin' | null;
  superadmin_level: 'Administrator' | 'Team Leader' | 'General' | 'Assistant' | null;
  tenant_id: number | null;
  avatar_url: string | null;
  job_title: string | null;
  is_vivacity_internal: boolean | null;
  is_team: boolean | null;
  kpi_role: string | null;
}
