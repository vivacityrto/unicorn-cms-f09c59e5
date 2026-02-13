import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, TrendingDown, CheckCircle, Mountain } from 'lucide-react';
import { RockProgressControl } from '@/components/eos/RockProgressControl';

// Use the database type directly
interface Rock {
  id: string;
  title: string;
  description?: string | null;
  status: string | null;
  completion_percentage?: number | null;
  issue?: string | null;
  outcome?: string | null;
  milestones?: any;
  client_id?: number | null;
  owner_id?: string | null;
  due_date: string;
  quarter_number: number;
  quarter_year: number;
}

interface QuarterlyRocksSectionProps {
  rocks: Rock[] | undefined;
  isLoading: boolean;
  quarter: number;
  year: number;
}

export function QuarterlyRocksSection({ rocks, isLoading, quarter, year }: QuarterlyRocksSectionProps) {
  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      on_track: { variant: 'default', icon: TrendingUp, label: 'On Track' },
      'on-track': { variant: 'default', icon: TrendingUp, label: 'On Track' },
      off_track: { variant: 'destructive', icon: TrendingDown, label: 'Off Track' },
      'off-track': { variant: 'destructive', icon: TrendingDown, label: 'Off Track' },
      complete: { variant: 'secondary', icon: CheckCircle, label: 'Complete' },
    };
    
    const config = variants[statusLower] || variants.on_track;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mountain className="h-5 w-5 text-primary" />
          <CardTitle>Quarterly Rocks</CardTitle>
        </div>
        <CardDescription>
          90-day goals for Q{quarter} {year}. Edits sync with Rock Builder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!rocks || rocks.length === 0 ? (
          <div className="text-center py-8">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No rocks assigned to Q{quarter} {year}.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Create rocks in Rock Builder with this quarter selected.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rocks.map((rock, index) => (
              <Card key={rock.id} className="border-2">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-primary">ROCK {index + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {rock.completion_percentage || 0}%
                      </span>
                    </div>
                  </div>
                  <CardTitle className="text-base">{rock.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Issue/Problem */}
                  {rock.issue && (
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Issue</p>
                      <p className="text-sm">{rock.issue}</p>
                    </div>
                  )}

                  {/* Outcome */}
                  {rock.outcome && (
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground mb-1">The problem this solves</p>
                      <p className="text-sm">{rock.outcome}</p>
                    </div>
                  )}

                  {/* Status and Progress */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    {getStatusBadge(rock.status || 'on_track')}
                    <RockProgressControl rock={rock as any} compact />
                  </div>

                  {/* Milestones Preview */}
                  {rock.milestones && Array.isArray(rock.milestones) && rock.milestones.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Milestones</p>
                      <div className="space-y-1">
                        {(rock.milestones as any[]).slice(0, 3).map((milestone: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{i + 1}.</span>
                            <span className={milestone.completed ? 'line-through text-muted-foreground' : ''}>
                             {milestone.text || milestone.title || (typeof milestone === 'string' ? milestone : '')}
                            </span>
                          </div>
                        ))}
                        {(rock.milestones as any[]).length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{(rock.milestones as any[]).length - 3} more...
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
