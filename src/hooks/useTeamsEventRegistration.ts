import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isBatchRunning } from '@/lib/teamsEvents/format';
import { teamsEventsService, type TeamsEventType } from '@/services/teamsEventsService';

const POLL_MS = 2000;

/**
 * Upcoming Teams events (now → +14 days). Teams stays the source of truth, so
 * nothing is cached: every open of the modal and every Refresh asks Graph again.
 */
export function useTeamsEventsList(enabled: boolean, eventType: TeamsEventType = 'webinar') {
  return useQuery({
    queryKey: ['teams-events', 'list', eventType],
    queryFn: () => teamsEventsService.listEvents(eventType),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function usePreviewTeamsEventGroup() {
  return useMutation({
    mutationFn: ({ eventId, groupId }: { eventId: string; groupId: number }) =>
      teamsEventsService.previewGroup(eventId, groupId),
  });
}

export function useRegisterTeamsEventGroup() {
  return useMutation({
    mutationFn: ({ eventId, groupId, previewToken }: { eventId: string; groupId: number; previewToken: string }) =>
      teamsEventsService.registerGroup(eventId, groupId, previewToken),
  });
}

/** Progress/results for one batch; polls until it settles. Survives a page refresh. */
export function useTeamsEventBatch(batchId: string | null) {
  return useQuery({
    queryKey: ['teams-events', 'batch', batchId],
    queryFn: () => teamsEventsService.getBatch(batchId as string),
    enabled: !!batchId,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (isBatchRunning(query.state.data?.batch.status) ? POLL_MS : false),
  });
}

export function useRetryTeamsEventFailures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => teamsEventsService.retryFailures(batchId),
    onSuccess: (_data, batchId) => {
      queryClient.invalidateQueries({ queryKey: ['teams-events', 'batch', batchId] });
    },
  });
}
