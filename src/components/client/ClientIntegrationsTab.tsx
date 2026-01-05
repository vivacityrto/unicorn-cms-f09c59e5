import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Link2, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  Unlink,
  Loader2
} from 'lucide-react';
import { ClientProfile, RegistryLink } from '@/hooks/useClientManagement';

interface ClientIntegrationsTabProps {
  profile: ClientProfile | null;
  registryLink: RegistryLink | null;
  onSetTgaLink: (rtoNumber: string) => Promise<{ success: boolean; status?: string; autoVerified?: boolean }>;
  onVerifyTgaLink: () => Promise<boolean>;
  onUpdateLink: (status: string) => Promise<boolean>;
  canVerify: boolean;
  loading?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  not_linked: {
    color: 'bg-gray-500/10 text-gray-600 border-gray-500',
    icon: <Unlink className="h-4 w-4" />,
    label: 'Not Linked'
  },
  pending: {
    color: 'bg-amber-500/10 text-amber-600 border-amber-500',
    icon: <Clock className="h-4 w-4" />,
    label: 'Pending'
  },
  linked: {
    color: 'bg-green-500/10 text-green-600 border-green-500',
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Linked'
  },
  error: {
    color: 'bg-red-500/10 text-red-600 border-red-500',
    icon: <AlertCircle className="h-4 w-4" />,
    label: 'Error'
  }
};

export function ClientIntegrationsTab({ 
  profile, 
  registryLink, 
  onSetTgaLink,
  onVerifyTgaLink,
  onUpdateLink,
  canVerify,
  loading 
}: ClientIntegrationsTabProps) {
  const [updating, setUpdating] = useState(false);

  const hasRtoNumber = !!profile?.rto_number;
  const currentStatus = registryLink?.link_status || 'not_linked';
  const statusConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.not_linked;

  // Link to TGA - uses RPC with role-based auto-verification
  const handleLinkToTGA = async () => {
    if (!profile?.rto_number) return;
    setUpdating(true);
    await onSetTgaLink(profile.rto_number);
    setUpdating(false);
  };

  // Manual verification for pending links (Admin-only)
  const handleMarkLinked = async () => {
    setUpdating(true);
    await onVerifyTgaLink();
    setUpdating(false);
  };

  const handleUnlink = async () => {
    setUpdating(true);
    await onUpdateLink('not_linked');
    setUpdating(false);
  };

  const handleSyncNow = async () => {
    setUpdating(true);
    // For now, just show a message that integration is not yet enabled
    await new Promise(resolve => setTimeout(resolve, 1000));
    setUpdating(false);
  };

  return (
    <div className="space-y-6">
      {/* TGA Integration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                Training.gov.au (TGA)
              </CardTitle>
              <CardDescription className="mt-1">
                Link this client to their TGA registration for automatic updates
              </CardDescription>
            </div>
            <Badge 
              variant="outline"
              className={`${statusConfig.color} px-3 py-1`}
            >
              {statusConfig.icon}
              <span className="ml-1">{statusConfig.label}</span>
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* RTO Number Status */}
          {!hasRtoNumber ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>TGA link unavailable</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-2">
                  This client does not have an RTO number configured. TGA linking requires a valid RTO number.
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> KickStart clients may not have an RTO number until they complete 
                  their registration submission. You can set a planned RTO number in the Overview tab once known.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* RTO Number Display */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div>
                  <p className="text-sm text-muted-foreground">RTO Number</p>
                  <p className="text-lg font-semibold">{profile.rto_number}</p>
                </div>
                <a
                  href={`https://training.gov.au/Organisation/Details/${profile.rto_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 text-sm"
                >
                  View on TGA
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              {/* Link Status Actions */}
              {currentStatus === 'not_linked' && (
                <div className="flex gap-2">
                  <Button onClick={handleLinkToTGA} disabled={updating}>
                    {updating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Link to TGA
                  </Button>
                </div>
              )}

              {currentStatus === 'pending' && (
                <div className="space-y-3">
                  <Alert className="border-amber-500/50 bg-amber-500/10">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-600">Link Pending</AlertTitle>
                    <AlertDescription>
                      {canVerify 
                        ? 'TGA link has been initiated. You can verify and mark as linked.'
                        : 'TGA link has been initiated. An admin must verify and mark as linked.'}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    {canVerify && (
                      <Button onClick={handleMarkLinked} variant="default" disabled={updating}>
                        {updating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Mark as Linked
                      </Button>
                    )}
                    <Button onClick={handleUnlink} variant="outline" disabled={updating}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {currentStatus === 'linked' && (
                <div className="space-y-3">
                  <Alert className="border-green-500/50 bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-600">Successfully Linked</AlertTitle>
                    <AlertDescription>
                      This client is linked to TGA. 
                      {registryLink?.last_synced_at && (
                        <span className="block mt-1">
                          Last synced: {new Date(registryLink.last_synced_at).toLocaleString()}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button onClick={handleSyncNow} variant="outline" disabled={updating}>
                      {updating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync Now
                    </Button>
                    <Button onClick={handleUnlink} variant="ghost" disabled={updating}>
                      Unlink
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Note: Automatic TGA sync is not yet enabled. Manual verification is recommended.
                  </p>
                </div>
              )}

              {currentStatus === 'error' && (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Link Error</AlertTitle>
                    <AlertDescription>
                      {registryLink?.last_error || 'An error occurred while linking to TGA.'}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button onClick={handleLinkToTGA} disabled={updating}>
                      {updating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Retry Link
                    </Button>
                    <Button onClick={handleUnlink} variant="outline" disabled={updating}>
                      Clear Error
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Future Integrations Placeholder */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Additional integrations coming soon
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
