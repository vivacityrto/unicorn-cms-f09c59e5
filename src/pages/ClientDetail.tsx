import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';

import { ClientTimelineTab } from '@/components/client/ClientTimelineTab';
import { ClientLoginHistoryTab } from '@/components/client/ClientLoginHistoryTab';
import { ClientStructuredNotesTab } from '@/components/client/ClientStructuredNotesTab';
import { ClientActionItemsTab } from '@/components/client/ClientActionItemsTab';
import { ClientEmailsTab } from '@/components/client/ClientEmailsTab';
import { ClientMessagesTab } from '@/components/client/ClientMessagesTab';
import { ClientFilesTab } from '@/components/client/ClientFilesTab';
import { useClientProfile, useClientPackages } from '@/hooks/useClientManagement';
import { useClientMessagesUnread } from '@/hooks/useClientMessagesUnread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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
  ClipboardCheck,
  Save,
  Loader2,
  Mail,
  MessageSquare,
  FolderOpen,
  ShieldAlert,
  Clock,
  Phone,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { ClientProfileForm } from '@/components/client/ClientProfileForm';
import { TenantRelationships } from '@/components/tenant/TenantRelationships';
import { ClientAddressSection } from '@/components/client/ClientAddressSection';
import { ClientPackagesTab } from '@/components/client/ClientPackagesTab';
import { ClientIntegrationsTab } from '@/components/client/ClientIntegrationsTab';
import { ClientTimeTab } from '@/components/client/ClientTimeTab';
import { DocumentsHub } from '@/components/documents/DocumentsHub';
import { ClientAuditsTab } from '@/components/client/ClientAuditsTab';
import { TenantUsersTab } from '@/components/client/TenantUsersTab';
import { TenantTimeTrackerBar } from '@/components/client/TenantTimeTrackerBar';
import { ClientTimeSummaryCard } from '@/components/client/ClientTimeSummaryCard';
import { RiskLevelBadge } from '@/components/client/RiskLevelBadge';
import { CSCAssignmentSelector } from '@/components/client/CSCAssignmentSelector';
import { TenantUsersPreviewCard } from '@/components/client/TenantUsersPreviewCard';

import { ViewAsClientButton } from '@/components/client/ViewAsClientButton';
import { ClientQuickNav } from '@/components/client/ClientQuickNav';
import { TenantStatusDropdown } from '@/components/tenant/TenantStatusDropdown';
import { TenantLogoUpload } from '@/components/tenant/TenantLogoUpload';
import { OrgTypeBadge } from '@/components/tenant/OrgTypeBadge';
import { RenameTenantDialog, canRenameTenant } from '@/components/tenant/RenameTenantDialog';
import { Pencil, Lock } from 'lucide-react';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile: authProfile } = useAuth();
  const [tenant, setTenant] = useState<TenantBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');

  // Sync activeTab when URL search params change (e.g. from View Task navigation)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Tab switches from clicking within the page (as opposed to the URL-sync
  // effect above) also need to write back to the URL, so refresh/share/back
  // land on the tab actually being viewed instead of snapping back to
  // whatever ?tab= was in the address bar when the page first loaded.
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams(prev => {
      prev.set('tab', value);
      return prev;
    });
  };
  const [primaryContactName, setPrimaryContactName] = useState<string>('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState<string>('');
  const [secondaryContactName, setSecondaryContactName] = useState<string>('');
  const [profileHasChanges, setProfileHasChanges] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [triggerProfileSave, setTriggerProfileSave] = useState<(() => void) | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [tenantPhone, setTenantPhone] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [tgaLinked, setTgaLinked] = useState(false);

  const tenantIdNum = tenantId ? parseInt(tenantId) : null;
  const { count: messagesUnread, refresh: refreshMessagesUnread } = useClientMessagesUnread(tenantIdNum);
  
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

  // All client detail tabs, in priority order. As many as fit the available
  // width render directly; the rest collapse into a "More" menu - measured
  // dynamically (see tabsRowRef effect below) so widening the window (or
  // collapsing the sidebar) reveals more tabs instead of a fixed split.
  const incompletePackagesCount = packages.filter(p => !p.is_complete).length;
  const ALL_TABS = [
    { value: 'overview', icon: Building2, label: 'Overview' as React.ReactNode },
    { value: 'packages', icon: Package2, label: `Packages (${incompletePackagesCount})` as React.ReactNode },
    { value: 'documents', icon: FileText, label: 'Documents' as React.ReactNode },
    { value: 'users', icon: Users, label: `Users${userCount !== null ? ` (${userCount})` : ''}` as React.ReactNode },
    {
      value: 'notes', icon: StickyNote, label: 'Notes' as React.ReactNode,
      badge: (
        <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">
          <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />
          Internal
        </Badge>
      ),
    },
    { value: 'actions', icon: CheckSquare, label: 'Actions' as React.ReactNode },
    { value: 'audits', icon: ClipboardCheck, label: 'Audits' as React.ReactNode },
    { value: 'emails', icon: Mail, label: 'Emails' as React.ReactNode },
    {
      value: 'messages', icon: MessageSquare, label: 'Messages' as React.ReactNode,
      badge: messagesUnread > 0 ? (
        <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ED1878] text-white text-[10px] font-semibold leading-none">
          {messagesUnread > 9 ? '9+' : messagesUnread}
        </span>
      ) : null,
    },
    { value: 'sharepoint', icon: FolderOpen, label: 'Client Files' as React.ReactNode },
    { value: 'timeline', icon: Activity, label: 'Timeline' as React.ReactNode },
    { value: 'logins', icon: LogIn, label: 'Login History' as React.ReactNode },
    { value: 'integrations', icon: Link2, label: 'Integrations' as React.ReactNode },
    { value: 'time', icon: Clock, label: 'Time' as React.ReactNode },
  ];

  // A state-backed callback ref (rather than a plain useRef) so the
  // measurement effect below reliably reruns the moment this element
  // actually mounts - this page renders a loading skeleton in place of the
  // real tab strip until data arrives, so a plain ref could stay null
  // through the effect's first (and only, if its other deps happen not to
  // change at the same moment) run.
  const [tabsRowEl, setTabsRowEl] = useState<HTMLDivElement | null>(null);
  const tabMeasureRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const moreMeasureRef = useRef<HTMLButtonElement>(null);
  const moreActiveMeasureRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [visibleTabCount, setVisibleTabCount] = useState(ALL_TABS.length);

  useLayoutEffect(() => {
    if (!tabsRowEl) return;

    const GAP = 16; // matches gap-4 on the tab row

    const recompute = () => {
      const containerWidth = tabsRowEl.clientWidth;
      const widths = tabMeasureRefs.current.map((el) => el?.offsetWidth ?? 0);
      // The "More" trigger isn't always the short "More" label - when the
      // active tab is one of the overflow ones, it swaps in that tab's own
      // icon+label instead (e.g. "Login History"), which can be wider. Use
      // whichever is widest so the reserved budget never comes up short.
      const moreWidth = Math.max(
        moreMeasureRef.current?.offsetWidth ?? 90,
        ...moreActiveMeasureRefs.current.map((el) => el?.offsetWidth ?? 0),
      );

      // If every tab fits on its own, show them all - no need to reserve
      // room for "More" at all. Only once we know some tabs won't fit does
      // reserving moreWidth on every candidate become correct; reserving it
      // unconditionally (including on the case where nothing needs to
      // overflow) was leaving fitting tabs stranded behind "More" with dead
      // space next to it - the exact thing this fix exists to prevent.
      const fullTotal = widths.reduce((sum, w, i) => sum + w + (i > 0 ? GAP : 0), 0);
      if (fullTotal <= containerWidth) {
        setVisibleTabCount(widths.length);
        return;
      }

      let total = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const withThis = total + widths[i] + (i > 0 ? GAP : 0);
        if (withThis + GAP + moreWidth <= containerWidth) {
          total = withThis;
          count = i + 1;
        } else {
          break;
        }
      }
      setVisibleTabCount(count);
    };

    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(tabsRowEl);
    return () => resizeObserver.disconnect();
    // Re-measure whenever tab labels can change width (counts/badges change).
  }, [tabsRowEl, incompletePackagesCount, userCount, messagesUnread]);

  const visibleTabs = ALL_TABS.slice(0, visibleTabCount);
  const moreTabs = ALL_TABS.slice(visibleTabCount);
  const activeMoreTab = moreTabs.find((t) => t.value === activeTab);

  // Get user's role for this tenant
  const { isSuperAdmin: checkSuperAdmin, hasTenantAdmin } = useAuth();
  const isSuperAdminUser = checkSuperAdmin();
  const isTeamLeader = isVivacityStaffRole(authProfile?.unicorn_role);
  const canEdit = usePermission('clients.details.edit', 'limited');
  const canVerifyTga = isVivacityStaffRole(authProfile?.unicorn_role) || hasTenantAdmin(tenantIdNum || 0);

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

  useEffect(() => {
    if (!tenantIdNum || !profile?.rto_number) {
      setTgaLinked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: linkRow } = await supabase
        .from('tenant_registry_links')
        .select('link_status')
        .eq('tenant_id', tenantIdNum)
        .eq('registry', 'tga')
        .maybeSingle();
      if (!cancelled) {
        setTgaLinked(linkRow?.link_status === 'linked' && !!profile?.rto_number);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantIdNum, profile?.rto_number]);

  const fetchTenantBasic = async () => {
    if (!tenantIdNum) return;
    
    try {
      setLoading(true);
      const [{ data, error }, { data: tp }] = await Promise.all([
        supabase
          .from('tenants')
          .select('id, name, slug, status, complyhub_membership_tier, logo_path')
          .eq('id', tenantIdNum)
          .single(),
        supabase
          .from('tenant_profile')
          .select('phone1')
          .eq('tenant_id', tenantIdNum)
          .maybeSingle(),
      ]);

      if (error) throw error;
      setTenant(data);
      setLogoPath((data as any).logo_path || null);
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
      const [{ data: pcRow }, { data: scRow }] = await Promise.all([
        supabase
          .from('tenant_users')
          .select('user_id')
          .eq('tenant_id', tenantIdNum)
          .eq('relationship_role', 'primary_contact')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('tenant_users')
          .select('user_id')
          .eq('tenant_id', tenantIdNum)
          .eq('secondary_contact', true)
          .limit(1)
          .maybeSingle(),
      ]);

      await Promise.all([
        (async () => {
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
        })(),
        (async () => {
          if (scRow?.user_id) {
            const { data: scUser } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('user_uuid', scRow.user_id)
              .maybeSingle();
            if (scUser) setSecondaryContactName(`${scUser.first_name || ''} ${scUser.last_name || ''}`.trim());
          } else {
            setSecondaryContactName('');
          }
        })(),
      ]);
    } catch (err) {
      console.error('Error fetching primary contact:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card p-6 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <div className="flex gap-4 pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
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
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold">{tenant.name}</h1>
                  {canEdit && (
                    canRenameTenant(profile?.rto_number) ? (
                      <button
                        type="button"
                        onClick={() => setRenameOpen(true)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Rename organisation"
                        aria-label="Rename organisation"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : (
                      <span
                        className="text-muted-foreground"
                        title={`Name is managed by TGA (RTO ${profile?.rto_number}). Re-query TGA to change.`}
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </span>
                    )
                  )}
                  <TenantStatusDropdown
                    tenantId={tenantIdNum!}
                    currentStatus={tenant.status}
                    onStatusChange={(newStatus) => setTenant(prev => prev ? { ...prev, status: newStatus } : null)}
                    onNonActiveChange={(statusDescription) => {
                      const title = `** CLIENT ${statusDescription.toUpperCase()} **`;
                      setActiveTab('notes');
                      setSearchParams(prev => {
                        prev.set('tab', 'notes');
                        prev.set('initNote', 'true');
                        prev.set('noteTitle', title);
                        return prev;
                      });
                    }}
                    clientId={tenant.id.toString()}
                  />
                  <RiskLevelBadge
                    riskLevel={profile?.risk_level}
                    onUpdate={async (newLevel) => {
                      await saveProfile({ risk_level: newLevel });
                    }}
                    disabled={!canEdit}
                    onRiskChanged={(oldLevel, newLevel) => {
                      const title = `Risk level changed: ${oldLevel} → ${newLevel}`;
                      setActiveTab('notes');
                      setSearchParams(prev => {
                        prev.set('tab', 'notes');
                        prev.set('initNote', 'true');
                        prev.set('noteTitle', title);
                        return prev;
                      });
                    }}
                  />
                  <OrgTypeBadge orgType={profile?.org_type} rtoNumber={profile?.rto_number} cricosNumber={profile?.cricos_number} />
                  {tgaLinked && profile?.rto_number && (
                    <a
                      href={`https://training.gov.au/Organisation/Details/${profile.rto_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this RTO on training.gov.au"
                      className="inline-flex items-center shrink-0 whitespace-nowrap gap-1 rounded-full bg-muted hover:bg-muted/80 px-2 py-0.5 text-xs font-medium text-foreground border border-border transition-colors"
                    >
                      View on TGA <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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
                {secondaryContactName && (
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Secondary Contact: {secondaryContactName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <ViewAsClientButton
                tenantId={tenantIdNum!}
                tenantName={tenant.name}
              />
              {tenantIdNum && <ClientQuickNav currentTenantId={tenantIdNum} size="default" />}
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
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div ref={setTabsRowEl} className="flex items-center gap-4 min-w-0">
              <TabsList className="bg-transparent border-b-0 h-auto p-0 gap-4 min-w-0">
                {visibleTabs.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
                  >
                    <t.icon className="h-4 w-4 mr-2" />
                    {t.label}
                    {t.badge}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Overflow menu: whichever tabs don't fit the available width, so the
                  strip never scrolls or silently clips - see the width-measurement
                  effect above for how many tabs render directly vs. land here. */}
              {moreTabs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center gap-1.5 text-sm font-medium px-1 pb-3 rounded-none bg-transparent border-b-2 transition-colors shrink-0',
                        activeMoreTab
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {activeMoreTab ? (
                        <>
                          <activeMoreTab.icon className="h-4 w-4" />
                          {activeMoreTab.label}
                          {activeMoreTab.badge}
                        </>
                      ) : (
                        'More'
                      )}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {moreTabs.map((t) => (
                      <DropdownMenuItem key={t.value} onClick={() => handleTabChange(t.value)}>
                        <t.icon className="h-4 w-4 mr-2" />
                        {t.label}
                        {t.badge}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Hidden clones used only to measure each tab's natural rendered
                width - never shown, kept in sync with the real tab content above
                so the width-measurement effect stays accurate. */}
            <div aria-hidden className="absolute invisible h-0 overflow-hidden flex items-center gap-4 pointer-events-none">
              {ALL_TABS.map((t, i) => (
                <button
                  key={t.value}
                  ref={(el) => { tabMeasureRefs.current[i] = el; }}
                  type="button"
                  tabIndex={-1}
                  className="inline-flex items-center whitespace-nowrap text-sm font-medium px-1 pb-3"
                >
                  <t.icon className="h-4 w-4 mr-2" />
                  {t.label}
                  {t.badge}
                </button>
              ))}
              <button
                ref={moreMeasureRef}
                type="button"
                tabIndex={-1}
                className="flex items-center gap-1.5 text-sm font-medium px-1 pb-3"
              >
                More <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {/* One clone per tab, matching the "More" trigger's own markup exactly,
                  so its widest possible state (showing an active overflow tab's icon
                  + label instead of the plain "More" text) is also accounted for. */}
              {ALL_TABS.map((t, i) => (
                <button
                  key={`more-${t.value}`}
                  ref={(el) => { moreActiveMeasureRefs.current[i] = el; }}
                  type="button"
                  tabIndex={-1}
                  className="flex items-center gap-1.5 text-sm font-medium px-1 pb-3"
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                  {t.badge}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
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
              <TenantUsersPreviewCard tenantId={tenantIdNum!} onViewAll={() => handleTabChange('users')} />
            </div>

            {/* Related Organisations */}
            <TenantRelationships tenantId={tenantIdNum!} />

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
              onRefresh={refreshPackages}
              complyhubTier={tenant?.complyhub_membership_tier}
              autoExpandPackageInstanceId={searchParams.get('packageInstance') ? parseInt(searchParams.get('packageInstance')!, 10) : undefined}
              autoExpandStageInstanceId={searchParams.get('stageInstance') ? parseInt(searchParams.get('stageInstance')!, 10) : undefined}
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

          <TabsContent value="audits" className="mt-0">
            <ClientAuditsTab tenantId={tenantIdNum!} tenantName={tenant.name} />
          </TabsContent>

          <TabsContent value="emails" className="mt-0">
            <ClientEmailsTab tenantId={tenantIdNum!} clientName={tenant.name} />
          </TabsContent>

          <TabsContent value="messages" className="mt-0">
            <ClientMessagesTab tenantId={tenantIdNum!} clientName={tenant.name} onReadStateChange={refreshMessagesUnread} />
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

      <RenameTenantDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        tenantId={tenantIdNum!}
        currentName={tenant.name}
        rtoId={profile?.rto_number}
        onRenamed={(newName) => setTenant((prev) => (prev ? { ...prev, name: newName } : null))}
      />
    </div>
  );
}
