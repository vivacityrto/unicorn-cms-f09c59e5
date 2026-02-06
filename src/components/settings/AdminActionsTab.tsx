import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  Mail, 
  UserCog, 
  History,
  Lock
} from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';

/**
 * Admin Actions tab - SuperAdmin only.
 * Contains sensitive administrative actions for the current user.
 * This component guards itself and will not render for non-SuperAdmin users.
 */
export function AdminActionsTab() {
  const { isSuperAdmin } = useRBAC();
  const [loading, setLoading] = useState(false);

  // This tab is only for SuperAdmins - show access denied for others
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Shield className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold text-muted-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          This section is only available to Super Administrators. 
          If you believe you should have access, please contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Audit Notice */}
      <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Audit Notice:</strong> All administrative actions on this page are logged with your user ID, 
          timestamp, and reason. These logs are permanent and cannot be deleted.
        </AlertDescription>
      </Alert>

      {/* Account Status */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            <CardTitle>Account Status</CardTitle>
          </div>
          <CardDescription>
            Control account activation status for this user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Account Active</Label>
              <p className="text-sm text-muted-foreground">
                Deactivating will prevent the user from logging in
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="text-xs text-muted-foreground">
            Last status change: Never (account created active)
          </div>
        </CardContent>
      </Card>

      {/* Password Reset */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>Password Reset</CardTitle>
          </div>
          <CardDescription>
            Send a password reset email to this user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will send an email to the user with a link to reset their password. 
            The link expires after 24 hours.
          </p>
          <Button variant="outline" className="gap-2">
            <Mail className="h-4 w-4" />
            Send Password Reset Email
          </Button>
        </CardContent>
      </Card>

      {/* Role Management */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Role & Team Allocation</CardTitle>
          </div>
          <CardDescription>
            Manage user role and team assignments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Unicorn Role</Label>
              <Select defaultValue="Team Member">
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Super Admin">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary">Super Admin</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="Team Leader">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Team Leader</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="Team Member">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Team Member</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="team">Team Assignment</Label>
              <Select>
                <SelectTrigger id="team">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compliance">Compliance Team</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="leadership">Leadership</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button className="gap-2">
              Save Role Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle>Recent Activity</CardTitle>
          </div>
          <CardDescription>
            Administrative actions performed on this account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            No administrative actions recorded yet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
