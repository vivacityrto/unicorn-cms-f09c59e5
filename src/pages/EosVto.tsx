import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useRBAC } from '@/hooks/useRBAC';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Eye, Edit, History, Target } from 'lucide-react';
import { VtoEditor } from '@/components/eos/VtoEditor';
import { VtoViewer } from '@/components/eos/VtoViewer';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function EosVto() {
  return (
    <DashboardLayout>
      <VtoContent />
    </DashboardLayout>
  );
}

function VtoContent() {
  const { profile } = useAuth();
  const { canEditVTO } = useRBAC();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Fetch active VTO (most recently updated) - EOS is Vivacity-internal only
  const { data: activeVto, isLoading } = useQuery({
    queryKey: ['eos-vto-active', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Fetch all VTO versions - EOS is Vivacity-internal only
  const { data: vtoVersions } = useQuery({
    queryKey: ['eos-vto-versions', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Mission Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" />
            Superhero Mission Control
          </h1>
          <p className="text-lg text-muted-foreground mt-1">
            12 Month Strategic Plan
          </p>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            This page defines Vivacity's mission, direction, and execution priorities. 
            It aligns strategy, revenue targets, and delivery focus across the next 12 months.
          </p>
        </div>
        <div className="flex gap-2">
          {activeVto && !isEditing && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button 
                      onClick={() => setIsEditing(true)} 
                      variant="default"
                      disabled={!canEditVTO()}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Plan
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canEditVTO() && (
                  <TooltipContent>
                    Editing Mission Control requires Admin access.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          {isEditing && (
            <Button onClick={() => setIsEditing(false)} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              View Mode
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="current" className="w-full">
        <TabsList>
          <TabsTrigger value="current">Current Plan</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Version History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          {!activeVto && !isEditing ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Mission Control Created Yet</h3>
                <p className="text-muted-foreground mb-4 text-center max-w-md">
                  {canEditVTO() 
                    ? "Create your strategic plan to define Vivacity's mission, direction, and execution priorities."
                    : "No strategic plan has been created yet. Contact your administrator to set one up."}
                </p>
                {canEditVTO() && (
                  <Button onClick={() => setIsEditing(true)}>
                    Create Mission Control
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : isEditing && canEditVTO() ? (
            <VtoEditor vto={activeVto} onCancel={() => setIsEditing(false)} />
          ) : (
            <VtoViewer vto={activeVto!} />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {vtoVersions && vtoVersions.filter(v => v.id !== activeVto?.id).length > 0 ? (
            <div className="grid gap-4">
              {vtoVersions.filter(v => v.id !== activeVto?.id).map((version) => (
                <Card key={version.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Mission Control</CardTitle>
                        <CardDescription>
                          Last updated {new Date(version.updated_at || version.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No version history yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
