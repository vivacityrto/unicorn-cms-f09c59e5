import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Receipt, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useXeroConnectionStatus } from '@/hooks/useXeroConnectionStatus';
import { format } from 'date-fns';

export default function AdminXeroIntegration() {
  const {
    connectionStatus,
    isLoading,
    connect,
    disconnect,
    isConnecting,
    isDisconnecting,
  } = useXeroConnectionStatus();

  const isConnected = !!connectionStatus?.connected && !connectionStatus.is_expired;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Xero Integration"
        description="Shared connection to Vivacity's Xero organisation for invoice status lookups"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Xero Connection
              </CardTitle>
              <CardDescription className="mt-1">
                One connection shared across all Vivacity staff - only Super Admins can connect or disconnect it.
              </CardDescription>
            </div>
            {!isLoading && (
              <Badge variant={isConnected ? 'default' : 'secondary'} className="flex items-center gap-1">
                {isConnected ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {isConnected ? 'Connected' : connectionStatus?.is_expired ? 'Expired' : 'Not connected'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking connection status...
            </div>
          ) : (
            <>
              {connectionStatus?.organisation_name && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Organisation</span>
                  <span className="font-medium">{connectionStatus.organisation_name}</span>
                </div>
              )}
              {connectionStatus?.expires_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Token expires</span>
                  <span className="font-medium">
                    {format(new Date(connectionStatus.expires_at), 'dd MMM yyyy, h:mm a')}
                  </span>
                </div>
              )}
              {connectionStatus?.last_error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {connectionStatus.last_error}
                </div>
              )}

              <div className="flex justify-end">
                {isConnected ? (
                  <Button
                    variant="outline"
                    onClick={() => disconnect()}
                    isLoading={isDisconnecting}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button onClick={() => connect()} isLoading={isConnecting}>
                    Connect to Xero
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
