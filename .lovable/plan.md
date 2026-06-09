Scope: Update 5 hardcoded role checks so all 7 internal Vivacity roles are recognized as staff.

No other changes. Build only; no data model or backend work.

Changes per file:

1. src/contexts/TenantTypeContext.tsx (line ~42)
   - Change: `const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(profile?.unicorn_role || "");`
   - To: `const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member", "Integrator", "BGT", "CSC", "CET"].includes(profile?.unicorn_role || "");`

2. src/components/DashboardLayout.tsx (line ~188)
   - Change: `const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(userRole);`
   - To: `const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member", "Integrator", "BGT", "CSC", "CET"].includes(userRole);`

3. src/components/client/ClientFilesTab.tsx (line ~102)
   - Change: `const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');`
   - To: `const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET'].includes(profile?.unicorn_role || '');`

4. src/components/client/SharePointFolderConfig.tsx (line ~166)
   - Change: `const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');`
   - To: `const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET'].includes(profile?.unicorn_role || '');`

5. src/components/client/PackageStagesManager.tsx (line ~262)
   - The current inline check uses `===` ORs for Super Admin, Team Leader, Team Member.
   - Replace the entire `isVivacityStaff` prop expression with an `.includes()` array containing all 7 roles.
   - From: `isVivacityStaff={profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader' || profile?.unicorn_role === 'Team Member'}`
   - To: `isVivacityStaff={['Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET'].includes(profile?.unicorn_role || '')}`

Verification: TypeScript compilation should pass with exit code 0 after edits.