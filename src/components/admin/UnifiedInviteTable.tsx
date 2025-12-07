import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, UserCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type InviteRow = {
  id: string;
  created_at: string;
  email: string;
  tenant_id: number;
  role: string;
  outcome: string;
  code: string | null;
  detail: string | null;
  actor_user_id: string | null;
  invite_attempts: number;
};

type UserStatus = {
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
};

export default function UnifiedInviteTable() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [userStatuses, setUserStatuses] = useState<Map<string, UserStatus>>(new Map());
  const [tenantNames, setTenantNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("audit_invites")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setInvites(data || []);

      // Fetch tenant names and user statuses
      if (data && data.length > 0) {
        const emails = [...new Set(data.map(d => d.email))];
        const tenantIds = [...new Set(data.map(d => d.tenant_id))];
        
        await Promise.all([
          fetchUserStatuses(emails),
          fetchTenantNames(tenantIds)
        ]);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load invite data");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStatuses = async (emails: string[]) => {
    try {
      // Check which emails have verified accounts by checking if they exist in users table
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('email, user_uuid, created_at')
        .in('email', emails);
      
      if (usersError) throw usersError;

      const statusMap = new Map<string, UserStatus>();
      usersData?.forEach(user => {
        // If user exists in our users table, they've verified their email
        statusMap.set(user.email, {
          email: user.email,
          email_confirmed_at: user.created_at, // User creation implies verification
          created_at: user.created_at
        });
      });

      setUserStatuses(statusMap);
    } catch (e: any) {
      console.error("Failed to fetch user statuses:", e);
    }
  };

  const fetchTenantNames = async (tenantIds: number[]) => {
    try {
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      
      if (tenantsError) throw tenantsError;

      const namesMap = new Map<number, string>();
      tenantsData?.forEach(tenant => {
        namesMap.set(tenant.id, tenant.name);
      });

      setTenantNames(namesMap);
    } catch (e: any) {
      console.error("Failed to fetch tenant names:", e);
    }
  };

  useEffect(() => {
    fetchInvites();

    // Set up real-time subscription
    const channel = supabase
      .channel("invite-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_invites",
        },
        () => {
          fetchInvites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getVerificationStatus = (email: string, outcome: string) => {
    if (outcome !== "success") {
      return null;
    }

    const userStatus = userStatuses.get(email);
    if (!userStatus) {
      return { status: "unknown", label: "Status Unknown", icon: Clock };
    }

    if (userStatus.email_confirmed_at) {
      return {
        status: "verified",
        label: "Verified",
        date: new Date(userStatus.email_confirmed_at).toLocaleString(),
        icon: CheckCircle,
      };
    }

    return {
      status: "pending",
      label: "Waiting for Verification",
      date: new Date(userStatus.created_at).toLocaleString(),
      icon: Clock,
    };
  };

  const labelForRole = (r: string) => {
    switch (r) {
      case "SUPER_ADMIN_ADMINISTRATOR":
        return "Super Admin – Administrator";
      case "SUPER_ADMIN_TEAM_LEADER":
        return "Super Admin – Team Leader";
      case "SUPER_ADMIN_GENERAL":
        return "Super Admin – General";
      case "CLIENT_ADMIN":
        return "Client Admin";
      case "CLIENT_USER":
        return "Client User";
      default:
        return r;
    }
  };

  const stats = {
    total: invites.length,
    success: invites.filter(i => i.outcome === "success").length,
    failed: invites.filter(i => i.outcome === "failure").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <CardTitle>Invite Management</CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              Total: <span className="ml-1 font-semibold">{stats.total}</span>
            </Badge>
            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Success: <span className="ml-1 font-semibold">{stats.success}</span>
            </Badge>
            <Badge variant="destructive" className="text-xs">
              Failed: <span className="ml-1 font-semibold">{stats.failed}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : invites.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No invites found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Tenant</TableHead>
                    <TableHead className="whitespace-nowrap">Attempts</TableHead>
                    <TableHead className="whitespace-nowrap">Role</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Verification</TableHead>
                    <TableHead className="whitespace-nowrap">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => {
                    const verification = getVerificationStatus(invite.email, invite.outcome);
                    const StatusIcon = verification?.icon;
                    const tenantName = tenantNames.get(invite.tenant_id) || `ID: ${invite.tenant_id}`;

                    return (
                      <TableRow key={invite.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(invite.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{invite.email}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="max-w-[200px] truncate" title={tenantName}>
                            {tenantName}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <Badge variant="secondary" className="text-xs">
                            {invite.invite_attempts || 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-xs">
                            {labelForRole(invite.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {invite.outcome === "success" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {verification && StatusIcon && (
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant={verification.status === "verified" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {verification.label}
                              </Badge>
                              {verification.date && (
                                <span className="text-xs text-muted-foreground">
                                  {verification.date}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap max-w-xs">
                          {invite.outcome === "failure" && (
                            <div className="space-y-1">
                              {invite.code && (
                                <Badge variant="outline" className="text-xs">
                                  {invite.code}
                                </Badge>
                              )}
                              {invite.detail && (
                                <p className="truncate text-xs text-muted-foreground max-w-[200px]" title={invite.detail}>
                                  {invite.detail}
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
