import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Users, ChevronRight } from 'lucide-react';
import { useEosConfigurations } from '@/hooks/useEosConfigurations';
import type { ConfigMeetingType } from '@/types/eos';

const MEETING_TYPES: { type: ConfigMeetingType; label: string }[] = [
  { type: 'L10', label: 'Level 10' },
  { type: 'Quarterly', label: 'Quarterly' },
  { type: 'Annual', label: 'Annual' },
  { type: 'Same_Page', label: 'Same Page' },
];

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  on_demand: 'On demand',
};

export function EosConfigurationsList() {
  const navigate = useNavigate();
  const { configurations, isLoading } = useEosConfigurations();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {MEETING_TYPES.map((m) => (
          <Skeleton key={m.type} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {MEETING_TYPES.map(({ type, label }) => {
        const config = configurations?.find((c) => c.meeting_type === type);
        return (
          <Card
            key={type}
            className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
            onClick={() => config && navigate(`/eos/configurations/${config.id}`)}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>
                  {config ? FREQUENCY_LABEL[config.frequency] : 'Not configured'}
                </CardDescription>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {FREQUENCY_LABEL[config.frequency]}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {config.participant_model === 'whole_roster' ? 'Whole roster' : 'Required seats'}
                  </Badge>
                  {!config.facilitator_seat_id && (
                    <Badge variant="outline" className="text-xs border-amber-500/30 bg-amber-500/10 text-amber-600">
                      <Clock className="h-3 w-3 mr-1" />
                      No facilitator seat set
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Configuration exists yet for this type.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
