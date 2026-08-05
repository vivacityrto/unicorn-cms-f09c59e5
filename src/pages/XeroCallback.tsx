import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type CallbackStatus = 'processing' | 'exchanging' | 'success' | 'error';

export default function XeroCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      const savedRedirectUri = localStorage.getItem('xero_oauth_redirect');

      if (error) {
        setStatus('error');
        setMessage(`Xero returned an error: ${errorDescription || error}`);
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('No authorization code received from Xero');
        return;
      }

      if (!state) {
        setStatus('error');
        setMessage('No state parameter received - possible security issue');
        return;
      }

      setStatus('exchanging');
      setMessage('Connecting to Xero...');

      const redirectUri = savedRedirectUri || `${window.location.origin}/admin/integrations/xero-callback`;

      try {
        const { data, error: exchangeError } = await supabase.functions.invoke('xero-auth', {
          body: { action: 'exchange-code', code, redirect_uri: redirectUri, state },
        });

        if (exchangeError) {
          throw new Error(exchangeError.message || 'Token exchange failed');
        }
        if (!data?.success) {
          throw new Error(data?.error || 'Token exchange failed');
        }

        localStorage.removeItem('xero_oauth_state');
        localStorage.removeItem('xero_oauth_redirect');

        setStatus('success');
        setMessage(
          data.organisation_name
            ? `Connected to ${data.organisation_name}!`
            : 'Successfully connected to Xero!'
        );

        setTimeout(() => navigate('/admin/integrations/xero'), 2000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
      case 'exchanging':
        return <Loader2 className="h-12 w-12 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case 'error':
        return <XCircle className="h-12 w-12 text-red-500" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">{getStatusIcon()}</div>
          <CardTitle>
            {status === 'success' ? 'Connected!' : status === 'error' ? 'Connection Failed' : 'Connecting to Xero'}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        {status === 'error' && (
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/admin/integrations/xero')}
            >
              Back to Integrations
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
