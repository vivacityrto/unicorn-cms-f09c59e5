import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Layers, Archive, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
interface StageWithPackage {
  id: number;
  stage_name: string;
  created_at: string | null;
  package_id: number;
  package_name: string;
  package_full_text: string | null;
  order_number: number | null;
  document_count: number;
  is_active: boolean;
}
export function AllStagesTable() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<StageWithPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    fetchAllStages();
  }, []);
  const fetchAllStages = async () => {
    try {
      setLoading(true);

      // Fetch all stages with package info
      const {
        data: stagesData,
        error: stagesError
      } = await supabase.from('package_stages').select('id, stage_name, created_at, package_id, order_number, is_active').order('package_id').order('order_number');
      if (stagesError) throw stagesError;

      // Get unique package IDs
      const packageIds = [...new Set(stagesData?.map(s => s.package_id) || [])];

      // Fetch package names
      const {
        data: packagesData,
        error: packagesError
      } = await supabase.from('packages').select('id, name, full_text').in('id', packageIds);
      if (packagesError) throw packagesError;

      // Fetch document counts for each stage
      const stageIds = stagesData?.map(s => s.id) || [];
      const {
        data: documentCounts,
        error: docError
      } = await supabase.from('package_documents').select('stage_id').in('stage_id', stageIds);
      if (docError) throw docError;

      // Create maps
      const packageMap = new Map(packagesData?.map(p => [p.id, {
        name: p.name,
        full_text: p.full_text
      }]) || []);
      const docCountMap = new Map<number, number>();
      documentCounts?.forEach(doc => {
        if (doc.stage_id) {
          docCountMap.set(doc.stage_id, (docCountMap.get(doc.stage_id) || 0) + 1);
        }
      });

      // Format stages
      const formattedStages: StageWithPackage[] = (stagesData || []).map(stage => ({
        id: stage.id,
        stage_name: stage.stage_name || 'Unnamed Stage',
        created_at: stage.created_at,
        package_id: stage.package_id,
        package_name: packageMap.get(stage.package_id)?.name || 'Unknown Package',
        package_full_text: packageMap.get(stage.package_id)?.full_text || null,
        order_number: stage.order_number,
        document_count: docCountMap.get(stage.id) || 0,
        is_active: stage.is_active ?? true
      }));
      setStages(formattedStages);
    } catch (error) {
      console.error('Error fetching stages:', error);
    } finally {
      setLoading(false);
    }
  };
  const filteredStages = stages.filter(stage => stage.stage_name.toLowerCase().includes(searchQuery.toLowerCase()) || stage.package_name.toLowerCase().includes(searchQuery.toLowerCase()) || (stage.package_full_text?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false));
  if (loading) {
    return <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-96" />
      </div>;
  }
  return <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search stages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Stages Table */}
      {filteredStages.length === 0 ? <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Layers className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No stages found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {searchQuery ? "Try adjusting your search" : "Create stages within packages"}
            </p>
          </CardContent>
        </Card> : <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Stage Name</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Package</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Order</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Documents</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStages.map((stage, index) => <TableRow key={stage.id} onClick={() => navigate(`/admin/package/${stage.package_id}`)} className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 animate-fade-in cursor-pointer`}>
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        
                      <div>
                          <p className="font-semibold text-foreground pb-[5px]">{stage.stage_name}</p>
                          {stage.created_at && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(stage.created_at), 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[250px]">
                      <div className="flex items-center gap-2">
                        <Archive className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-foreground">{stage.package_name}</p>
                          {stage.package_full_text && <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {stage.package_full_text}
                            </p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center">
                      <span className="text-sm text-muted-foreground">
                        {stage.order_number ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center">
                      <Badge variant="outline" className="flex items-center gap-1.5 w-fit mx-auto bg-primary/5 border-primary/20 text-primary">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{stage.document_count}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="py-6 text-center">
                      <Badge variant={stage.is_active ? "default" : "secondary"} className="capitalize">
                        {stage.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}
    </div>;
}