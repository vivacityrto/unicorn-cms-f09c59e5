import { useState, useRef } from 'react';
import { useEvidenceRequests, useUploadEvidence } from '@/hooks/useEvidenceRequests';
import type { EvidenceRequest, EvidenceRequestItem } from '@/hooks/useEvidenceRequests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Search, ClipboardList, Calendar, User, Package, CheckCircle2, Clock, AlertCircle, Upload, FileText, Loader2 } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { CreateEvidenceRequestDialog } from '../dialogs/CreateEvidenceRequestDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface EvidenceRequestsTabProps {
  tenantId: number;
  isClientView?: boolean;
}

export function EvidenceRequestsTab({ tenantId, isClientView = false }: EvidenceRequestsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useEvidenceRequests(tenantId);

  const filteredRequests = requests.filter(req => 
    req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openRequests = filteredRequests.filter(r => r.status !== 'closed');
  const closedRequests = filteredRequests.filter(r => r.status === 'closed');

  const getStatusBadge = (request: EvidenceRequest) => {
    const isOverdue = request.due_date && isPast(new Date(request.due_date)) && request.status !== 'closed';
    
    if (isOverdue) {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Overdue</Badge>;
    }

    switch (request.status) {
      case 'received':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500 gap-1"><CheckCircle2 className="h-3 w-3" />Complete</Badge>;
      case 'partially_received':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500 gap-1"><Clock className="h-3 w-3" />In Progress</Badge>;
      case 'closed':
        return <Badge variant="secondary" className="gap-1">Closed</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Open</Badge>;
    }
  };

  const getProgress = (items: EvidenceRequestItem[] = []) => {
    if (items.length === 0) return 0;
    const completed = items.filter(i => i.status === 'received' || i.status === 'accepted').length;
    return Math.round((completed / items.length) * 100);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {!isClientView && (
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Request Evidence
          </Button>
        )}
      </div>

      {/* Open Requests */}
      {openRequests.length === 0 && closedRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No evidence requests</p>
            <p className="text-sm mt-1">
              {isClientView 
                ? 'Evidence requests from Vivacity will appear here.'
                : 'Create a request to collect documents from this client.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {openRequests.map((request) => (
            <EvidenceRequestCard
              key={request.id}
              request={request}
              tenantId={tenantId}
              isClientView={isClientView}
              isExpanded={expandedRequest === request.id}
              onToggle={() => setExpandedRequest(expandedRequest === request.id ? null : request.id)}
              getStatusBadge={getStatusBadge}
              getProgress={getProgress}
            />
          ))}

          {closedRequests.length > 0 && (
            <div className="pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Closed Requests</h3>
              <div className="space-y-3">
                {closedRequests.map((request) => (
                  <EvidenceRequestCard
                    key={request.id}
                    request={request}
                    tenantId={tenantId}
                    isClientView={isClientView}
                    isExpanded={expandedRequest === request.id}
                    onToggle={() => setExpandedRequest(expandedRequest === request.id ? null : request.id)}
                    getStatusBadge={getStatusBadge}
                    getProgress={getProgress}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <CreateEvidenceRequestDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
      />
    </div>
  );
}

interface EvidenceRequestCardProps {
  request: EvidenceRequest;
  tenantId: number;
  isClientView: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusBadge: (req: EvidenceRequest) => React.ReactNode;
  getProgress: (items: EvidenceRequestItem[]) => number;
}

function EvidenceRequestCard({ 
  request, 
  tenantId, 
  isClientView, 
  isExpanded, 
  onToggle,
  getStatusBadge,
  getProgress 
}: EvidenceRequestCardProps) {
  const progress = getProgress(request.items || []);
  const totalItems = request.items?.length || 0;
  const completedItems = request.items?.filter(i => i.status === 'received' || i.status === 'accepted').length || 0;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-lg">{request.title}</CardTitle>
                  {getStatusBadge(request)}
                </div>
                {request.description && (
                  <CardDescription className="mt-1 line-clamp-2">
                    {request.description}
                  </CardDescription>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                  {request.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Due {format(new Date(request.due_date), 'MMM d, yyyy')}
                    </span>
                  )}
                  {request.requester_name && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {request.requester_name}
                    </span>
                  )}
                  {request.package_name && (
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {request.package_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium">{completedItems}/{totalItems}</div>
                  <div className="text-xs text-muted-foreground">items</div>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            {totalItems > 0 && (
              <Progress value={progress} className="mt-4 h-2" />
            )}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="border-t pt-4 space-y-3">
              {(request.items || []).map((item) => (
                <EvidenceRequestItemRow
                  key={item.id}
                  item={item}
                  request={request}
                  tenantId={tenantId}
                  isClientView={isClientView}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface EvidenceRequestItemRowProps {
  item: EvidenceRequestItem;
  request: EvidenceRequest;
  tenantId: number;
  isClientView: boolean;
}

function EvidenceRequestItemRow({ item, request, tenantId, isClientView }: EvidenceRequestItemRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadEvidence = useUploadEvidence();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadEvidence.mutateAsync({
      tenantId,
      requestId: request.id,
      itemId: item.id,
      file,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getItemStatusIcon = () => {
    switch (item.status) {
      case 'accepted':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'received':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'rejected':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
      {getItemStatusIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{item.item_name}</span>
          {item.is_required && (
            <Badge variant="outline" className="text-xs">Required</Badge>
          )}
        </div>
        {item.guidance_text && (
          <p className="text-sm text-muted-foreground mt-0.5">{item.guidance_text}</p>
        )}
        {item.received_document && (
          <div className="flex items-center gap-2 mt-2 text-sm text-primary">
            <FileText className="h-3 w-3" />
            {item.received_document.file_name}
          </div>
        )}
        {item.review_notes && (
          <p className="text-sm text-amber-600 mt-1">{item.review_notes}</p>
        )}
      </div>
      {isClientView && item.status === 'pending' && request.status !== 'closed' && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept={item.accepted_file_types?.join(',') || undefined}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadEvidence.isPending}
            className="gap-2"
          >
            {uploadEvidence.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Upload
          </Button>
        </>
      )}
    </div>
  );
}
