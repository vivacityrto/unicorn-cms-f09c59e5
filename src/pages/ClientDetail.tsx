import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import { ClientTimelineTab } from '@/components/client/ClientTimelineTab';
import { ClientLoginHistoryTab } from '@/components/client/ClientLoginHistoryTab';
import { ClientStructuredNotesTab } from '@/components/client/ClientStructuredNotesTab';
import { ClientActionItemsTab } from '@/components/client/ClientActionItemsTab';
import { ClientEmailsTab } from '@/components/client/ClientEmailsTab';
import { ClientFilesTab } from '@/components/client/ClientFilesTab';
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
  User,
  Package2, 
  FileText, 
  Link2,
  StickyNote,
  Activity,
  LogIn,
  CheckSquare,
  
  Save,
  Loader2,
  Mail,
  FolderOpen,
  ShieldAlert,
  Clock,
  Phone
} from 'lucide-react';
import { ClientProfileForm } from '@/components/client/ClientProfileForm';
import { ClientAddressSection } from '@/components/client/ClientAddressSection';
import { ClientPackagesTab } from '@/components/client/ClientPackagesTab';
import { ClientIntegrationsTab } from '@/components/client/ClientIntegrationsTab';
import { ClientTimeTab } from '@/components/client/ClientTimeTab';
import { DocumentsHub } from '@/components/documents/DocumentsHub';
import { TenantUsersTab } from '@/components/client/TenantUsersTab';
import { TenantTimeTrackerBar } from '@/components/client/TenantTimeTrackerBar';
import { ClientTimeSummaryCard } from '@/components/client/ClientTimeSummaryCard';
import { RiskLevelBadge } from '@/components/client/RiskLevelBadge';
import { CSCAssignmentSelector } from '@/components/client/CSCAssignmentSelector';
import { TenantUsersPreviewCard } from '@/components/client/TenantUsersPreviewCard';

import { ViewAsClientButton } from '@/components/client/ViewAsClientButton';
import { ClientQuickNav } from '@/components/client/ClientQuickNav';
import { AssignPackageDialog } from '@/components/client/AssignPackageDialog';
import { TenantStatusDropdown } from '@/components/tenant/TenantStatusDropdown';
import { TenantLogoUpload } from '@/components/tenant/TenantLogoUpload';
import { OrgTypeBadge } from '@/components/tenant/OrgTypeBadge';

interface TenantBasic {
  id: number;
  name: string;
  slug: string;
  status: string;
  complyhub_membership_tier?: string | null;
}

export default function ClientDetail() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const [tenant, setTenant] = useState<TenantBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [primaryContactName, setPrimaryContactName] = useState<string>('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState<string>('');
  const [assignPackageOpen, setAssignPackageOpen] = useState(false);
  const [profileHasChanges, setProfileHasChanges] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [triggerProfileSave, setTriggerProfileSave] = useState<(() => void) | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [tenantPhone, setTenantPhone] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const tenantIdNum = tenantId ? parseInt(tenantId) : null;
  
  const { 
    profile, 
    registryLink, 
    tgaConnected,
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
      fetchPrimaryContact();
    }
  }, [tenantIdNum]);

  const fetchTenantBasic = async () => {
    if (!tenantIdNum) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, status, complyhub_membership_tier, logo_path')
        .eq('id', tenantIdNum)
        .single();

      if (error) throw error;
      setTenant(data);
      setLogoPath((data as any).logo_path || null);

      // Fetch phone from tenant_profile
      const { data: tp } = await supabase
        .from('tenant_profile')
        .select('phone1')
        .eq('tenant_id', tenantIdNum)
        .maybeSingle();
      setTenantPhone(tp?.phone1 || null);
    } catch (error) {
      console.error('Error fetching tenant:', error);
      navigate('/manage-tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrimaryContact = async () => {
    if (!tenantIdNum) return;
    try {
      const { data: pcRow } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantIdNum)
        .eq('primary_contact', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pcRow?.user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('user_uuid', pcRow.user_id)
          .maybeSingle();
        if (userData) {
          setPrimaryContactName(`${userData.first_name || ''} ${userData.last_name || ''}`.trim());
          setPrimaryContactEmail(userData.email || '');
        }
      }
    } catch (err) {
      console.error('Error fetching primary contact:', err);
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
              <TenantLogoUpload
                tenantId={tenantIdNum!}
                currentLogoPath={logoPath}
                onLogoChange={setLogoPath}
              />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{tenant.name}</h1>
                  <TenantStatusDropdown
                    tenantId={tenantIdNum!}
                    currentStatus={tenant.status}
                    onStatusChange={(newStatus) => setTenant(prev => prev ? { ...prev, status: newStatus } : null)}
                    onNonActiveChange={(statusDescription) => {
                      const title = `** CLIENT ${statusDescription.toUpperCase()} **`;
                      navigate(`/tenant/${tenantId}/notes?initNote=true&noteTitle=${encodeURIComponent(title)}`);
                    }}
                  />
                  <RiskLevelBadge
                    riskLevel={profile?.risk_level}
                    onUpdate={async (newLevel) => {
                      await saveProfile({ risk_level: newLevel });
                    }}
                    disabled={!canEdit}
                  />
                  <OrgTypeBadge orgType={profile?.org_type} rtoNumber={profile?.rto_number} cricosNumber={profile?.cricos_number} />
                </div>
                {tenantPhone && (
                  <a href={`tel:${tenantPhone}`} className="text-xs text-muted-foreground mt-1 hover:text-primary hover:underline inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {tenantPhone}
                  </a>
                )}
                
                {/* CSC Assignment */}
                <div className="mt-2">
                  <CSCAssignmentSelector 
                    tenantId={tenantIdNum!} 
                    canEdit={canEdit}
                    canRemove={isSuperAdminUser}
                  />
                </div>

                {/* Primary Contact */}
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  {primaryContactName
                    ? <span>Primary Contact: {primaryContactName}</span>
                    : <span className="text-muted-foreground/50">No primary contact</span>
                  }
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <ViewAsClientButton
                tenantId={tenantIdNum!}
                tenantName={tenant.name}
              />
              {tenantIdNum && <ClientQuickNav currentTenantId={tenantIdNum} />}
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
                Packages ({packages.filter(p => !p.is_complete).length})
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
                Users{userCount !== null ? ` (${userCount})` : ''}
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
                <FolderOpen className="h-4 w-4 mr-2" />
                Client Files
              </TabsTrigger>
              <TabsTrigger
                value="timeline"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Activity className="h-4 w-4 mr-2" />
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="logins"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Login History
              </TabsTrigger>
              <TabsTrigger
                value="integrations"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Integrations
              </TabsTrigger>
              <TabsTrigger
                value="time"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              >
                <Clock className="h-4 w-4 mr-2" />
                Time
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Sticky Time Tracker Bar */}
      <TenantTimeTrackerBar tenantId={tenantIdNum!} tenantName={tenant.name} />

      {/* Tab Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* Time Summary & Users Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ClientTimeSummaryCard clientId={tenantIdNum!} />
              </div>
              <TenantUsersPreviewCard tenantId={tenantIdNum!} onViewAll={() => setActiveTab('users')} />
            </div>

            
            
            {/* Profile Form */}
            {canEdit ? (
              <>
                <ClientProfileForm
                  profile={profile}
                  onSave={saveProfile}
                  loading={profileLoading}
                  tgaLinked={tgaConnected}
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
              onAddPackage={() => setAssignPackageOpen(true)}
              complyhubTier={tenant?.complyhub_membership_tier}
            />
            <AssignPackageDialog
              open={assignPackageOpen}
              onOpenChange={setAssignPackageOpen}
              tenantId={tenantIdNum!}
              tenantName={tenant.name}
              onSuccess={refreshPackages}
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
            <TenantUsersTab tenantId={tenantIdNum!} tenantName={tenant.name} onCountChange={setUserCount} />
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
            <ClientFilesTab tenantId={tenantIdNum!} clientName={tenant.name} />
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <ClientTimelineTab tenantId={tenantIdNum!} clientId={tenant.id.toString()} />
          </TabsContent>

          <TabsContent value="logins" className="mt-0">
            <ClientLoginHistoryTab tenantId={tenantIdNum!} />
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

          <TabsContent value="time" className="mt-0">
            <ClientTimeTab tenantId={tenantIdNum!} tenantName={tenant.name} />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}
