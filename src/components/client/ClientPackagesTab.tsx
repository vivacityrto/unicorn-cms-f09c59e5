import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
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
  Rocket
} from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientManagement';
import { PackageStagesManager } from './PackageStagesManager';
import { StartPackageDialog } from './StartPackageDialog';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

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
  exiting: 'bg-red-500/10 text-red-600 border-red-500'
};

const STATE_ICONS: Record<string, React.ReactNode> = {
  active: <PlayCircle className="h-3 w-3" />,
  at_risk: <AlertCircle className="h-3 w-3" />,
  paused: <PauseCircle className="h-3 w-3" />,
  exiting: <AlertCircle className="h-3 w-3" />
};

export function ClientPackagesTab({ tenantId, tenantName, packages, loading, onAddPackage }: ClientPackagesTabProps) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());
  const [startPackageOpen, setStartPackageOpen] = useState(false);

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
          {onAddPackage && (
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
      {/* Header with buttons */}
      <div className="flex justify-end gap-2">
        {isSuperAdmin() && (
          <Button onClick={() => setStartPackageOpen(true)}>
            <Rocket className="h-4 w-4 mr-2" />
            Start Package
          </Button>
        )}
        {onAddPackage && (
          <Button variant="outline" onClick={onAddPackage}>
            <Plus className="h-4 w-4 mr-2" />
            Add Package
          </Button>
        )}
      </div>

      {/* Start Package Dialog */}
      <StartPackageDialog
        open={startPackageOpen}
        onOpenChange={setStartPackageOpen}
        tenantId={tenantId}
        tenantName={tenantName || 'Client'}
      />

      {/* Package Cards */}
      {packages.map((pkg) => {
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
                        <div>
                          <h3 className="font-semibold text-lg">{pkg.package_name}</h3>
                          {pkg.package_full_text && (
                            <p className="text-sm text-muted-foreground">{pkg.package_full_text}</p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant="outline"
                        className={`${STATE_COLORS[pkg.membership_state] || ''}`}
                      >
                        {STATE_ICONS[pkg.membership_state]}
                        <span className="ml-1 capitalize">{pkg.membership_state}</span>
                      </Badge>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Started {new Date(pkg.membership_started_at).toLocaleDateString()}</span>
                      </div>
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
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Settings className="h-4 w-4" />
                        Phases
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/package/${pkg.package_id}/tenant/${tenantId}`);
                      }}
                    >
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
              
              <CollapsibleContent>
                <div className="px-6 pb-6 pt-0 border-t bg-muted/30">
                  <div className="pt-4">
                    <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Manage Phase States
                    </h4>
                    <PackageStagesManager 
                      tenantId={tenantId} 
                      packageId={pkg.package_id} 
                      packageName={pkg.package_name}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
