import { format } from 'date-fns';
import {
  Video, FileText, File, ExternalLink, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Loader2, Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MeetingArtifact, SyncResult } from '@/hooks/useMeetingArtifacts';

interface MeetingArtifactsListProps {
  artifacts: MeetingArtifact[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  onSync: () => void;
  onShareToggle?: (artifactId: string, share: boolean) => void;
  isSharingArtifact?: boolean;
  meetingMsSyncStatus?: string | null;
  meetingMsSyncError?: string | null;
  meetingMsLastSyncedAt?: string | null;
}

const artifactIcons: Record<string, typeof Video> = {
  recording: Video,
  transcript: FileText,
  shared_file: File,
};

const artifactLabels: Record<string, string> = {
  recording: 'Recording',
  transcript: 'Transcript',
  shared_file: 'Shared File',
};

export function MeetingArtifactsList({
  artifacts,
  isLoading,
  isSyncing,
  lastSyncResult,
  onSync,
  onShareToggle,
  isSharingArtifact,
  meetingMsSyncStatus,
  meetingMsSyncError,
  meetingMsLastSyncedAt,
}: MeetingArtifactsListProps) {
  return (
    <div className="space-y-4">
      {/* Sync button and status */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync Microsoft artifacts
        </Button>

        {meetingMsLastSyncedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last synced {format(new Date(meetingMsLastSyncedAt), 'MMM d, HH:mm')}
          </div>
        )}
      </div>

      {/* Sync status */}
      {meetingMsSyncStatus === 'error' && meetingMsSyncError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{meetingMsSyncError}</AlertDescription>
        </Alert>
      )}

      {/* Last sync result */}
      {lastSyncResult && !isSyncing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastSyncResult.errors?.length > 0 ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          )}
          <span>
            {lastSyncResult.artifacts_found} artifact{lastSyncResult.artifacts_found !== 1 ? 's' : ''} found,{' '}
            {lastSyncResult.artifacts_created} saved
            {lastSyncResult.errors?.length > 0 && `, ${lastSyncResult.errors.length} error(s)`}
          </span>
        </div>
      )}

      <Separator />

      {/* Artifacts list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading artifacts...</div>
      ) : artifacts.length === 0 ? (
        <div className="text-center py-6">
          <File className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No artifacts captured yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Sync Microsoft artifacts" to discover recordings, transcripts, and shared files.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {artifacts.map((artifact) => {
            const Icon = artifactIcons[artifact.artifact_type] || File;
            const label = artifactLabels[artifact.artifact_type] || artifact.artifact_type;
            const isShared = artifact.visibility === 'client';

            return (
              <div
                key={artifact.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="p-1.5 rounded-md bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{artifact.title}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {label}
                    </Badge>
                    {isShared && (
                      <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                        <Share2 className="h-3 w-3" />
                        Shared
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Captured {format(new Date(artifact.captured_at), 'MMM d, yyyy HH:mm')}
                    {artifact.shared_at && (
                      <> · Shared {format(new Date(artifact.shared_at), 'MMM d, yyyy')}</>
                    )}
                  </div>
                </div>

                {/* Share toggle - only shown when onShareToggle is provided (Vivacity team) */}
                {onShareToggle && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`share-${artifact.id}`} className="text-xs text-muted-foreground">
                      Share
                    </Label>
                    <Switch
                      id={`share-${artifact.id}`}
                      checked={isShared}
                      onCheckedChange={(checked) => onShareToggle(artifact.id, checked)}
                      disabled={isSharingArtifact}
                    />
                  </div>
                )}

                {artifact.web_url && (
                  <a
                    href={artifact.web_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
