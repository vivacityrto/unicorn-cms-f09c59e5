import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTgaRtoData } from '@/hooks/useTgaRtoData';
import { useTasIntakeSpike } from '@/hooks/useTasIntakeSpike';

interface Props {
  stageInstanceId: number;
  tenantId: number;
}

// SPIKE (QA only, never merged): one starter question, staff-run, prefilled from TGA data.
export function TasIntakeSpikePanel({ stageInstanceId, tenantId }: Props) {
  const [rtoCode, setRtoCode] = useState<string | null>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('tenants').select('rto_number').eq('id', tenantId).maybeSingle();
      if (!cancelled) setRtoCode((data as { rto_number?: string | null } | null)?.rto_number ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const tga = useTgaRtoData(tenantId, rtoCode, undefined);
  const spike = useTasIntakeSpike(stageInstanceId);

  const fetchedAt = tga.summary?.fetched_at ?? null;
  const sourceLabel = fetchedAt ? `TGA, last synced ${format(new Date(fetchedAt), 'd MMM yyyy')}` : 'TGA, last synced: unknown';
  const chosen = tga.qualifications.find((q) => q.qualification_code === selected) ?? null;
  const submitted = spike.intake?.status === 'submitted';

  if (spike.loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <Card className="m-4 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          TAS intake
          <Badge variant="outline">spike, QA only</Badge>
          {spike.intake && <Badge variant="secondary">{submitted ? 'submitted' : 'in progress'}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {spike.error && (
          <Alert variant="destructive">
            <AlertDescription>{spike.conflict ? 'Someone else changed this intake. It has been reloaded; review and try again.' : spike.error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1">
          <Label htmlFor="tas-q1">Which training product are we planning?</Label>
          {spike.answer ? (
            <p data-testid="tas-answer">
              {spike.answer.value?.code} {spike.answer.value?.title ?? ''}
              <span className="ml-2 text-muted-foreground">
                ({spike.answer.source_type}
                {spike.answer.source_checked_at ? `, checked ${format(new Date(spike.answer.source_checked_at), 'd MMM yyyy')}` : ', checked: unknown'})
              </span>
            </p>
          ) : (
            <select
              id="tas-q1"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={selected}
              disabled={submitted}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select from this client&apos;s scope…</option>
              {tga.qualifications.map((q) => (
                <option key={q.id} value={q.qualification_code}>
                  {q.qualification_code} {q.qualification_title ?? ''}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground" data-testid="tas-source">Source: {sourceLabel}</p>
        </div>

        <div className="flex gap-2">
          {!spike.intake && (
            <Button size="sm" disabled={!chosen || spike.busy} onClick={() => chosen && spike.start(chosen.qualification_code, { source: 'tga', fetched_at: fetchedAt })}>
              Start intake
            </Button>
          )}
          {spike.intake && !submitted && !spike.answer && (
            <Button size="sm" disabled={!chosen || spike.busy} onClick={() => chosen && spike.save({ code: chosen.qualification_code, title: chosen.qualification_title, sourceCheckedAt: fetchedAt })}>
              Save answer
            </Button>
          )}
          {spike.intake && !submitted && spike.answer && (
            <Button size="sm" disabled={spike.busy} onClick={() => spike.submit()}>
              Submit for review
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
