/**
 * TeamCapacityWidget – Unicorn 2.0 Phase 10
 *
 * Executive/Integrator widget: Team Capacity Overview.
 * Table of consultants with capacity %, risk status, and alert banners.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_ORDER: Record<string, number> = { critical: 0, high: 1, elevated: 2, stable: 3 };
const STATUS_BADGE: Record<string, string> = {
  stable: 'bg-green-100 text-green-800',
  elevated: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export function TeamCapacityWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['team-capacity-overview'],
    queryFn: async () => {
      // Get latest snapshot per user
      const { data: snapshots, error } = await supabase
        .from('workload_snapshots' as any)
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(500);
      if (error) throw error;

      const seen = new Set<string>();
      const latest: any[] = [];
      for (const row of ((snapshots as any[]) || [])) {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          latest.push(row);
        }
      }

      // Get user names
      const userIds = latest.map((s: any) => s.user_id);
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);

      const userMap = new Map(
        (users || []).map((u: any) => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim()])
      );

      const enriched = latest.map((s: any) => ({
        ...s,
        consultant_name: userMap.get(s.user_id) || 'Unknown',
      }));

      enriched.sort((a: any, b: any) =>
        (STATUS_ORDER[a.overload_risk_status] ?? 3) - (STATUS_ORDER[b.overload_risk_status] ?? 3)
      );

      // Get burn risk client count per consultant (approximate via tenant assignments)
      const { data: burnData } = await supabase
        .from('tenant_package_burn_forecast' as any)
        .select('tenant_id, burn_risk_status')
        .eq('burn_risk_status', 'critical');

      const criticalBurnCount = new Set(((burnData as any[]) || []).map((b: any) => b.tenant_id)).size;

      return { consultants: enriched, criticalBurnCount };
    },
    staleTime: 120_000,
  });

  const consultants = data?.consultants || [];
  const critOver100 = consultants.filter((c: any) => c.capacity_utilisation_percentage > 100).length;
  const critOver120 = consultants.filter((c: any) => c.capacity_utilisation_percentage > 120).length;
  const showAlert = critOver100 >= 2 || critOver120 >= 1 || (data?.criticalBurnCount || 0) >= 3;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team Capacity Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : consultants.length === 0 ? (
          <p className="text-xs text-muted-foreground">No workload data available.</p>
        ) : (
          <div className="space-y-3">
            {showAlert && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {critOver120 >= 1 && `${critOver120} consultant(s) over 120% capacity. `}
                  {critOver100 >= 2 && `${critOver100} consultants over 100%. `}
                  {(data?.criticalBurnCount || 0) >= 3 && `${data?.criticalBurnCount} clients in critical burn.`}
                </AlertDescription>
              </Alert>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Consultant</TableHead>
                  <TableHead className="text-xs text-right">Capacity %</TableHead>
                  <TableHead className="text-xs text-right">High Risk</TableHead>
                  <TableHead className="text-xs text-right">Overdue</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consultants.slice(0, 15).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-medium">{c.consultant_name}</TableCell>
                    <TableCell className={cn(
                      'text-xs text-right font-medium',
                      c.capacity_utilisation_percentage >= 100 && 'text-destructive'
                    )}>
                      {c.capacity_utilisation_percentage}%
                    </TableCell>
                    <TableCell className={cn(
                      'text-xs text-right',
                      c.high_risk_stages_count > 0 && 'text-destructive'
                    )}>
                      {c.high_risk_stages_count}
                    </TableCell>
                    <TableCell className={cn(
                      'text-xs text-right',
                      c.overdue_tasks_count > 0 && 'text-destructive'
                    )}>
                      {c.overdue_tasks_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE[c.overload_risk_status])}>
                        {c.overload_risk_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
