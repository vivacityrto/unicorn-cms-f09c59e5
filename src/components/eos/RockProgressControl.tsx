import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useEosRocks, useEosIssues } from '@/hooks/useEos';
import { getStatusOptions, dbToUiStatus, uiToDbStatus } from '@/utils/rockStatusUtils';
import type { EosRock } from '@/types/eos';

interface RockProgressControlProps {
  rock: EosRock;
  compact?: boolean;
}

const statusOptions = getStatusOptions();

export function RockProgressControl({ rock, compact = false }: RockProgressControlProps) {
  const { updateRock } = useEosRocks();
  const { createIssue } = useEosIssues();
  const [status, setStatus] = useState(rock.status);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    await updateRock.mutateAsync({
      id: rock.id,
      status: newStatus,
      completed_date: dbToUiStatus(newStatus) === 'complete' ? new Date().toISOString() : null,
    });
  };

  const handleDropToIssue = async () => {
    await createIssue.mutateAsync({
      title: `Rock issue: ${rock.title}`,
      description: rock.description || `Issue from rock: ${rock.title}`,
      status: 'Open',
      priority: (rock.priority || 2) as any,
      client_id: rock.client_id ? String(rock.client_id) : undefined,
    });
  };

  const isOffTrack = dbToUiStatus(status) === 'off_track';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isOffTrack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDropToIssue}
            disabled={createIssue.isPending}
          >
            <AlertTriangle className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">Status</label>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isOffTrack && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDropToIssue}
          disabled={createIssue.isPending}
          className="w-full"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Convert to Issue
        </Button>
      )}
    </div>
  );
}
