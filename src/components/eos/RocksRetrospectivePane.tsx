import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { EosRock } from '@/types/eos';

interface RocksRetrospectivePaneProps {
  rocks: EosRock[];
  meetingType: 'Quarterly' | 'Annual';
}

export const RocksRetrospectivePane = ({ rocks, meetingType }: RocksRetrospectivePaneProps) => {
  const [learnings, setLearnings] = useState<Record<string, string>>({});

  const period = meetingType === 'Quarterly' ? 'Quarter' : 'Year';

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    if (status === 'complete') return 'default';
    if (status === 'on_track') return 'secondary';
    if (status === 'off_track') return 'destructive';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Rock {period}-End Retrospective</h3>
        <p className="text-sm text-muted-foreground">
          Review rocks from the past {period.toLowerCase()}, capture learnings and celebrate wins.
        </p>
      </div>

      <div className="grid gap-4">
        {rocks.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">No rocks found for this {period.toLowerCase()}.</p>
            </CardContent>
          </Card>
        ) : (
          rocks.map((rock) => (
            <Card key={rock.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-base">{rock.title}</CardTitle>
                    {rock.description && (
                      <CardDescription>{rock.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant={getStatusVariant(rock.status)}>
                    {rock.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Progress:</span>
                    <span className="ml-2 font-medium">{rock.progress || 0}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due:</span>
                    <span className="ml-2 font-medium">
                      {new Date(rock.due_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Learnings & Notes</label>
                  <Textarea
                    placeholder="What did we learn? What would we do differently?"
                    value={learnings[rock.id] || ''}
                    onChange={(e) => setLearnings({ ...learnings, [rock.id]: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {rocks.length > 0 && (
        <Button className="w-full">Save All Learnings</Button>
      )}
    </div>
  );
};
