import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  usePackageOverrides, 
  useStageImpact, 
  useSyncStageToPackages,
  OverrideItem,
  DiffSummary
} from '@/hooks/usePackageStageOverrides';
import { 
  RotateCcw, 
  Trash2, 
  Undo2, 
  GitCompare, 
  Users, 
  Mail, 
  FileText, 
  CheckSquare,
  ArrowRight,
  RefreshCw,
  Info,
  AlertTriangle
} from 'lucide-react';

interface StageDiffViewProps {
  packageId: number;
  stageId: number;
  stageName: string;
}

function DiffStatusBadge({ status }: { status: OverrideItem['diffStatus'] }) {
  const config = {
    inherited: { label: 'Inherited', className: 'bg-muted text-muted-foreground' },
    overridden: { label: 'Overridden', className: 'bg-amber-500/20 text-amber-700 border-amber-500/30' },
    deleted: { label: 'Deleted', className: 'bg-destructive/20 text-destructive border-destructive/30' },
    added: { label: 'Added', className: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' },
    modified: { label: 'Modified', className: 'bg-blue-500/20 text-blue-700 border-blue-500/30' }
  };

  const { label, className } = config[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function DiffSummaryBar({ summary }: { summary: DiffSummary }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{summary.inherited}</span> inherited
      </span>
      {summary.overridden > 0 && (
        <span className="text-amber-600">
          <span className="font-medium">{summary.overridden}</span> overridden
        </span>
      )}
      {summary.deleted > 0 && (
        <span className="text-destructive">
          <span className="font-medium">{summary.deleted}</span> deleted
        </span>
      )}
      {summary.added > 0 && (
        <span className="text-emerald-600">
          <span className="font-medium">{summary.added}</span> added
        </span>
      )}
    </div>
  );
}

function DiffItemRow({ 
  item, 
  onReset, 
  onDelete, 
  onRestore 
}: { 
  item: OverrideItem;
  onReset: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const hasTemplate = item.sourceId !== null;
  
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      item.isDeleted ? 'bg-destructive/5 border-destructive/20 opacity-60' : 'bg-card'
    }`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${item.isDeleted ? 'line-through' : ''}`}>
              {item.name}
            </span>
            <DiffStatusBadge status={item.diffStatus} />
          </div>
          
          {/* Show diff details for overridden items */}
          {item.diffStatus === 'overridden' && item.templateData && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
              <span className="bg-muted px-1.5 py-0.5 rounded">
                Template: {item.templateData.name}
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-700">
                Package: {item.packageData.name}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        {item.isDeleted ? (
          <Button variant="ghost" size="sm" onClick={onRestore}>
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Restore
          </Button>
        ) : (
          <>
            {hasTemplate && item.isOverride && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ContentSection({
  title,
  icon: Icon,
  items,
  onReset,
  onDelete,
  onRestore
}: {
  title: string;
  icon: React.ElementType;
  items: OverrideItem[];
  onReset: (item: OverrideItem) => void;
  onDelete: (item: OverrideItem) => void;
  onRestore: (item: OverrideItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No {title.toLowerCase()} configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <DiffItemRow
          key={item.id}
          item={item}
          onReset={() => onReset(item)}
          onDelete={() => onDelete(item)}
          onRestore={() => onRestore(item)}
        />
      ))}
    </div>
  );
}

export function StageDiffView({ packageId, stageId, stageName }: StageDiffViewProps) {
  const {
    teamTasks,
    clientTasks,
    emails,
    documents,
    diffSummary,
    loading,
    useOverrides,
    lastSyncedAt,
    refetch,
    resetItemToTemplate,
    softDeleteItem,
    restoreItem
  } = usePackageOverrides(packageId, stageId);

  const { packageCount, overrideCount } = useStageImpact(stageId);
  const { syncToPackages, syncing } = useSyncStageToPackages();
  const [activeTab, setActiveTab] = useState('team-tasks');

  const handleReset = async (item: OverrideItem) => {
    if (item.sourceId) {
      await resetItemToTemplate(item.type, item.id, item.sourceId);
    }
  };

  const handleDelete = async (item: OverrideItem) => {
    await softDeleteItem(item.type, item.id);
  };

  const handleRestore = async (item: OverrideItem) => {
    await restoreItem(item.type, item.id);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!useOverrides) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This stage uses the template content. Enable overrides to customize for this package.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Override Diff View</CardTitle>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refetch}
            disabled={syncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        <div className="flex items-center justify-between mt-3">
          <DiffSummaryBar summary={diffSummary} />
          {lastSyncedAt && (
            <span className="text-xs text-muted-foreground">
              Last synced: {new Date(lastSyncedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="team-tasks" className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Team ({teamTasks.length})
            </TabsTrigger>
            <TabsTrigger value="client-tasks" className="flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              Client ({clientTasks.length})
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              Emails ({emails.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Docs ({documents.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="team-tasks" className="m-0">
              <ContentSection
                title="Team Tasks"
                icon={Users}
                items={teamTasks}
                onReset={handleReset}
                onDelete={handleDelete}
                onRestore={handleRestore}
              />
            </TabsContent>

            <TabsContent value="client-tasks" className="m-0">
              <ContentSection
                title="Client Tasks"
                icon={CheckSquare}
                items={clientTasks}
                onReset={handleReset}
                onDelete={handleDelete}
                onRestore={handleRestore}
              />
            </TabsContent>

            <TabsContent value="emails" className="m-0">
              <ContentSection
                title="Emails"
                icon={Mail}
                items={emails}
                onReset={handleReset}
                onDelete={handleDelete}
                onRestore={handleRestore}
              />
            </TabsContent>

            <TabsContent value="documents" className="m-0">
              <ContentSection
                title="Documents"
                icon={FileText}
                items={documents}
                onReset={handleReset}
                onDelete={handleDelete}
                onRestore={handleRestore}
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}
