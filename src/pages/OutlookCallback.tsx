import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type CallbackStatus = 'processing' | 'waiting-session' | 'exchanging' | 'syncing' | 'success' | 'error';

interface DiagnosticInfo {
  hasCode: boolean;
  hasState: boolean;
  hasError: string | null;
  savedState: string | null;
  stateMatch: boolean;
  sessionAvailable: boolean;
  exchangeAttempted: boolean;
  exchangeResult: string | null;
}

export default function OutlookCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    hasCode: false,
    hasState: false,
    hasError: null,
    savedState: null,
    stateMatch: false,
    sessionAvailable: false,
    exchangeAttempted: false,
    exchangeResult: null
  });

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Get stored state from localStorage
      const savedState = localStorage.getItem('outlook_oauth_state');
      const savedRedirectUri = localStorage.getItem('outlook_oauth_redirect');

      console.log('=== OUTLOOK CALLBACK START ===');
      console.log('[OutlookCallback] Current URL:', window.location.href);
      console.log('[OutlookCallback] Current origin:', window.location.origin);
      console.log('[OutlookCallback] Params received:', {
        hasCode: !!code,
        hasState: !!state,
        state: state?.substring(0, 8) + '...',
        error,
        errorDescription
      });
      console.log('[OutlookCallback] LocalStorage:', {
        savedState: savedState?.substring(0, 8) + '...',
        savedRedirectUri,
        stateMatch: state === savedState
      });

      // Update diagnostics
      setDiagnostics(prev => ({
        ...prev,
        hasCode: !!code,
        hasState: !!state,
        hasError: error,
        savedState: savedState?.substring(0, 8) + '...' || null,
        stateMatch: state === savedState
      }));

      // Handle Microsoft error
      if (error) {
        console.error('[OutlookCallback] OAuth error from Microsoft:', error, errorDescription);
        setStatus('error');
        setMessage(`Microsoft returned an error: ${errorDescription || error}`);
        return;
      }

      // Check required params
      if (!code) {
        console.error('[OutlookCallback] Missing authorization code');
        setStatus('error');
        setMessage('No authorization code received from Microsoft');
        return;
      }

      if (!state) {
        console.error('[OutlookCallback] Missing state parameter');
        setStatus('error');
        setMessage('No state parameter received - possible security issue');
        return;
      }

      // State validation - check localStorage first, but we'll also validate on server
      if (savedState && state !== savedState) {
        console.warn('[OutlookCallback] State mismatch (localStorage):', {
          received: state?.substring(0, 8),
          saved: savedState?.substring(0, 8)
        });
        // Don't fail immediately - server has the canonical state
        // This can happen if user is on a different domain than where they started
      }

      // Wait for Supabase session
      setStatus('waiting-session');
      setMessage('Waiting for session...');
      
      console.log('[OutlookCallback] Waiting for Supabase session...');
      
      let session = null;
      let retries = 0;
      const maxRetries = 10; // Increased retries

      while (!session && retries < maxRetries) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        session = data.session;
        
        if (sessionError) {
          console.error('[OutlookCallback] Session error:', sessionError);
        }
        
        if (!session) {
          console.log(`[OutlookCallback] Session not ready, retry ${retries + 1}/${maxRetries}`);
          await new Promise(r => setTimeout(r, 500));
          retries++;
        }
      }

      setDiagnostics(prev => ({ ...prev, sessionAvailable: !!session }));

      if (!session) {
        console.error('[OutlookCallback] No session after retries');
        setStatus('error');
        setMessage('Your session has expired. Please log in again and try connecting.');
        return;
      }

      console.log('[OutlookCallback] Session available:', {
        userId: session.user.id,
        email: session.user.email
      });

      // Exchange code for tokens
      setStatus('exchanging');
      setMessage('Exchanging authorization code...');

      // Use the current origin as redirect URI if we don't have a saved one
      // This handles the case where localStorage was cleared or user is on different domain
      const redirectUri = savedRedirectUri || `${window.location.origin}/calendar/outlook-callback`;

      console.log('[OutlookCallback] Calling exchange-code with:', {
        codeLength: code.length,
        state: state.substring(0, 8) + '...',
        redirectUri
      });

      setDiagnostics(prev => ({ ...prev, exchangeAttempted: true }));

      try {
        const { data, error: exchangeError } = await supabase.functions.invoke(
          'outlook-auth',
          {
            body: { 
              action: 'exchange-code',
              code, 
              redirect_uri: redirectUri, 
              state 
            }
          }
        );

        console.log('[OutlookCallback] Exchange response:', {
          success: data?.success,
          error: exchangeError?.message || data?.error
        });

        setDiagnostics(prev => ({ 
          ...prev, 
          exchangeResult: data?.success ? 'success' : (exchangeError?.message || data?.error || 'unknown error')
        }));

        if (exchangeError) {
          console.error('[OutlookCallback] Exchange function error:', exchangeError);
          throw new Error(exchangeError.message || 'Token exchange failed');
        }

        if (!data?.success) {
          console.error('[OutlookCallback] Exchange returned error:', data?.error);
          throw new Error(data?.error || 'Token exchange failed');
        }

        // Clean up localStorage
        localStorage.removeItem('outlook_oauth_state');
        localStorage.removeItem('outlook_oauth_redirect');

        // Trigger initial sync
        setStatus('syncing');
        setMessage('Syncing your calendar...');

        console.log('[OutlookCallback] Exchange successful, triggering sync...');

        try {
          const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-outlook-calendar', {});
          console.log('[OutlookCallback] Sync result:', { synced: syncData?.synced, error: syncError?.message });
        } catch (syncErr) {
          console.warn('[OutlookCallback] Initial sync failed (non-fatal):', syncErr);
          // Don't fail the whole flow for sync errors
        }

        setStatus('success');
        setMessage('Successfully connected to Outlook!');

        console.log('[OutlookCallback] SUCCESS - redirecting to time capture');

        // Redirect to time capture page
        setTimeout(() => {
          navigate('/calendar/time-capture');
        }, 2000);

      } catch (err) {
        console.error('[OutlookCallback] Exchange error:', err);
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
      case 'waiting-session':
      case 'exchanging':
      case 'syncing':
        return <Loader2 className="h-12 w-12 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case 'error':
        return <XCircle className="h-12 w-12 text-red-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'waiting-session':
        return 'Restoring your session...';
      case 'exchanging':
        return 'Connecting to Outlook...';
      case 'syncing':
        return 'Syncing calendar events...';
      default:
        return message;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">{getStatusIcon()}</div>
          <CardTitle>
            {status === 'success' ? 'Connected!' : status === 'error' ? 'Connection Failed' : 'Connecting to Outlook'}
          </CardTitle>
          <CardDescription>{getStatusMessage()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'error' && (
            <>
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm space-y-1">
                <p className="font-medium text-destructive">Error Details:</p>
                <p className="text-muted-foreground">{message}</p>
              </div>
              
              {/* Diagnostic info for debugging */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Diagnostic Info</summary>
                <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto">
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
              </details>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => navigate('/calendar/time-capture')}
                >
                  Try Again
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex-1"
                  onClick={() => navigate('/dashboard')}
                >
                  Go to Dashboard
                </Button>
              </div>
            </>
          )}

          {status === 'success' && (
            <p className="text-center text-sm text-muted-foreground">
              Redirecting to Time Capture...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
