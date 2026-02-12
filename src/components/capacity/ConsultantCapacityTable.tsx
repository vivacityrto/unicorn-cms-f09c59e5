import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConsultantCapacityOverview, useConsultantClients, ConsultantCapacityRow } from '@/hooks/useCapacityEngine';
import { Users, AlertTriangle } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';

function getProgressVariant(load: number, assignable: number): string {
  if (assignable <= 0) return 'bg-muted';
  const pct = (load / assignable) * 100;
  if (pct > 100) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

function StatusChip({ load, assignable }: { load: number; assignable: number }) {
  if (assignable <= 0) return <Badge variant="outline" className="text-xs">N/A</Badge>;
  const pct = (load / assignable) * 100;
  if (pct > 100) return <Badge variant="destructive" className="text-xs">Over</Badge>;
  if (pct >= 70) return <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700" variant="outline">Tight</Badge>;
  return <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700" variant="outline">Available</Badge>;
}

function ConsultantDrawer({ consultant, open, onClose }: {
  consultant: ConsultantCapacityRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: clients, isLoading } = useConsultantClients(consultant?.user_uuid ?? null);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{consultant?.first_name} {consultant?.last_name}</SheetTitle>
          <SheetDescription>
            {consultant?.job_title || 'Consultant'} • {consultant?.active_clients} active clients
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center bg-muted/50 rounded-lg p-3">
            <div>
              <p className="text-xs text-muted-foreground">Capacity</p>
              <p className="text-sm font-medium">{consultant?.weekly_assignable_hours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Load</p>
              <p className="text-sm font-medium">{consultant?.current_load.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-sm font-medium">{consultant?.remaining_capacity.toFixed(1)}h</p>
            </div>
          </div>

          <h4 className="text-sm font-medium pt-2">Assigned Clients</h4>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : clients && clients.length > 0 ? (
            <div className="space-y-2">
              {clients.map((c) => (
                <div key={c.tenant_id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.onboarding_multiplier > 1 && (
                      <Badge variant="outline" className="text-xs">
                        {c.onboarding_multiplier}x onboarding
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{c.tier_name}</span>
                    <span>{c.weekly_required}h/wk</span>
                    {c.percent_utilised > 0 && (
                      <span className={c.percent_utilised >= 90 ? 'text-red-600' : c.percent_utilised >= 75 ? 'text-amber-600' : ''}>
                        {c.percent_utilised.toFixed(0)}% used
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active clients assigned.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ConsultantCapacityTable() {
  const { data: consultants, isLoading, error } = useConsultantCapacityOverview();
  const [hideZero, setHideZero] = useState(true);
  const [selectedConsultant, setSelectedConsultant] = useState<ConsultantCapacityRow | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !consultants) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load capacity data.
        </CardContent>
      </Card>
    );
  }

  const filtered = hideZero
    ? consultants.filter((c) => c.weekly_assignable_hours > 0)
    : consultants;
  const overloaded = filtered.filter((c) => c.overload).length;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Consultant Capacity
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch id="hide-zero" checked={hideZero} onCheckedChange={setHideZero} />
                <Label htmlFor="hide-zero" className="text-xs">Hide zero capacity</Label>
              </div>
              <Badge variant="outline" className="text-xs">{filtered.length} shown</Badge>
              {overloaded > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {overloaded} over
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* CSC Client Distribution Summary */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-md bg-muted/50">
            <span className="text-xs font-medium text-muted-foreground">Clients:</span>
            {filtered
              .filter(c => c.active_clients > 0)
              .sort((a, b) => b.active_clients - a.active_clients)
              .map(c => (
                <Badge
                  key={c.user_uuid}
                  variant="outline"
                  className="text-xs gap-1 cursor-pointer hover:bg-accent"
                  onClick={() => setSelectedConsultant(c)}
                >
                  {c.first_name} <span className="font-bold">{c.active_clients}</span>
                </Badge>
              ))}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultant</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Clients</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered
                  .sort((a, b) => a.remaining_capacity - b.remaining_capacity)
                  .map((c) => {
                    const pct = c.weekly_assignable_hours > 0
                      ? Math.min((c.current_load / c.weekly_assignable_hours) * 100, 150) : 0;
                    const progressClass = getProgressVariant(c.current_load, c.weekly_assignable_hours);

                    return (
                      <TableRow
                        key={c.user_uuid}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedConsultant(c)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{c.first_name} {c.last_name}</p>
                            {c.job_title && <p className="text-xs text-muted-foreground">{c.job_title}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{c.weekly_assignable_hours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm font-medium">{c.current_load.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm font-medium">{c.remaining_capacity.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm">{c.active_clients}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(pct, 100)} className="h-2 flex-1" indicatorClassName={progressClass} />
                            <StatusChip load={c.current_load} assignable={c.weekly_assignable_hours} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConsultantDrawer
        consultant={selectedConsultant}
        open={!!selectedConsultant}
        onClose={() => setSelectedConsultant(null)}
      />
    </>
  );
}
