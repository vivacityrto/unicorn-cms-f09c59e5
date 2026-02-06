import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Mail, 
  Calendar, 
  AlertCircle, 
  User, 
  CheckCircle2,
  Monitor,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAddinContext } from '@/hooks/useAddinContext';
import { useAddinSession } from '@/hooks/useAddinSession';
import { useAuth } from '@/hooks/useAuth';
import { MailPanel } from '@/components/addin/MailPanel';
import { MeetingPanel } from '@/components/addin/MeetingPanel';
import type { AddinUser } from '@/lib/addin/types';

interface AddinShellProps {
  /** Embed mode: 'outlook' for Outlook add-in, 'teams' for Teams tab */
  embedMode?: 'outlook' | 'teams';
  /** View mode: 'default' shows all panels, 'meeting' shows meeting panel only */
  viewMode?: 'default' | 'meeting';
}

export default function AddinShell({ embedMode = 'outlook', viewMode: propViewMode }: AddinShellProps) {
  const [searchParams] = useSearchParams();
  
  // Support mode from props (TeamsShell) or query param (?mode=meeting)
  const queryMode = searchParams.get('mode');
  const viewMode = propViewMode || (queryMode === 'meeting' ? 'meeting' : 'default');
  
  // In meeting mode, hide mail actions
  const showMailPanel = viewMode !== 'meeting';
  const showMeetingPanel = true; // Always show meeting panel when context available
  
  const isTeamsEmbed = embedMode === 'teams';
  const { user: authUser, session: authSession } = useAuth();
  const isAuthAuthenticated = !!authSession;
  
  const { 
    surface, 
    mailContext, 
    meetingContext, 
    isLoading: isContextLoading, 
    error: contextError,
    isOffice,
    hasContext,
    getSurfaceLabel,
    refreshContext
  } = useAddinContext();
  
  const {
    session: addinSession,
    user: addinUser,
    features,
    isLoading: isSessionLoading,
    isAuthenticated: isAddinAuthenticated,
  } = useAddinSession();

  // Determine which user to display
  const displayUser: AddinUser | null = addinUser || (authUser ? {
    user_uuid: authUser.id,
    email: authUser.email || '',
    first_name: (authUser.user_metadata?.first_name as string) || null,
    last_name: (authUser.user_metadata?.last_name as string) || null,
    unicorn_role: 'User',
  } : null);

  // Get tenant ID for lookups
  const tenantId = addinSession?.user ? (addinSession as { tenant_id?: number }).tenant_id : null;

  const isLoading = isContextLoading || isSessionLoading;
  const isConnected = isAddinAuthenticated || isAuthAuthenticated;

  // Log when page loads for debugging
  useEffect(() => {
    console.log('[AddinShell] Mounted', {
      isOffice,
      surface,
      hasContext,
      isConnected,
      embedMode,
      viewMode,
    });
  }, [isOffice, surface, hasContext, isConnected, embedMode, viewMode]);

  const getContextIcon = () => {
    if (surface === 'outlook_mail') return <Mail className="h-5 w-5" />;
    if (surface === 'outlook_calendar' || surface === 'teams_meeting') return <Calendar className="h-5 w-5" />;
    return <Monitor className="h-5 w-5" />;
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header with Unicorn branding */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">U</span>
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-none">Unicorn</h1>
              <p className="text-xs text-muted-foreground">
                {isTeamsEmbed ? 'Teams' : 'Add-in'}
              </p>
            </div>
          </div>
          <Badge variant={isOffice ? "default" : "secondary"}>
            {getSurfaceLabel(surface)}
          </Badge>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Connection Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {isConnected ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : isConnected && displayUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Connected as {displayUser.first_name} {displayUser.last_name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {displayUser.email}
                </p>
                {displayUser.unicorn_role && (
                  <Badge variant="outline" className="text-xs">
                    {displayUser.unicorn_role}
                  </Badge>
                )}
              </div>
            ) : (
              <Alert variant="default">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Not connected. Please sign in to Unicorn.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Mail Panel - show when mail context is detected and not in meeting mode */}
        {showMailPanel && mailContext && isConnected && (
          <MailPanel 
            mailContext={mailContext}
            user={displayUser}
            tenantId={tenantId}
          />
        )}

        {/* Meeting Panel - show when meeting context is detected */}
        {showMeetingPanel && meetingContext && isConnected && tenantId && (
          <MeetingPanel 
            meetingContext={meetingContext}
            tenantId={tenantId}
          />
        )}

        {/* Context Status - show when no mail or meeting context */}
        {!mailContext && !meetingContext && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {getContextIcon()}
                  Office Context
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={refreshContext}
                  disabled={isContextLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isContextLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isContextLoading ? (
                <Skeleton className="h-4 w-48" />
              ) : contextError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{contextError}</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Context not detected yet
                  </p>
                  
                  {!isOffice && (
                    <Alert>
                      <Monitor className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Running in browser mode. Open this page inside Outlook or Teams to detect context.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Feature Flags (for debugging) */}
        {features && (
          <>
            <Separator />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Enabled Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {features.addin_outlook_mail_enabled && (
                    <Badge variant="secondary" className="text-xs">
                      <Mail className="h-3 w-3 mr-1" /> Mail
                    </Badge>
                  )}
                  {features.addin_meetings_enabled && (
                    <Badge variant="secondary" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" /> Meetings
                    </Badge>
                  )}
                  {features.addin_documents_enabled && (
                    <Badge variant="secondary" className="text-xs">
                      Documents
                    </Badge>
                  )}
                  {!features.microsoft_addin_enabled && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Add-in Disabled
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-card px-4 py-2">
        <p className="text-xs text-center text-muted-foreground">
          Unicorn Add-in • Vivacity Coaching & Consulting
        </p>
      </footer>
    </div>
  );
}
