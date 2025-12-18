import { useState, useEffect, useMemo } from "react";
import { addYears, parse, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { AddStageDialog } from "@/components/AddStageDialog";
interface StageData {
  id: number;
  stage_name: string;
  short_name: string | null;
  stage_description: string | null;
  video_url: string | null;
  order_number: number | null;
  is_active: boolean;
  status?: string | null;
}
interface Stage {
  id: number;
  name: string;
  status: "In Progress" | "Overdue" | "Complete" | "Not Started";
  paymentStatus: "Paid" | "Unpaid" | "N/A";
  order_number: number;
  rawData: StageData;
}
interface TenantProgressTableProps {
  packageId?: number;
  tenantId?: number;
  packageName?: string;
  packageDate?: string;
  expiryDate?: string;
  documentCount?: number;
  memberCount?: number;
}
export default function TenantProgressTable({
  packageId,
  tenantId,
  packageName,
  packageDate,
  expiryDate,
  documentCount = 0,
  memberCount = 0
}: TenantProgressTableProps) {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageData | null>(null);
  const itemsPerPage = 8;

  // Calculate expiry date (1 year from package date) and check if expired
  const { calculatedExpiryDate, isExpired } = useMemo(() => {
    if (!packageDate) return { calculatedExpiryDate: null, isExpired: false };
    try {
      // Try parsing common date formats
      let parsedDate = parse(packageDate, 'dd/MM/yyyy', new Date());
      if (isNaN(parsedDate.getTime())) {
        // Fallback: try ISO format
        parsedDate = new Date(packageDate);
      }
      if (!isNaN(parsedDate.getTime())) {
        const expiry = addYears(parsedDate, 1);
        const now = new Date();
        return {
          calculatedExpiryDate: format(expiry, 'dd/MM/yyyy'),
          isExpired: expiry < now
        };
      }
    } catch {
      return { calculatedExpiryDate: null, isExpired: false };
    }
    return { calculatedExpiryDate: null, isExpired: false };
  }, [packageDate]);
  const fetchStages = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      // First, get the tenant's stage_ids array
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('stage_ids')
        .eq('id', tenantId)
        .single();
      
      if (tenantError) throw tenantError;
      
      const stageIds = tenantData?.stage_ids || [];
      
      if (stageIds.length === 0) {
        setStages([]);
        setLoading(false);
        return;
      }
      
      // Fetch stages from documents_stages table
      const { data, error } = await supabase
        .from('documents_stages')
        .select('id, title, short_name, description, video_url, status')
        .in('id', stageIds)
        .order('id', { ascending: true });
      
      if (error) throw error;
      
      const mappedStages: Stage[] = (data || []).map((stage: any, index: number) => ({
        id: index + 1,
        name: stage.title || 'Unnamed Stage',
        status: (stage.status as Stage["status"]) || "Not Started",
        paymentStatus: "N/A" as const,
        order_number: index + 1,
        rawData: {
          id: stage.id,
          stage_name: stage.title || '',
          short_name: stage.short_name,
          stage_description: stage.description,
          video_url: stage.video_url,
          order_number: index + 1,
          is_active: true,
          status: stage.status
        }
      }));
      setStages(mappedStages);
    } catch (error) {
      console.error('Error fetching stages:', error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchStages();
  }, [tenantId]);
  const handleRowClick = (stage: Stage) => {
    setSelectedStage(stage.rawData);
    setEditDialogOpen(true);
  };
  const handleEditSuccess = () => {
    fetchStages();
  };
  const totalPages = Math.ceil(stages.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visibleStages = stages.slice(startIndex, startIndex + itemsPerPage);
  const getStatusVariant = (status: Stage["status"]) => {
    switch (status) {
      case "In Progress":
        return "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200";
      case "Overdue":
        return "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
      case "Complete":
        return "bg-green-100 text-green-700 hover:bg-green-100 border-green-200";
      case "Not Started":
        return "bg-muted text-muted-foreground hover:bg-muted border-border";
      default:
        return "";
    }
  };
  if (loading) {
    return <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
          <h2 className="font-semibold text-foreground">Active Package</h2>
        </div>
        <CardContent className="p-6">
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>;
  }
  return <>
      <Card className="border-0 shadow-lg overflow-hidden">
        {/* Active Package Header */}
        <div className="bg-muted/30 px-6 py-3 border-b border-border/50 flex flex-col justify-center">
          <h2 className="font-semibold text-foreground">{packageName || 'Active Package'}</h2>
          <div className="flex items-center justify-between">
            {packageDate && <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />Added on {packageDate}</p>}
            <div className="flex items-center gap-3">
              {packageId && tenantId && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs h-7"
                  onClick={() => navigate(`/admin/package/${packageId}/tenant/${tenantId}`)}
                >
                  View Data
                </Button>
              )}
              {(expiryDate || calculatedExpiryDate) && <p className={`text-xs flex items-center gap-1 ${isExpired ? 'text-destructive' : 'text-primary'}`}><CalendarDays className="h-3 w-3" />{isExpired ? 'Expired' : 'Expires on'} {expiryDate || calculatedExpiryDate}</p>}
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {stages.length === 0 ? <div className="p-8 text-center text-muted-foreground">
              <p>No stages available for this package.</p>
            </div> : <>
              <Table>
                <TableHeader>
                  <TableRow className="border-b hover:bg-transparent">
                    <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r w-12 text-center">#</TableHead>
                    <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r min-w-[200px]">Stage Name</TableHead>
                    <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r">Status</TableHead>
                    <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r">Payment</TableHead>
                    <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStages.map(stage => <TableRow key={stage.rawData.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleRowClick(stage)}>
                      <TableCell className="border-r text-center">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                          <span className="text-xs font-semibold text-primary">{stage.id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium border-r">
                        <span className="text-sm text-foreground">{stage.name}</span>
                      </TableCell>
                      <TableCell className="border-r">
                        <Badge variant="outline" className={`text-xs font-medium px-2.5 py-1 ${getStatusVariant(stage.status)}`}>
                          {stage.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r">
                        <span className="text-sm text-muted-foreground">{stage.paymentStatus}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="link" size="sm" className="text-xs text-primary h-auto p-0 font-medium" onClick={e => {
                    e.stopPropagation();
                    handleRowClick(stage);
                  }}>
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>)}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {totalPages > 1 && <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
                  <span className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, stages.length)} of {stages.length} stages
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>}
            </>}
        </CardContent>
      </Card>

      <AddStageDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} onSuccess={handleEditSuccess} packageId={packageId} stageData={selectedStage} />
    </>;
}