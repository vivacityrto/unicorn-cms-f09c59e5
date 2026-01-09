import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [tenantStatus, setTenantStatus] = useState<{ status: string; mergedInto?: number } | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    lastSyncRun?: { id: string; status: string; created_at: string } | null;
    debugPayload?: { record_count: number; fetched_at: string } | null;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
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

  // Fetch debug info for SuperAdmins
  useEffect(() => {
    if (!isSuperAdmin || !profile?.tenant_id || !showDebug) return;
    
    const fetchDebugInfo = async () => {
      const [runRes, payloadRes] = await Promise.all([
        supabase.from('tga_rto_import_jobs')
          .select('id, status, created_at')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('tga_debug_payloads')
          .select('record_count, fetched_at')
          .eq('tenant_id', profile.tenant_id)
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
  }, [isSuperAdmin, profile?.tenant_id, showDebug]);

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
    await tgaData.triggerSync();
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
                      {registryLink?.last_synced_at && (
                        <span className="block mt-1">
                          Last synced: {new Date(registryLink.last_synced_at).toLocaleString()}
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
                  {tgaData.summary ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Legal Name</p>
                        <p className="font-medium">{tgaData.summary.legal_name || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Trading Name</p>
                        <p className="font-medium">{tgaData.summary.trading_name || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Organisation Type</p>
                        <p className="font-medium">{tgaData.summary.organisation_type || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">ABN</p>
                        <p className="font-medium">{tgaData.summary.abn || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">ACN</p>
                        <p className="font-medium">{tgaData.summary.acn || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={tgaData.summary.status === 'Registered' ? 'default' : 'secondary'}>
                          {tgaData.summary.status || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Website</p>
                        {tgaData.summary.web_address ? (
                          <a 
                            href={tgaData.summary.web_address.startsWith('http') 
                              ? tgaData.summary.web_address 
                              : `https://${tgaData.summary.web_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            {tgaData.summary.web_address}
                          </a>
                        ) : (
                          <p className="font-medium">-</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Initial Registration</p>
                        <p className="font-medium">{tgaData.summary.initial_registration_date || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Registration Start</p>
                        <p className="font-medium">{tgaData.summary.registration_start_date || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Registration End</p>
                        <p className="font-medium">{tgaData.summary.registration_end_date || '-'}</p>
                      </div>
                      {tgaData.summary.fetched_at && (
                        <div className="space-y-1 col-span-2 md:col-span-3 pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Data last synced: {new Date(tgaData.summary.fetched_at).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No summary data available</p>
                  )}
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
                            <TableCell>{contact.contact_type || '-'}</TableCell>
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
                      <p className="text-muted-foreground text-sm">No addresses found</p>
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
                          <TableHead>Package</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.qualifications.map((qual) => (
                          <TableRow key={qual.id}>
                            <TableCell className="font-mono text-sm">{qual.qualification_code}</TableCell>
                            <TableCell className="font-medium">{qual.qualification_title || '-'}</TableCell>
                            <TableCell>{qual.training_package_code || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={qual.is_current ? 'default' : 'secondary'}>
                                {qual.status || (qual.is_current ? 'Current' : 'Not Current')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No qualifications found</p>
                  )}
                </TabsContent>

                <TabsContent value="skillsets" className="mt-4">
                  {tgaData.skillsets.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Package</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.skillsets.map((skill) => (
                          <TableRow key={skill.id}>
                            <TableCell className="font-mono text-sm">{skill.skillset_code}</TableCell>
                            <TableCell className="font-medium">{skill.skillset_title || '-'}</TableCell>
                            <TableCell>{skill.training_package_code || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={skill.is_current ? 'default' : 'secondary'}>
                                {skill.status || (skill.is_current ? 'Current' : 'Not Current')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No skill sets found</p>
                  )}
                </TabsContent>

                <TabsContent value="units" className="mt-4">
                  {tgaData.units.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Package</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.units.map((unit) => (
                          <TableRow key={unit.id}>
                            <TableCell className="font-mono text-sm">{unit.unit_code}</TableCell>
                            <TableCell className="font-medium">{unit.unit_title || '-'}</TableCell>
                            <TableCell>{unit.training_package_code || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={unit.is_current ? 'default' : 'secondary'}>
                                {unit.status || (unit.is_current ? 'Current' : 'Not Current')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No explicit units found</p>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tgaData.courses.map((course) => (
                          <TableRow key={course.id}>
                            <TableCell className="font-mono text-sm">{course.course_code}</TableCell>
                            <TableCell className="font-medium">{course.course_title || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={course.is_current ? 'default' : 'secondary'}>
                                {course.status || (course.is_current ? 'Current' : 'Not Current')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No accredited courses found</p>
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
                      <Badge variant={debugInfo.lastSyncRun.status === 'completed' ? 'default' : 'secondary'}>
                        {debugInfo.lastSyncRun.status}
                      </Badge>
                    </div>
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
