import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { 
  Link2, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  Unlink,
  Loader2,
  Building2,
  Users,
  MapPin,
  GraduationCap,
  Layers,
  BookOpen,
  Award,
  Bug
} from 'lucide-react';
import { ClientProfile, RegistryLink } from '@/hooks/useClientManagement';
import { useTgaRtoData } from '@/hooks/useTgaRtoData';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateTime } from '@/lib/utils';

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

// Decode HTML entities (e.g. &amp; -> &, &#39; -> ')
function decodeHtmlEntities(text: string | null | undefined): string | null {
  if (!text) return null;
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

interface SummaryFieldProps {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
  fieldPresence?: Record<string, boolean>;
  parseFailed?: string[];
  isLink?: boolean;
  isDate?: boolean;
  decode?: boolean;
}

function SummaryField({ label, value, fieldKey, fieldPresence, parseFailed, isLink, isDate, decode }: SummaryFieldProps) {
  let displayValue = decode ? decodeHtmlEntities(value) : value;
  
  // Format dates using DD/MM/YYYY format
  if (isDate && displayValue) {
    displayValue = formatDate(displayValue);
  }
  
  // Determine status based on debug info
  let statusMessage: React.ReactNode = null;
  
  if (fieldPresence) {
    const isPresent = fieldPresence[fieldKey];
    const didFail = parseFailed?.includes(fieldKey);
    
    if (!displayValue || displayValue === "—") {
      if (didFail) {
        // This is a PARSING BUG - tag exists but we failed to extract
        statusMessage = (
          <span className="inline-flex items-center gap-1">
            <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">PARSING BUG</span>
            <span className="text-destructive italic text-xs">See Debug Panel</span>
          </span>
        );
      } else if (isPresent === false) {
        statusMessage = <span className="text-muted-foreground italic">Not provided by TGA</span>;
      } else if (isPresent === undefined) {
        statusMessage = <span className="text-muted-foreground italic">—</span>;
      } else if (isPresent === true) {
        // Tag is present but value is null - empty tag from TGA
        statusMessage = (
          <span className="inline-flex items-center gap-1">
            <span className="border text-[10px] px-1.5 py-0.5 rounded text-muted-foreground">Empty</span>
            <span className="text-muted-foreground italic text-xs">TGA returned empty</span>
          </span>
        );
      } else {
        statusMessage = <span className="text-muted-foreground italic">Not provided by TGA</span>;
      }
    }
  } else if (!displayValue || displayValue === "—") {
    statusMessage = <span className="text-muted-foreground italic">—</span>;
  }

  // Use div instead of p to avoid DOM nesting issues with Badge/span
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      {displayValue && displayValue !== "—" ? (
        isLink ? (
          <a 
            href={displayValue.startsWith('http') ? displayValue : `https://${displayValue}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium block"
          >
            {displayValue}
          </a>
        ) : (
          <div className="font-medium">{displayValue}</div>
        )
      ) : (
        <div className="font-medium">{statusMessage}</div>
      )}
    </div>
  );
}

interface TradingNameHistory {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

interface SummaryTabProps {
  summary: {
    legal_name?: string | null;
    trading_name?: string | null;
    organisation_type?: string | null;
    abn?: string | null;
    acn?: string | null;
    status?: string | null;
    web_address?: string | null;
    initial_registration_date?: string | null;
    registration_start_date?: string | null;
    registration_end_date?: string | null;
    fetched_at?: string | null;
  } | null;
  debugPayload?: {
    // Support both old (snake_case) and new (camelCase) payload formats
    field_presence?: Record<string, boolean>;
    fieldPresence?: Record<string, boolean>;
    parse_failed_fields?: string[];
    parseFailedFields?: string[];
    tradingNamesArray?: TradingNameHistory[];
    tradingNamesCount?: number;
  };
}

function SummaryTab({ summary, debugPayload }: SummaryTabProps) {
  // Support both old and new payload format
  const fieldPresence = debugPayload?.fieldPresence ?? debugPayload?.field_presence;
  const parseFailed = debugPayload?.parseFailedFields ?? debugPayload?.parse_failed_fields;
  const tradingNamesArray = debugPayload?.tradingNamesArray;
  const [showTradingHistory, setShowTradingHistory] = useState(false);

  if (!summary) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No summary data</AlertTitle>
        <AlertDescription>
          Summary data has not been synced yet. Click "Sync Now" to import data from TGA.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <SummaryField 
        label="Legal Name" 
        value={summary.legal_name} 
        fieldKey="LegalName" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
        decode
      />
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Trading Name</div>
        {summary.trading_name ? (
          <div>
            <div className="font-medium">{decodeHtmlEntities(summary.trading_name)}</div>
            {tradingNamesArray && tradingNamesArray.length > 1 && (
              <button 
                onClick={() => setShowTradingHistory(!showTradingHistory)}
                className="text-xs text-primary hover:underline mt-1"
              >
                {showTradingHistory ? 'Hide' : 'Show'} history ({tradingNamesArray.length} names)
              </button>
            )}
            {showTradingHistory && tradingNamesArray && (
              <div className="mt-2 space-y-1 text-xs border-l-2 border-muted pl-2">
                {tradingNamesArray.map((tn, i) => (
                  <div key={i} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{tn.name}</span>
                    {tn.startDate && <span className="ml-1">from {tn.startDate}</span>}
                    {tn.endDate && <span className="ml-1">to {tn.endDate}</span>}
                    {!tn.endDate && <Badge variant="outline" className="ml-1 text-[9px]">Current</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="font-medium">
            {fieldPresence?.TradingName === false ? (
              <span className="text-muted-foreground italic">Not provided by TGA</span>
            ) : fieldPresence?.TradingName === true ? (
              <span className="text-muted-foreground italic">TGA returned empty</span>
            ) : (
              <span className="text-muted-foreground italic">—</span>
            )}
          </div>
        )}
      </div>
      <SummaryField 
        label="Organisation Type" 
        value={summary.organisation_type} 
        fieldKey="OrganisationType" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
      />
      <SummaryField 
        label="ABN" 
        value={summary.abn} 
        fieldKey="ABN" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
      />
      <SummaryField 
        label="ACN" 
        value={summary.acn} 
        fieldKey="ACN" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
      />
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Status</div>
        <div>
          <Badge variant={summary.status === 'Registered' || summary.status === 'Current' ? 'default' : 'secondary'}>
            {summary.status || 'Unknown'}
          </Badge>
        </div>
      </div>
      <SummaryField 
        label="Website" 
        value={summary.web_address} 
        fieldKey="WebAddress" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
        isLink
      />
      <SummaryField 
        label="Initial Registration" 
        value={summary.initial_registration_date} 
        fieldKey="InitialRegistrationDate" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
        isDate
      />
      <SummaryField 
        label="Registration Start" 
        value={summary.registration_start_date} 
        fieldKey="RegistrationStartDate" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
        isDate
      />
      <SummaryField 
        label="Registration End" 
        value={summary.registration_end_date} 
        fieldKey="RegistrationEndDate" 
        fieldPresence={fieldPresence}
        parseFailed={parseFailed}
        isDate
      />
      {summary.fetched_at && (
        <div className="space-y-1 col-span-2 md:col-span-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Data last synced: {formatDateTime(summary.fetched_at)}
          </p>
        </div>
      )}
    </div>
  );
}

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
  const [tenantStatus, setTenantStatus] = useState<{ status: string; mergedInto?: number } | null>(null);
  const [tgaLinkRow, setTgaLinkRow] = useState<{ last_sync_at: string | null; last_sync_status: string | null; last_sync_error: string | null } | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    lastSyncRun?: { id: string; status: string; created_at: string; stage?: string; last_error?: string | null; payload_meta?: unknown } | null;
    debugPayload?: { record_count: number; fetched_at: string; endpoint?: string; http_status?: number | null; payload?: any } | null;
    stageJobs?: Array<{ stage: string; status: string; count?: number; reason?: string }>;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [syncCounter, setSyncCounter] = useState(0); // Track sync completions to refresh debug panel
  const { isSuperAdmin } = useAuth();

  const hasRtoNumber = !!profile?.rto_number;
  const currentStatus = registryLink?.link_status || 'not_linked';
  const statusConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.not_linked;
  const isLinked = currentStatus === 'linked';

  // Check tenant status
  useEffect(() => {
    if (!profile?.tenant_id) return;

    const fetchTenantStatus = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('status, metadata')
        .eq('id', profile.tenant_id)
        .single();

      if (data) {
        const metadata = data.metadata as Record<string, unknown> | null;
        setTenantStatus({
          status: data.status,
          mergedInto: metadata?.merged_into as number | undefined
        });
      }
    };

    fetchTenantStatus();
  }, [profile?.tenant_id]);

  // Fetch current tga_links sync status (source of truth for last sync)
  useEffect(() => {
    if (!profile?.tenant_id || !profile?.rto_number) return;

    const fetchTgaLinkRow = async () => {
      const { data } = await supabase
        .from('tga_links')
        .select('last_sync_at, last_sync_status, last_sync_error')
        .eq('tenant_id', profile.tenant_id)
        .eq('rto_number', profile.rto_number)
        .maybeSingle();

      setTgaLinkRow(data ?? null);
    };

    fetchTgaLinkRow();
  }, [profile?.tenant_id, profile?.rto_number, syncCounter]);

  // Fetch debug info for SuperAdmins - refresh when syncCounter changes
  useEffect(() => {
    if (!isSuperAdmin || !profile?.tenant_id || !showDebug) return;
    
    const fetchDebugInfo = async () => {
      const [runRes, payloadRes] = await Promise.all([
        supabase.from('tga_rest_sync_jobs')
          .select('id, status, created_at, rto_id, scope_counts, last_error')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('tga_debug_payloads')
          .select('record_count, fetched_at, endpoint, http_status, payload')
          .eq('tenant_id', profile.tenant_id)
          .eq('rto_code', profile.rto_number)
          .order('fetched_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);
      
      setDebugInfo({
        lastSyncRun: runRes.data,
        debugPayload: payloadRes.data
      });
    };
    
    fetchDebugInfo();
  }, [isSuperAdmin, profile?.tenant_id, showDebug, syncCounter]);

  // Fetch TGA data when linked - use the new dataset-based approach
  // Note: We pass tenant_id as a string identifier since that's what we have
  const tgaData = useTgaRtoData(
    isLinked ? profile?.tenant_id ?? null : null,
    isLinked ? profile?.rto_number ?? null : null,
    undefined // clientId not available in this context
  );

  const handleLinkToTGA = async () => {
    if (!profile?.rto_number) return;
    setUpdating(true);
    const result = await onSetTgaLink(profile.rto_number);
    
    // If auto-verified, trigger the import
    if (result.autoVerified && result.success) {
      await tgaData.triggerSync();
    }
    setUpdating(false);
  };

  const handleMarkLinked = async () => {
    setUpdating(true);
    const success = await onVerifyTgaLink();
    if (success) {
      await tgaData.triggerSync();
    }
    setUpdating(false);
  };

  const handleUnlink = async () => {
    setUpdating(true);
    await onUpdateLink('not_linked');
    setUpdating(false);
  };

  const handleSyncNow = async () => {
    const result = await tgaData.triggerSync();
    if (result.success) {
      // Trigger debug panel refresh
      setSyncCounter(c => c + 1);
    }
  };

  // Show merged tenant warning
  if (tenantStatus?.status === 'inactive' && tenantStatus?.mergedInto) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Tenant Merged</AlertTitle>
          <AlertDescription>
            This tenant has been merged into tenant {tenantStatus.mergedInto}. 
            Please navigate to the active tenant to manage TGA integrations.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

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
          {!hasRtoNumber ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>TGA link unavailable</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-2">
                  This client does not have an RTO number configured.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <>
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
                        ? 'TGA link has been initiated. Click below to verify and import data.'
                        : 'TGA link has been initiated. An admin must verify and import data.'}
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
                        Verify & Import Data
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
                      {tgaLinkRow?.last_sync_at && (
                        <span className="block mt-1">
                          Last synced: {new Date(tgaLinkRow.last_sync_at).toLocaleString()} ({tgaLinkRow.last_sync_status || 'unknown'})
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button onClick={handleSyncNow} variant="outline" disabled={tgaData.syncing}>
                      {tgaData.syncing ? (
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

      {/* TGA Data Tabs - only show when linked */}
      {isLinked && hasRtoNumber && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              TGA Data
            </CardTitle>
            <CardDescription>
              Data imported from Training.gov.au for RTO {profile?.rto_number}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tgaData.loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !tgaData.hasData ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No data imported yet</AlertTitle>
                <AlertDescription>
                  Click "Sync Now" above to import data from Training.gov.au
                </AlertDescription>
              </Alert>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="summary" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="contacts" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    Contacts
                  </TabsTrigger>
                  <TabsTrigger value="addresses" className="text-xs">
                    <MapPin className="h-3 w-3 mr-1" />
                    Addresses
                  </TabsTrigger>
                  <TabsTrigger value="qualifications" className="text-xs">
                    <GraduationCap className="h-3 w-3 mr-1" />
                    Quals ({tgaData.qualifications.length})
                  </TabsTrigger>
                  <TabsTrigger value="skillsets" className="text-xs">
                    <Layers className="h-3 w-3 mr-1" />
                    Skills ({tgaData.skillsets.length})
                  </TabsTrigger>
                  <TabsTrigger value="units" className="text-xs">
                    <BookOpen className="h-3 w-3 mr-1" />
                    Units ({tgaData.units.length})
                  </TabsTrigger>
                  <TabsTrigger value="courses" className="text-xs">
                    <Award className="h-3 w-3 mr-1" />
                    Courses ({tgaData.courses.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-4">
                  <SummaryTab 
                    summary={tgaData.summary} 
                    debugPayload={debugInfo?.debugPayload?.payload}
                  />
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                  {tgaData.contacts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.contacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <Badge variant={
                                contact.contact_type === 'ChiefExecutive' ? 'default' :
                                contact.contact_type === 'PublicEnquiries' ? 'secondary' :
                                contact.contact_type === 'RegistrationEnquiries' ? 'outline' :
                                'secondary'
                              }>
                                {contact.contact_type || 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                            <TableCell>{contact.position || '-'}</TableCell>
                            <TableCell>{contact.phone || '-'}</TableCell>
                            <TableCell>{contact.email || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No contacts found</p>
                  )}
                </TabsContent>

                <TabsContent value="addresses" className="mt-4">
                  <div className="space-y-4">
                    {tgaData.addresses.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Registered Addresses</h4>
                        {tgaData.addresses.map((address) => (
                          <div key={address.id} className="p-3 border rounded-lg mb-2">
                            <Badge variant="outline" className="mb-2">{address.address_type}</Badge>
                            <p>{address.address_line_1}</p>
                            {address.address_line_2 && <p>{address.address_line_2}</p>}
                            <p>{address.suburb}, {address.state} {address.postcode}</p>
                            {address.phone && <p className="text-sm text-muted-foreground mt-1">Phone: {address.phone}</p>}
                            {address.email && <p className="text-sm text-muted-foreground">Email: {address.email}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {tgaData.deliveryLocations.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Delivery Sites ({tgaData.deliveryLocations.length})</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Site Name</TableHead>
                              <TableHead>Address</TableHead>
                              <TableHead>Suburb</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Postcode</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tgaData.deliveryLocations.map((loc) => (
                              <TableRow key={loc.id}>
                                <TableCell className="font-medium">{loc.location_name || '-'}</TableCell>
                                <TableCell>{loc.address_line_1 || '-'}</TableCell>
                                <TableCell>{loc.suburb || '-'}</TableCell>
                                <TableCell>{loc.state || '-'}</TableCell>
                                <TableCell>{loc.postcode || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {tgaData.addresses.length === 0 && tgaData.deliveryLocations.length === 0 && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No address data</AlertTitle>
                        <AlertDescription>
                          Address data was not provided by TGA for this RTO, or could not be parsed.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="qualifications" className="mt-4">
                  {tgaData.qualifications.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Extent</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Delivery Notification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.qualifications.map((qual) => (
                          <TableRow key={qual.id}>
                            <TableCell className="font-mono text-sm">{qual.qualification_code}</TableCell>
                            <TableCell className="font-medium">{qual.qualification_title || '-'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${
                                qual.status_label === 'Current' ? 'bg-green-100 text-green-800 border border-green-300' :
                                qual.status_label === 'Superseded' ? 'bg-red-100 text-red-800 border border-red-300' :
                                'bg-gray-100 text-gray-800 border border-gray-300'
                              }`}>
                                {qual.status_label || qual.status || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{qual.extent_label || '-'}</TableCell>
                            <TableCell className="text-sm">{qual.start_date ? new Date(qual.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                            <TableCell className="text-sm">{qual.end_date ? new Date(qual.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                            <TableCell className="text-sm">{qual.extent_label ? 'WA' : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No qualifications data</AlertTitle>
                      <AlertDescription>
                        TGA did not return qualifications scope for this RTO. This may be normal — not all RTOs have scope data published via the web service.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="skillsets" className="mt-4">
                  {tgaData.skillsets.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Extent</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.skillsets.map((skill) => (
                          <TableRow key={skill.id}>
                            <TableCell className="font-mono text-sm">{skill.skillset_code}</TableCell>
                            <TableCell className="font-medium">{skill.skillset_title || '-'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${
                                skill.status_label === 'Current' ? 'bg-green-100 text-green-800 border border-green-300' :
                                skill.status_label === 'Superseded' ? 'bg-red-100 text-red-800 border border-red-300' :
                                'bg-gray-100 text-gray-800 border border-gray-300'
                              }`}>
                                {skill.status_label || skill.status || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{skill.extent_label || '-'}</TableCell>
                            <TableCell className="text-sm">{skill.start_date ? new Date(skill.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                            <TableCell className="text-sm">{skill.end_date ? new Date(skill.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No skill sets data</AlertTitle>
                      <AlertDescription>
                        TGA did not return skill sets scope for this RTO. This may be normal — not all RTOs have scope data published via the web service.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="units" className="mt-4">
                  {tgaData.units.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Extent</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.units.map((unit) => (
                          <TableRow key={unit.id}>
                            <TableCell className="font-mono text-sm">{unit.unit_code}</TableCell>
                            <TableCell className="font-medium">{unit.unit_title || '-'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${
                                unit.status_label === 'Current' ? 'bg-green-100 text-green-800 border border-green-300' :
                                unit.status_label === 'Superseded' ? 'bg-red-100 text-red-800 border border-red-300' :
                                'bg-gray-100 text-gray-800 border border-gray-300'
                              }`}>
                                {unit.status_label || unit.status || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{unit.extent_label || '-'}</TableCell>
                            <TableCell className="text-sm">{unit.start_date ? new Date(unit.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                            <TableCell className="text-sm">{unit.end_date ? new Date(unit.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No explicit units data</AlertTitle>
                      <AlertDescription>
                        TGA did not return explicit units scope for this RTO. This may be normal — not all RTOs have explicit units published via the web service.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="courses" className="mt-4">
                  {tgaData.courses.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.courses.map((course) => (
                          <TableRow key={course.id}>
                            <TableCell className="font-mono text-sm">{course.course_code}</TableCell>
                            <TableCell className="font-medium">{course.course_title || '-'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${
                                course.status_label === 'Current' ? 'bg-green-100 text-green-800 border border-green-300' :
                                course.status_label === 'Superseded' ? 'bg-red-100 text-red-800 border border-red-300' :
                                'bg-gray-100 text-gray-800 border border-gray-300'
                              }`}>
                                {course.status_label || course.status || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{course.start_date ? new Date(course.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                            <TableCell className="text-sm">{course.end_date ? new Date(course.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No accredited courses data</AlertTitle>
                      <AlertDescription>
                        TGA did not return accredited courses scope for this RTO. This may be normal — not all RTOs have scope data published via the web service.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}

      {/* SuperAdmin Debug Panel */}
      {isSuperAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bug className="h-4 w-4" />
                TGA Debug Panel
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? 'Hide' : 'Show'}
              </Button>
            </div>
          </CardHeader>
          {showDebug && (
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tenant ID</p>
                  <p className="font-mono">{profile?.tenant_id ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">RTO Number</p>
                  <p className="font-mono">{profile?.rto_number ?? 'Not set'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tenant Status</p>
                  <Badge variant={tenantStatus?.status === 'active' ? 'default' : 'secondary'}>
                    {tenantStatus?.status ?? 'Unknown'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Link Status</p>
                  <Badge variant="outline">{currentStatus}</Badge>
                </div>
                {debugInfo?.lastSyncRun && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Last Sync Job ID</p>
                      <p className="font-mono text-xs">{debugInfo.lastSyncRun.id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Sync Status</p>
                      <Badge variant={debugInfo.lastSyncRun.status === 'success' || debugInfo.lastSyncRun.status === 'completed' ? 'default' : 'secondary'}>
                        {debugInfo.lastSyncRun.status}
                      </Badge>
                    </div>
                    {debugInfo.lastSyncRun.last_error && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Last Error</p>
                        <p className="text-xs text-destructive">{debugInfo.lastSyncRun.last_error}</p>
                      </div>
                    )}
                    {debugInfo.lastSyncRun.payload_meta && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Sync Status by Section</p>
                        <div className="text-xs mt-1 space-y-1">
                          {Object.entries((debugInfo.lastSyncRun.payload_meta as Record<string, unknown>).syncStatus || {}).map(([key, val]) => {
                            const v = val as { count?: number; reason?: string; replaced?: boolean };
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <span className="font-medium">{key}:</span>
                                <span>{v.count ?? 0} records</span>
                                {v.reason && <Badge variant="outline" className="text-xs">{v.reason}</Badge>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {debugInfo?.debugPayload && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Debug Record Count</p>
                      <p>{debugInfo.debugPayload.record_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Fetched</p>
                      <p>{new Date(debugInfo.debugPayload.fetched_at).toLocaleString()}</p>
                    </div>

                    {(debugInfo.debugPayload.payload?.rawXmlHash || debugInfo.debugPayload.payload?.raw_xml_hash) && (
                      <div>
                        <p className="text-muted-foreground">Raw XML Hash</p>
                        <p className="font-mono text-xs">{debugInfo.debugPayload.payload.rawXmlHash || debugInfo.debugPayload.payload.raw_xml_hash}</p>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.rawXmlLength || debugInfo.debugPayload.payload?.raw_xml_length) && (
                      <div>
                        <p className="text-muted-foreground">Raw XML Length</p>
                        <p className="font-mono text-xs">{(debugInfo.debugPayload.payload.rawXmlLength || debugInfo.debugPayload.payload.raw_xml_length).toLocaleString()} chars</p>
                      </div>
                    )}

                    {debugInfo.debugPayload.payload?.tradingNamesCount !== undefined && (
                      <div>
                        <p className="text-muted-foreground">Trading Names Count</p>
                        <p className="font-mono text-xs">{debugInfo.debugPayload.payload.tradingNamesCount}</p>
                      </div>
                    )}

                    {/* Section Presence - shows which data sections TGA returned */}
                    {debugInfo.debugPayload.payload?.sectionPresence && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Sections in TGA Response</p>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                          {Object.entries(debugInfo.debugPayload.payload.sectionPresence as Record<string, boolean>).map(([section, present]) => (
                            <div key={section} className="flex items-center gap-1">
                              <span className={present ? 'text-green-600' : 'text-muted-foreground'}>
                                {present ? '✓' : '✗'}
                              </span>
                              <span className={present ? '' : 'text-muted-foreground'}>{section}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Field Presence - support both formats */}
                    {(debugInfo.debugPayload.payload?.fieldPresence || debugInfo.debugPayload.payload?.field_presence) && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Summary Field Presence (from raw XML)</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          {Object.entries((debugInfo.debugPayload.payload.fieldPresence || debugInfo.debugPayload.payload.field_presence) as Record<string, boolean>).map(([k, v]) => {
                            const extractedFrom = debugInfo.debugPayload?.payload?.extractedFrom?.[k];
                            const parseFailed = (debugInfo.debugPayload?.payload?.parseFailedFields || debugInfo.debugPayload?.payload?.parse_failed_fields || []) as string[];
                            const isParseBug = v && parseFailed.includes(k);
                            return (
                              <div key={k} className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1">
                                <span className="font-medium">{k}</span>
                                <div className="flex items-center gap-1">
                                  {isParseBug ? (
                                    <Badge variant="destructive" className="text-[10px]">PARSING BUG</Badge>
                                  ) : (
                                    <Badge variant={v ? 'default' : 'secondary'} className="text-[10px]">{v ? 'present' : 'missing'}</Badge>
                                  )}
                                  {extractedFrom && <span className="text-[9px] text-muted-foreground">({extractedFrom})</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.missingFields?.length > 0 || debugInfo.debugPayload.payload?.missing_fields?.length > 0) && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Fields not returned by TGA endpoint</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(debugInfo.debugPayload.payload.missingFields || debugInfo.debugPayload.payload.missing_fields).join(', ')}
                        </p>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.emptyFields?.length > 0 || debugInfo.debugPayload.payload?.empty_fields?.length > 0) && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Fields returned empty by TGA</p>
                        <p className="text-xs text-amber-600 mt-1">
                          {(debugInfo.debugPayload.payload.emptyFields || debugInfo.debugPayload.payload.empty_fields).join(', ')}
                        </p>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.parseFailedFields?.length > 0 || debugInfo.debugPayload.payload?.parse_failed_fields?.length > 0) && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-destructive">Parsing errors</p>
                        <p className="text-xs text-destructive mt-1">
                          {(debugInfo.debugPayload.payload.parseFailedFields || debugInfo.debugPayload.payload.parse_failed_fields).join(', ')}
                        </p>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.extractedSummary || debugInfo.debugPayload.payload?.parsed_summary) && (
                      <div className="col-span-2">
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-full justify-between">
                              <span className="text-muted-foreground">Extracted Summary JSON</span>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-48">
                              {JSON.stringify(debugInfo.debugPayload.payload.extractedSummary || debugInfo.debugPayload.payload.parsed_summary, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    {(debugInfo.debugPayload.payload?.rawXml || debugInfo.debugPayload.payload?.raw_xml_excerpt) && (
                      <div className="col-span-2">
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-full justify-between">
                              <span className="text-muted-foreground">Raw XML (first 50k chars)</span>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-96 whitespace-pre-wrap break-all">
                              {debugInfo.debugPayload.payload.rawXml || debugInfo.debugPayload.payload.raw_xml_excerpt}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Future Integrations */}
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
