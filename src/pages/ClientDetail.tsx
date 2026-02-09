import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import { ClientTimelineTab } from '@/components/client/ClientTimelineTab';
import { ClientStructuredNotesTab } from '@/components/client/ClientStructuredNotesTab';
import { ClientActionItemsTab } from '@/components/client/ClientActionItemsTab';
import { ClientEmailsTab } from '@/components/client/ClientEmailsTab';
import { ClientSharePointDocumentsTab } from '@/components/client/ClientSharePointDocumentsTab';
import { useClientProfile, useClientPackages } from '@/hooks/useClientManagement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Users, 
  Package2, 
  FileText, 
  Link2,
  StickyNote,
  Activity,
  CheckSquare,
  Calendar,
  Save,
  Loader2,
  Mail,
  Cloud,
  ShieldAlert
} from 'lucide-react';
import { ClientProfileForm } from '@/components/client/ClientProfileForm';
import { ClientAddressSection } from '@/components/client/ClientAddressSection';
import { ClientPackagesTab } from '@/components/client/ClientPackagesTab';
import { ClientIntegrationsTab } from '@/components/client/ClientIntegrationsTab';
import { DocumentsHub } from '@/components/documents/DocumentsHub';
import { TenantUsersTab } from '@/components/client/TenantUsersTab';
import { ClientTimeWidget } from '@/components/client/ClientTimeWidget';
import { ClientTimeSummaryCard } from '@/components/client/ClientTimeSummaryCard';
import { RiskLevelBadge } from '@/components/client/RiskLevelBadge';
import { CSCAssignmentSelector } from '@/components/client/CSCAssignmentSelector';
import { AddTimeFromMeetingDialog } from '@/components/client/AddTimeFromMeetingDialog';
import { ViewAsClientButton } from '@/components/client/ViewAsClientButton';
import { useInvalidateTimeTracking, timeTrackingKeys } from '@/hooks/useTimeTrackingQuery';
import { useInvalidatePackageUsage, packageUsageKeys } from '@/hooks/usePackageUsageQuery';
import { useQueryClient } from '@tanstack/react-query';

interface TenantBasic {
  id: number;
  name: string;
  slug: string;
  status: string;
}

export default function ClientDetail() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const [tenant, setTenant] = useState<TenantBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [profileHasChanges, setProfileHasChanges] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [triggerProfileSave, setTriggerProfileSave] = useState<(() => void) | null>(null);
  const [addTimeFromMeetingOpen, setAddTimeFromMeetingOpen] = useState(false);

  const tenantIdNum = tenantId ? parseInt(tenantId) : null;
  
  // React Query client for cache invalidation
  const queryClient = useQueryClient();
  
  const { 
    profile, 
    registryLink, 
    loading: profileLoading, 
    saveProfile, 
    setTgaLink,
    verifyTgaLink,
    updateRegistryLink 
  } = useClientProfile(tenantIdNum);
  
  const { 
    packages, 
    loading: packagesLoading, 
    refreshPackages 
  } = useClientPackages(tenantIdNum);

  // Get user's role for this tenant
  const { isSuperAdmin: checkSuperAdmin, hasTenantAdmin } = useAuth();
  const isSuperAdminUser = checkSuperAdmin();
  const isTeamLeader = authProfile?.unicorn_role === 'Team Leader';
  const canEdit = isSuperAdminUser || isTeamLeader;
  const canVerifyTga = isSuperAdminUser || hasTenantAdmin(tenantIdNum || 0);

  // Handle profile form state changes
  const handleProfileStateChange = (hasChanges: boolean, saving: boolean, save: () => void) => {
    setProfileHasChanges(hasChanges);
    setProfileSaving(saving);
    setTriggerProfileSave(() => save);
  };

  useEffect(() => {
    if (tenantIdNum) {
      fetchTenantBasic();
    }
  }, [tenantIdNum]);

  const fetchTenantBasic = async () => {
    if (!tenantIdNum) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, status')
        .eq('id', tenantIdNum)
        .single();

      if (error) throw error;
      setTenant(data);
    } catch (error) {
      console.error('Error fetching tenant:', error);
      navigate('/manage-tenants');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 text-center">
        <p>Client not found</p>
        <Button onClick={() => navigate('/manage-tenants')} className="mt-4">
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="p-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/manage-tenants')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>

          {/* Client Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {tenant.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{tenant.name}</h1>
                  <Badge
                    variant={tenant.status === 'active' ? 'default' : 'destructive'}
                    className={
                      tenant.status === 'active'
                        ? 'bg-green-500/10 text-green-600 border border-green-600'
                        : 'bg-red-500/10 text-red-600 border border-red-600'
                    }
                  >
                    {tenant.status === 'active' ? (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    ) : (
                      <XCircle className="h-3 w-3 mr-1" />
                    )}
                    {tenant.status}
                  </Badge>
                  <RiskLevelBadge
                    riskLevel={profile?.risk_level}
                    onUpdate={async (newLevel) => {
                      await saveProfile({ risk_level: newLevel });
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">slug: {tenant.slug}</p>
                
                {/* CSC Assignment */}
                <div className="mt-2">
                  <CSCAssignmentSelector 
                    tenantId={tenantIdNum!} 
                    canEdit={canEdit}
                    canRemove={isSuperAdminUser}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <ViewAsClientButton
                tenantId={tenantIdNum!}
                tenantName={tenant.name}
              />
              {activeTab === 'overview' && canEdit && (
                <Button
                  onClick={() => triggerProfileSave?.()}
                  disabled={!profileHasChanges || profileSaving || profileLoading}
                  className="min-w-[140px]"
                >
                  {profileSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent border-b-0 h-auto p-0 gap-4">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="packages"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Package2 className="h-4 w-4 mr-2" />
                Packages ({packages.length})
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Users className="h-4 w-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <StickyNote className="h-4 w-4 mr-2" />
                Notes
                <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">
                  <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />
                  Internal
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="actions"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Actions
              </TabsTrigger>
              <TabsTrigger
                value="emails"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Mail className="h-4 w-4 mr-2" />
                Emails
              </TabsTrigger>
              <TabsTrigger
                value="sharepoint"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Cloud className="h-4 w-4 mr-2" />
                SharePoint
              </TabsTrigger>
              <TabsTrigger
                value="timeline"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Activity className="h-4 w-4 mr-2" />
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="integrations"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Integrations
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* Engagement Controls Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <ClientTimeWidget 
                      tenantId={tenantIdNum!} 
                      clientId={tenantIdNum!}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setAddTimeFromMeetingOpen(true)}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Add time from meeting
                    </Button>
                  </div>
                  <div className="text-center border-l border-border pl-4">
                    <p className="text-2xl font-bold">{packages.length}</p>
                    <p className="text-xs text-muted-foreground">Packages</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time Summary Card */}
            <ClientTimeSummaryCard clientId={tenantIdNum!} />
            
            {/* Profile Form */}
            {canEdit ? (
              <>
                <ClientProfileForm
                  profile={profile}
                  onSave={saveProfile}
                  loading={profileLoading}
                  tgaLinked={registryLink?.link_status === 'verified'}
                  onStateChange={handleProfileStateChange}
                />
                <ClientAddressSection
                  tenantId={tenantIdNum!}
                  loading={profileLoading}
                />
              </>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">
                    You don't have permission to edit client details.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="packages" className="mt-0">
            <ClientPackagesTab
              tenantId={tenantIdNum!}
              tenantName={tenant.name}
              packages={packages}
              loading={packagesLoading}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <DocumentsHub
              tenantId={tenantIdNum!}
              isClientView={false}
              tenantName={tenant.name}
            />
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            <TenantUsersTab tenantId={tenantIdNum!} tenantName={tenant.name} />
          </TabsContent>

          <TabsContent value="notes" className="mt-0">
            <ClientStructuredNotesTab tenantId={tenantIdNum!} clientId={tenant.id.toString()} />
          </TabsContent>

          <TabsContent value="actions" className="mt-0">
            <ClientActionItemsTab tenantId={tenantIdNum!} clientId={tenant.id.toString()} />
          </TabsContent>

          <TabsContent value="emails" className="mt-0">
            <ClientEmailsTab tenantId={tenantIdNum!} clientName={tenant.name} />
          </TabsContent>

          <TabsContent value="sharepoint" className="mt-0">
            <ClientSharePointDocumentsTab tenantId={tenantIdNum!} clientName={tenant.name} />
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <ClientTimelineTab tenantId={tenantIdNum!} clientId={tenant.id.toString()} />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0">
            <ClientIntegrationsTab
              profile={profile}
              registryLink={registryLink}
              onSetTgaLink={setTgaLink}
              onVerifyTgaLink={verifyTgaLink}
              onUpdateLink={updateRegistryLink}
              canVerify={canVerifyTga}
              loading={profileLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Time from Meeting Dialog */}
      <AddTimeFromMeetingDialog
        open={addTimeFromMeetingOpen}
        onOpenChange={setAddTimeFromMeetingOpen}
        clientId={tenantIdNum!}
        clientName={tenant.name}
        onSuccess={async () => {
          // Invalidate React Query caches for time and package data with immediate refetch
          if (tenantIdNum) {
            await Promise.all([
              queryClient.invalidateQueries({ 
                queryKey: timeTrackingKeys.summary(tenantIdNum),
                refetchType: 'all'
              }),
              queryClient.invalidateQueries({ 
                queryKey: timeTrackingKeys.entries(tenantIdNum),
                refetchType: 'all'
              }),
              queryClient.invalidateQueries({ 
                queryKey: packageUsageKeys.packages(tenantIdNum),
                refetchType: 'all'
              }),
              queryClient.invalidateQueries({ 
                queryKey: packageUsageKeys.alerts(tenantIdNum),
                refetchType: 'all'
              }),
              // Invalidate all package usage queries for this client
              queryClient.invalidateQueries({ 
                predicate: (query) => {
                  const key = query.queryKey;
                  return Array.isArray(key) && 
                         key[0] === 'package-usage' && 
                         key[2] === tenantIdNum;
                },
                refetchType: 'all'
              })
            ]);
          }
        }}
      />
    </div>
  );
}
