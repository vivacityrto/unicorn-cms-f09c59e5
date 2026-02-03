import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, X, Info, Users, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';

// Permission matrix data
const EOS_PERMISSIONS = [
  { action: 'View all EOS pages', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: true },
  { action: 'Create Rocks', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: true },
  { action: 'Edit own Rocks', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: true },
  { action: "Edit others' Rocks", superAdmin: true, teamLeader: true, teamMember: false, admin: true, user: false },
  { action: 'Schedule meetings', superAdmin: true, teamLeader: true, teamMember: false, admin: true, user: false },
  { action: 'Facilitate meetings', superAdmin: true, teamLeader: true, teamMember: false, admin: true, user: false },
  { action: 'Manage agenda templates', superAdmin: true, teamLeader: false, teamMember: false, admin: true, user: false },
  { action: 'Edit Mission Control (V/TO)', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: false },
  { action: 'Create risks/opportunities', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: true },
  { action: 'Escalate risks', superAdmin: true, teamLeader: true, teamMember: false, admin: true, user: false },
  { action: 'Close critical risks', superAdmin: true, teamLeader: false, teamMember: false, admin: false, user: false },
  { action: 'Schedule Quarterly Conversations', superAdmin: true, teamLeader: true, teamMember: false, admin: true, user: false },
  { action: 'Sign Quarterly Conversations', superAdmin: true, teamLeader: true, teamMember: true, admin: true, user: true },
  { action: 'Modify Accountability Chart', superAdmin: true, teamLeader: false, teamMember: false, admin: true, user: false },
];

const PermissionIcon = ({ allowed }: { allowed: boolean }) => (
  allowed ? (
    <Check className="h-4 w-4 text-emerald-600 mx-auto" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground mx-auto" />
  )
);

export default function RoleReference() {
  const { profile } = useAuth();
  const { isVivacityTeam } = useRBAC();

  const currentRole = profile?.unicorn_role || 'User';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Role Reference
          </h1>
          <p className="text-muted-foreground mt-2">
            Understand what each role can do in EOS and across the platform
          </p>
        </div>

        {/* Current Role Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Your current role</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="default" className="text-sm">{currentRole}</Badge>
                  <span className="text-sm text-muted-foreground">
                    ({isVivacityTeam ? 'Vivacity Team' : 'Organisation'})
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vivacity Team Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Vivacity Team Roles
            </CardTitle>
            <CardDescription>
              Internal staff roles for Vivacity Coaching & Consulting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <Badge variant="default" className="mb-2">Super Admin</Badge>
                <p className="text-sm text-muted-foreground">
                  Full platform access including Administration section. Can manage all tenants, users, and system settings.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <Badge variant="secondary" className="mb-2">Team Leader</Badge>
                <p className="text-sm text-muted-foreground">
                  Delivers services and facilitates EOS. Can schedule meetings and escalate risks. No access to Administration.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <Badge variant="outline" className="mb-2">Team Member</Badge>
                <p className="text-sm text-muted-foreground">
                  Supports delivery and participates in EOS. Can create own rocks and sign QCs. Limited escalation abilities.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Tenant Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client Organisation Roles
            </CardTitle>
            <CardDescription>
              Roles for users within client tenant organisations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg">
                <Badge variant="default" className="mb-2">Admin</Badge>
                <p className="text-sm text-muted-foreground">
                  Organisation administrator. Can manage EOS meetings, templates, and team members. Full access to organisation's EOS data.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <Badge variant="outline" className="mb-2">General User</Badge>
                <p className="text-sm text-muted-foreground">
                  Standard team member. Can create own rocks, sign quarterly conversations, and participate in meetings. Cannot schedule or manage.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* EOS Permissions Matrix */}
        <Card>
          <CardHeader>
            <CardTitle>EOS Permissions Matrix</CardTitle>
            <CardDescription>
              Detailed breakdown of what each role can do in EOS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Action</TableHead>
                    <TableHead className="text-center w-24">
                      <span className="text-xs">Super Admin</span>
                    </TableHead>
                    <TableHead className="text-center w-24">
                      <span className="text-xs">Team Leader</span>
                    </TableHead>
                    <TableHead className="text-center w-24">
                      <span className="text-xs">Team Member</span>
                    </TableHead>
                    <TableHead className="text-center w-24 border-l">
                      <span className="text-xs">Admin</span>
                    </TableHead>
                    <TableHead className="text-center w-24">
                      <span className="text-xs">User</span>
                    </TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableHead></TableHead>
                    <TableHead colSpan={3} className="text-center text-xs text-muted-foreground">
                      Vivacity Team
                    </TableHead>
                    <TableHead colSpan={2} className="text-center text-xs text-muted-foreground border-l">
                      Client Tenant
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {EOS_PERMISSIONS.map((perm, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-sm">{perm.action}</TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon allowed={perm.superAdmin} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon allowed={perm.teamLeader} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon allowed={perm.teamMember} />
                      </TableCell>
                      <TableCell className="text-center border-l">
                        <PermissionIcon allowed={perm.admin} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon allowed={perm.user} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Info Note */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">About EOS Visibility</p>
                <p>
                  All users can see all EOS pages within their tenant. Roles control what <em>actions</em> you can take,
                  not what pages you can view. Disabled actions will show a tooltip explaining the required permission.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
