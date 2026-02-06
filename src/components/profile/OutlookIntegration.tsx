import { useState } from 'react';
import { format } from 'date-fns';
import { 
  Calendar, 
  Link2, 
  Unlink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOutlookConnectionStatus } from '@/hooks/useOutlookConnectionStatus';
import { useAuth } from '@/hooks/useAuth';

/**
 * OutlookIntegration component for Profile Settings.
 * Allows each Vivacity Team user to connect their own Microsoft Outlook calendar.
 * Ensures strict per-user data isolation - users only see their own connection.
 */
export function OutlookIntegration() {
  const { profile } = useAuth();
  const {
    connectionStatus,
    isLoading,
    isConnected,
    hasError,
    isExpired,
    connect,
    disconnect,
    sync,
    refetch,
    isConnecting,
    isDisconnecting,
    isSyncing,
  } = useOutlookConnectionStatus();

  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  // Only show for Vivacity Team users (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');

  if (!isVivacityTeam) {
    return null;
  }

  const handleConnect = async () => {
    try {
      const result = await connect();
      if (result && 'openedInNewTab' in result) {
        if (!result.openedInNewTab && result.authUrl) {
          setPopupBlocked(true);
          setAuthUrl(result.authUrl);
        }
      }
    } catch (error) {
      console.error('Connect error:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setShowDisconnectDialog(false);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const handleSync = async () => {
    try {
      await sync();
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  const handleRefreshStatus = async () => {
    await refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Microsoft Outlook Calendar
              </CardTitle>
              <CardDescription className="mt-1">
                Connect your Outlook calendar to capture time from meetings
              </CardDescription>
            </div>
            <ConnectionStatusBadge 
              isConnected={isConnected} 
              hasError={hasError} 
              isExpired={isExpired} 
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status Details */}
          {connectionStatus && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              {connectionStatus.account_email && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Connected as:</span>
                  <span className="font-medium">{connectionStatus.account_email}</span>
                </div>
              )}
              {connectionStatus.last_synced_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last synced:</span>
                  <span>{format(new Date(connectionStatus.last_synced_at), 'PPp')}</span>
                </div>
              )}
              {connectionStatus.last_error && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{connectionStatus.last_error}</span>
                </div>
              )}
            </div>
          )}

          {/* Popup Blocked Warning */}
          {popupBlocked && authUrl && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
              <p className="text-sm text-warning-foreground mb-2">
                Popup was blocked. Click below to open the Microsoft login page:
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(authUrl, '_blank');
                  setPopupBlocked(false);
                  setAuthUrl(null);
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Microsoft Login
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!isConnected ? (
              <Button 
                onClick={handleConnect} 
                disabled={isConnecting}
                className="flex-1 sm:flex-none"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect Outlook
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleSync} 
                  disabled={isSyncing}
                  variant="default"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                <Button 
                  onClick={handleRefreshStatus}
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
                <Button 
                  onClick={() => setShowDisconnectDialog(true)}
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </>
            )}

            {(hasError || isExpired) && isConnected && (
              <Button 
                onClick={handleConnect} 
                disabled={isConnecting}
                variant="secondary"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Reconnect
              </Button>
            )}
          </div>

          {/* Info Text */}
          <p className="text-xs text-muted-foreground">
            Your calendar connection is private. Only you can see and manage your calendar events.
          </p>
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Outlook Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your Outlook connection and delete all synced calendar events.
              You can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ConnectionStatusBadge({ 
  isConnected, 
  hasError, 
  isExpired 
}: { 
  isConnected: boolean; 
  hasError: boolean; 
  isExpired: boolean;
}) {
  if (hasError) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1 bg-warning/20 text-warning-foreground">
        <AlertCircle className="h-3 w-3" />
        Expired
      </Badge>
    );
  }

  if (isConnected) {
    return (
      <Badge variant="default" className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      Not Connected
    </Badge>
  );
}
