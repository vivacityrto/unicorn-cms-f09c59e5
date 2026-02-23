import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Package2, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  ChevronDown,
  Plus,
  PlayCircle,
  PauseCircle,
  Settings,
  Rocket,
  StickyNote,
  Timer,
  History,
  Archive,
  Database
} from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientManagement';
import { PackageStagesManager } from './PackageStagesManager';
import { PackageNotesSection } from './PackageNotesSection';
import { PackageTimeSection } from './PackageTimeSection';
import { StartPackageDialog } from './StartPackageDialog';
import { PackageDataManager } from './PackageDataManager';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNotes } from '@/hooks/useNotes';
import { supabase } from '@/integrations/supabase/client';

interface ClientPackagesTabProps {
  tenantId: number;
  tenantName?: string;
  packages: ClientPackage[];
  loading: boolean;
  onAddPackage?: () => void;
}

const STATE_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 border-green-500',
  at_risk: 'bg-amber-500/10 text-amber-600 border-amber-500',
  paused: 'bg-gray-500/10 text-gray-600 border-gray-500',
  exiting: 'bg-red-500/10 text-red-600 border-red-500',
  complete: 'bg-muted text-muted-foreground border-border'
};

const STATE_ICONS: Record<string, React.ReactNode> = {
  active: <PlayCircle className="h-3 w-3" />,
  at_risk: <AlertCircle className="h-3 w-3" />,
  paused: <PauseCircle className="h-3 w-3" />,
  exiting: <AlertCircle className="h-3 w-3" />,
  complete: <CheckCircle2 className="h-3 w-3" />
};

export function ClientPackagesTab({ tenantId, tenantName, packages, loading, onAddPackage }: ClientPackagesTabProps) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());
  const [startPackageOpen, setStartPackageOpen] = useState(false);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [packageNoteCounts, setPackageNoteCounts] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');

  const activePackages = packages.filter(p => !p.is_complete);
  const historyPackages = packages.filter(p => p.is_complete);
  const displayedPackages = viewMode === 'active' ? activePackages : historyPackages;

  // Fetch note counts for all package instances
  useEffect(() => {
    const fetchNoteCounts = async () => {
      if (packages.length === 0) return;
      
      // Convert string IDs to numbers for the query
      const packageInstanceIds = packages.map(p => parseInt(p.id, 10)).filter(id => !isNaN(id));
      const { data, error } = await supabase
        .from('notes')
        .select('parent_id')
        .eq('parent_type', 'package_instance')
        .in('parent_id', packageInstanceIds);
      
      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach(note => {
          const key = note.parent_id.toString();
          counts[key] = (counts[key] || 0) + 1;
        });
        setPackageNoteCounts(counts);
      }
    };
    
    fetchNoteCounts();
  }, [packages]);

  const togglePackage = (packageId: number) => {
    const newExpanded = new Set(expandedPackages);
    if (newExpanded.has(packageId)) {
      newExpanded.delete(packageId);
    } else {
      newExpanded.add(packageId);
    }
    setExpandedPackages(newExpanded);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No packages assigned</p>
          <p className="text-sm text-muted-foreground mb-4">
            This client doesn't have any packages yet.
          </p>
          {onAddPackage && isSuperAdmin() && (
            <Button onClick={onAddPackage}>
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with view toggle and buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button 
            variant={viewMode === 'active' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('active')}
          >
            <Package2 className="h-4 w-4 mr-1" />
            Active ({activePackages.length})
          </Button>
          <Button 
            variant={viewMode === 'history' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('history')}
          >
            <Archive className="h-4 w-4 mr-1" />
            History ({historyPackages.length})
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin() && viewMode === 'active' && (
            <Button onClick={() => setStartPackageOpen(true)}>
              <Rocket className="h-4 w-4 mr-2" />
              Start Package
            </Button>
          )}
          {onAddPackage && viewMode === 'active' && isSuperAdmin() && (
            <Button variant="outline" onClick={onAddPackage}>
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          )}
          {isSuperAdmin() && (
            <Button variant="outline" size="sm" onClick={() => setDataManagerOpen(true)}>
              <Database className="h-4 w-4 mr-2" />
              Data Manager
            </Button>
          )}
        </div>
      </div>

      {/* Package Data Manager Dialog */}
      <PackageDataManager
        open={dataManagerOpen}
        onOpenChange={setDataManagerOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onSuccess={() => {
          // Trigger a refresh if parent provides onAddPackage callback pattern
        }}
      />

      {/* Start Package Dialog */}
      <StartPackageDialog
        open={startPackageOpen}
        onOpenChange={setStartPackageOpen}
        tenantId={tenantId}
        tenantName={tenantName || 'Client'}
      />

      {/* Package Cards */}
      {displayedPackages.length === 0 && viewMode === 'history' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No package history</p>
            <p className="text-sm text-muted-foreground">
              Completed packages will appear here.
            </p>
          </CardContent>
        </Card>
      )}
      {displayedPackages.map((pkg) => {
        const isExpanded = expandedPackages.has(pkg.package_id);
        return (
          <Collapsible key={pkg.id} open={isExpanded} onOpenChange={() => togglePackage(pkg.package_id)}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Package Info */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <h3 className="font-semibold text-lg">{pkg.package_name}</h3>
                          {pkg.package_full_text && (
                            <span className="text-sm text-muted-foreground">— {pkg.package_full_text}</span>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant="outline"
                        className={`${STATE_COLORS[pkg.is_complete ? 'complete' : pkg.membership_state] || ''}`}
                      >
                        {STATE_ICONS[pkg.is_complete ? 'complete' : pkg.membership_state]}
                        <span className="ml-1 capitalize">{pkg.is_complete ? 'Complete' : pkg.membership_state}</span>
                      </Badge>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Started {new Date(pkg.membership_started_at).toLocaleDateString()}</span>
                      </div>
                      {pkg.is_complete && pkg.completed_at && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Completed {new Date(pkg.completed_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{pkg.hours_used.toFixed(2)}/{pkg.hours_included} hrs used</span>
                      </div>
                    </div>

                    {/* Stage Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Phase Progress</span>
                        <span className="font-medium">
                          {pkg.total_stages > 0 
                            ? `${pkg.completed_stages}/${pkg.total_stages} phases`
                            : 'No phases configured'}
                        </span>
                      </div>
                      {pkg.total_stages > 0 ? (
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(pkg.completed_stages / pkg.total_stages) * 100} 
                            className="h-2 flex-1" 
                          />
                          <span className="text-sm font-medium w-12 text-right">
                            {Math.round((pkg.completed_stages / pkg.total_stages) * 100)}%
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-600">
                          <AlertCircle className="h-4 w-4 inline mr-1" />
                          Phase tracking not configured for this package
                        </p>
                      )}
                    </div>

                    {/* Current Phase */}
                    {pkg.current_stage_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Current Phase:</span>
                        <Badge variant="secondary">{pkg.current_stage_name}</Badge>
                      </div>
                    )}

                    {/* Blocked Warning */}
                    {pkg.has_blocked_stages && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>Has blocked phases that need attention</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    {isSuperAdmin() && (
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Settings className="h-4 w-4" />
                          Manage
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/package/${pkg.package_id}/tenant/${tenantId}/instance/${pkg.id}`);
                      }}
                    >
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
              
              <CollapsibleContent>
                <div className="border-t">
                  <Tabs defaultValue="phases" className="w-full">
                    <div className="px-6 pt-4 bg-muted/30">
                      <TabsList>
                        <TabsTrigger value="phases" className="gap-1">
                          <Settings className="h-4 w-4" />
                          Phases
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="gap-1">
                          <StickyNote className="h-4 w-4" />
                          Notes
                          {packageNoteCounts[pkg.id] > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                              {packageNoteCounts[pkg.id]}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="time" className="gap-1">
                          <Timer className="h-4 w-4" />
                          Time Log
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="phases" className="mt-0">
                      <div className="px-6 pb-6 bg-muted/30">
                        <PackageStagesManager 
                          tenantId={tenantId} 
                          packageId={pkg.package_id} 
                          packageName={pkg.package_name}
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="notes" className="mt-0">
                      <div className="bg-muted/30">
                        <PackageNotesSection
                          tenantId={tenantId}
                          packageInstanceId={parseInt(pkg.id, 10)}
                          packageId={pkg.package_id}
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="time" className="mt-0">
                      <div className="bg-muted/30">
                        <PackageTimeSection
                          tenantId={tenantId}
                          clientId={tenantId}
                          packageId={pkg.package_id}
                          packageInstanceId={parseInt(pkg.id, 10)}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
