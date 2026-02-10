import { useState } from 'react';
import { format } from 'date-fns';
import {
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Calendar,
  FileText,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useAddinFeatureFlags } from '@/hooks/useAddinFeatureFlags';
import { useAuth } from '@/hooks/useAuth';

// Microsoft logo SVG as inline component
function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/**
 * MicrosoftAccountCard - Identity-based Microsoft integration.
 * 
 * Replaces the old OutlookIntegration calendar-only card.
 * Users connect their Microsoft identity once; admins control which
 * surfaces (Mail, Calendar, Documents) are active via Add-in Settings.
 */
export function MicrosoftAccountCard() {
  const { profile } = useAuth();
  const {
    connectionStatus,
    isLoading: isConnectionLoading,
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

  const { flags, isLoading: isFlagsLoading } = useAddinFeatureFlags();

  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  // Only show for Vivacity Team users
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  if (!isVivacityTeam) {
    return null;
  }

  const isLoading = isConnectionLoading || isFlagsLoading;
  const masterEnabled = flags.microsoft_addin_enabled;

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

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
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

  // Enabled features derived from admin flags
  const enabledFeatures = [
    { key: 'mail', label: 'Outlook Mail', icon: Mail, enabled: flags.addin_outlook_mail_enabled },
    { key: 'calendar', label: 'Calendar', icon: Calendar, enabled: flags.addin_meetings_enabled },
    { key: 'documents', label: 'Documents', icon: FileText, enabled: flags.addin_documents_enabled },
  ];

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MicrosoftLogo className="h-5 w-5" />
                Microsoft Account
              </CardTitle>
              <CardDescription className="mt-1">
                Connect your Microsoft account once to enable Outlook, Calendar, and Documents.
              </CardDescription>
            </div>
            <ConnectionStatusBadge
              isConnected={isConnected}
              hasError={hasError}
              isExpired={isExpired}
              masterEnabled={masterEnabled}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Admin disabled banner */}
          {!masterEnabled && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Microsoft integration is currently disabled by your administrator.
                Contact a Super Admin to enable it.
              </AlertDescription>
            </Alert>
          )}

          {/* Connection Status Details */}
          {connectionStatus && masterEnabled && (
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

          {/* Action Buttons - only show when master is enabled */}
          {masterEnabled && (
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
                    <MicrosoftLogo className="h-4 w-4 mr-2" />
                  )}
                  Connect Microsoft
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
                    onClick={() => refetch()}
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
          )}

          {/* Enabled Features - read-only, derived from admin flags */}
          {masterEnabled && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Enabled Features
              </p>
              <div className="flex flex-wrap gap-2">
                {enabledFeatures.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
                        feature.enabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{feature.label}</span>
                      {feature.enabled ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <span className="text-xs opacity-60">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Feature availability is managed by your administrator.
              </p>
            </div>
          )}

          {/* Info Text */}
          <p className="text-xs text-muted-foreground">
            Your Microsoft connection is private. Only you can see and manage this connection.
          </p>
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Microsoft Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your Microsoft connection and disable all synced data
              (calendar events, linked emails, and documents). You can reconnect at any time.
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
  isExpired,
  masterEnabled,
}: {
  isConnected: boolean;
  hasError: boolean;
  isExpired: boolean;
  masterEnabled: boolean;
}) {
  if (!masterEnabled) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <ShieldAlert className="h-3 w-3" />
        Disabled
      </Badge>
    );
  }

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
