import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, Edit, History } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Fetch active VTO
  const { data: activeVto, isLoading } = useQuery({
    queryKey: ['eos-vto-active', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch all VTO versions
  const { data: vtoVersions } = useQuery({
    queryKey: ['eos-vto-versions', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading V/TO...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vision/Traction Organizer</h1>
          <p className="text-muted-foreground mt-2">
            Define your company's vision and track your path to traction
          </p>
        </div>
        <div className="flex gap-2">
          {activeVto && !isEditing && (
            <Button onClick={() => setIsEditing(true)} variant="default">
              <Edit className="h-4 w-4 mr-2" />
              Edit V/TO
            </Button>
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
          <TabsTrigger value="current">Current V/TO</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Version History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          {!activeVto && !isEditing ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold mb-2">No V/TO Created Yet</h3>
                <p className="text-muted-foreground mb-4 text-center max-w-md">
                  Create your first Vision/Traction Organizer to define your company's vision and track progress
                </p>
                <Button onClick={() => setIsEditing(true)}>
                  Create Your First V/TO
                </Button>
              </CardContent>
            </Card>
          ) : isEditing ? (
            <VtoEditor vto={activeVto} onCancel={() => setIsEditing(false)} />
          ) : (
            <VtoViewer vto={activeVto!} />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {vtoVersions && vtoVersions.length > 0 ? (
            <div className="grid gap-4">
              {vtoVersions.map((version) => (
                <Card key={version.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">V/TO</CardTitle>
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
