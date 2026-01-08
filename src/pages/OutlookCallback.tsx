import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function OutlookCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(`Authentication failed: ${searchParams.get('error_description') || error}`);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authentication parameters');
        return;
      }

      // Verify state matches
      const savedState = localStorage.getItem('outlook_oauth_state');
      const redirectUri = localStorage.getItem('outlook_oauth_redirect');

      if (state !== savedState) {
        setStatus('error');
        setMessage('Invalid state parameter - possible CSRF attack');
        return;
      }

      try {
        // Exchange code for tokens
        const { data, error: exchangeError } = await supabase.functions.invoke(
          'outlook-auth?action=exchange-code',
          {
            body: { code, redirect_uri: redirectUri, state }
          }
        );

        if (exchangeError || !data?.success) {
          throw new Error(exchangeError?.message || 'Token exchange failed');
        }

        // Clean up localStorage
        localStorage.removeItem('outlook_oauth_state');
        localStorage.removeItem('outlook_oauth_redirect');

        setStatus('success');
        setMessage('Successfully connected to Outlook!');

        // Trigger initial sync
        await supabase.functions.invoke('sync-outlook-calendar', {});

        // Redirect to time capture page
        setTimeout(() => {
          navigate('/calendar/time-capture');
        }, 1500);

      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === 'processing' && (
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
        )}
        {status === 'success' && (
          <div className="h-12 w-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status === 'error' && (
          <div className="h-12 w-12 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <p className="text-lg font-medium">{message}</p>
        {status === 'error' && (
          <button 
            onClick={() => navigate('/calendar/time-capture')}
            className="text-primary hover:underline"
          >
            Return to Time Capture
          </button>
        )}
      </div>
    </div>
  );
}
