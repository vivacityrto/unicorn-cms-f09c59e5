import { format, formatDistanceToNow } from 'date-fns';
import { LogIn, Clock, FileText, MessageSquare, CheckSquare, Users, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLoginHistory } from '@/hooks/useLoginHistory';

interface ClientLoginHistoryTabProps {
  tenantId: number;
}

export function ClientLoginHistoryTab({ tenantId }: ClientLoginHistoryTabProps) {
  const { users, activities, loading } = useLoginHistory(tenantId);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            User Login Summary
          </CardTitle>
          <CardDescription>
            Last sign-in and activity counts for all users in this organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users found for this organisation.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead>Legacy Sign In</TableHead>
                  <TableHead className="text-right">Total Logins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.last_sign_in_at ? (
                        <div>
                          <p className="text-sm">
                            {format(new Date(user.last_sign_in_at), 'dd MMM yyyy, h:mm a')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.legacy_last_sign_in_at ? (
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-sm">
                              {format(new Date(user.legacy_last_sign_in_at), 'dd MMM yyyy, h:mm a')}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            <History className="h-2.5 w-2.5 mr-0.5" />
                            Legacy
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {user.login_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogIn className="h-4 w-4 text-primary" />
            Login Activity Log
          </CardTitle>
          <CardDescription>
            Detailed login history with session activity metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No login activity recorded yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Login events will appear here automatically as users sign in to the platform.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Login Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3" />
                      Docs
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Messages
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CheckSquare className="h-3 w-3" />
                      Tasks
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {entry.first_name} {entry.last_name}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {format(new Date(entry.login_date), 'dd MMM yyyy, h:mm a')}
                      </p>
                    </TableCell>
                    <TableCell>
                      {entry.logout_date ? (
                        <span className="text-sm">
                          {formatDistanceToNow(new Date(entry.login_date), {
                            includeSeconds: false,
                          }).replace(
                            /about |over |almost |less than /g,
                            ''
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {entry.docs_downloaded ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {entry.messages_sent ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {entry.tasks_created ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
