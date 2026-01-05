import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useClientProfile, useClientPackages } from '@/hooks/useClientManagement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  User, 
  Package2, 
  FileText, 
  Settings,
  Link2,
  StickyNote
} from 'lucide-react';
import { ClientProfileForm } from '@/components/client/ClientProfileForm';
import { ClientPackagesTab } from '@/components/client/ClientPackagesTab';
import { ClientIntegrationsTab } from '@/components/client/ClientIntegrationsTab';
import { ClientDocumentsTab } from '@/components/client/ClientDocumentsTab';

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
  const [cscUser, setCscUser] = useState<{ name: string; avatar: string | null } | null>(null);

  const tenantIdNum = tenantId ? parseInt(tenantId) : null;
  
  const { 
    profile, 
    registryLink, 
    loading: profileLoading, 
    saveProfile, 
    updateRegistryLink 
  } = useClientProfile(tenantIdNum);
  
  const { 
    packages, 
    loading: packagesLoading, 
    refreshPackages 
  } = useClientPackages(tenantIdNum);

  const isSuperAdmin = authProfile?.unicorn_role === 'Super Admin';
  const isTeamLeader = authProfile?.unicorn_role === 'Team Leader';
  const canEdit = isSuperAdmin || isTeamLeader;

  useEffect(() => {
    if (tenantIdNum) {
      fetchTenantBasic();
      fetchCscUser();
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

  const fetchCscUser = async () => {
    if (!tenantIdNum) return;

    const { data: connection } = await supabase
      .from('connected_tenants')
      .select('user_uuid')
      .eq('tenant_id', tenantIdNum)
      .maybeSingle();

    if (connection?.user_uuid) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name, avatar_url')
        .eq('user_uuid', connection.user_uuid)
        .single();

      if (user) {
        setCscUser({
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          avatar: user.avatar_url
        });
      }
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
                </div>
                <p className="text-muted-foreground mt-1">/{tenant.slug}</p>
                
                {/* CSC Assignment */}
                {cscUser && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground">CSC:</span>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={cscUser.avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {cscUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{cscUser.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{packages.length}</p>
                <p className="text-xs text-muted-foreground">Packages</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
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
              value="notes"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
              onClick={() => navigate(`/tenant/${tenantId}/notes`)}
            >
              <StickyNote className="h-4 w-4 mr-2" />
              Notes
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

      {/* Tab Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="overview" className="mt-0">
            {canEdit ? (
              <ClientProfileForm
                profile={profile}
                onSave={saveProfile}
                loading={profileLoading}
              />
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
              packages={packages}
              loading={packagesLoading}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <ClientDocumentsTab
              tenantId={tenantIdNum!}
              packages={packages}
            />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0">
            <ClientIntegrationsTab
              profile={profile}
              registryLink={registryLink}
              onUpdateLink={updateRegistryLink}
              loading={profileLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
