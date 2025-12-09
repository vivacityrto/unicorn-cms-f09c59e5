import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Users, CheckCircle2, FileText, Plus, Search, ArrowUpDown, Trash2, Edit, Calendar, Layers, GripVertical, UserPlus, Building2, MapPin, Hash } from "lucide-react";
import { AddTenantDialog } from "@/components/AddTenantDialog";
import { AddStageDialog } from "@/components/AddStageDialog";
import { AddStaffTaskDialog } from "@/components/AddStaffTaskDialog";
import { AddClientTaskDialog } from "@/components/AddClientTaskDialog";
import { EditPackageDialog } from "@/components/EditPackageDialog";
import { CreateDocumentDialog2 } from "@/components/CreateDocumentDialog2";
import { AddExistingDocumentDialog } from "@/components/AddExistingDocumentDialog";
import { AddExistingStageDialog } from "@/components/AddExistingStageDialog";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
interface PackageInfo {
  id: number;
  name: string;
  slug: string | null;
  full_text: string | null;
  details: string | null;
  status: string;
  created_at: string;
  duration_months?: number | null;
}
interface TenantData {
  id: number;
  name: string;
  status: string;
  created_at: string;
  user_count?: number;
  package_id?: number | null;
}
interface StageData {
  id: number;
  package_id: number;
  stage_name: string;
  short_name: string | null;
  stage_description: string | null;
  video_url: string | null;
  order_number: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SortableRowProps {
  stage: StageData;
  index: number;
  onSelect: (stage: StageData) => void;
  onEdit: (stage: StageData) => void;
  onDelete: (id: number) => void;
}

const SortableRow = ({ stage, index, onSelect, onEdit, onDelete }: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn("cursor-pointer hover:bg-muted/50 transition-colors", isDragging && "z-50")}
      onClick={() => onSelect(stage)}
    >
      <TableCell className="font-medium text-muted-foreground border-r w-20">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {index + 1}
        </div>
      </TableCell>
      <TableCell className="font-medium border-r">{stage.stage_name}</TableCell>
      <TableCell className="border-r">{stage.short_name || "-"}</TableCell>
      <TableCell className="border-r max-w-md truncate">{stage.stage_description || "-"}</TableCell>
      <TableCell className="border-r">
        <Badge variant={stage.is_active ? "default" : "secondary"}>
          {stage.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(stage);
            }}
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(stage.id);
            }}
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const PackageDetail = () => {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [activeTenants, setActiveTenants] = useState<TenantData[]>([]);
  const [allTenants, setAllTenants] = useState<TenantData[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantData[]>([]);
  const [stages, setStages] = useState<StageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageSearchQuery, setStageSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"name" | "status" | "created_at">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantData[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<number>>(new Set());
  const [addTenantSearch, setAddTenantSearch] = useState("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmTenantData, setConfirmTenantData] = useState<{
    tenantId: string;
    packageName: string;
  } | null>(null);
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [isEditStageDialogOpen, setIsEditStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<StageData | null>(null);
  const [isStaffTaskDialogOpen, setIsStaffTaskDialogOpen] = useState(false);
  const [isClientTaskDialogOpen, setIsClientTaskDialogOpen] = useState(false);
  const [isEditPackageDialogOpen, setIsEditPackageDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageData | null>(null);
  const [staffTasks, setStaffTasks] = useState<any[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);
  const [editingStaffTask, setEditingStaffTask] = useState<any | null>(null);
  const [editingClientTask, setEditingClientTask] = useState<any | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<any | null>(null);
  const [isAddExistingDocDialogOpen, setIsAddExistingDocDialogOpen] = useState(false);
  const [isAddExistingStageDialogOpen, setIsAddExistingStageDialogOpen] = useState(false);
  const [isSetupClientDialogOpen, setIsSetupClientDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<TenantData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((stage) => stage.id === active.id);
      const newIndex = stages.findIndex((stage) => stage.id === over.id);

      const reorderedStages = arrayMove(stages, oldIndex, newIndex);
      setStages(reorderedStages);

      // Update order_number in database
      try {
        const updates = reorderedStages.map((stage, index) => ({
          id: stage.id,
          order_number: index + 1,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('package_stages')
            .update({ order_number: update.order_number })
            .eq('id', update.id);

          if (error) throw error;
        }

        toast({
          title: "Success",
          description: "Stage order updated successfully",
        });
      } catch (error: any) {
        console.error("Error updating stage order:", error);
        toast({
          title: "Error",
          description: "Failed to update stage order",
          variant: "destructive",
        });
        // Revert on error
        fetchPackageData();
      }
    }
  };
  
  useEffect(() => {
    if (id) {
      fetchPackageData();
      fetchAvailableTenants();
    }
  }, [id]);
  useEffect(() => {
    applyFiltersAndSort();
  }, [allTenants, searchQuery, sortField, sortDirection, statusFilter]);
  const applyFiltersAndSort = () => {
    let filtered = [...allTenants];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(tenant => tenant.name?.toLowerCase().includes(searchQuery.toLowerCase()) || tenant.id?.toString().includes(searchQuery));
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(tenant => tenant.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === "created_at") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    setFilteredTenants(filtered);
  };
  const toggleSort = (field: "name" | "status" | "created_at") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  const fetchAvailableTenants = async () => {
    try {
      // Fetch all tenants, then filter out those that already have this package
      const {
        data,
        error
      } = await supabase.from("tenants").select("id, name, status, created_at, package_id, package_ids").order("name");
      if (error) throw error;
      
      // Filter out tenants that already have this package in their package_ids array
      const filtered = (data || []).filter(tenant => {
        const packageIds = tenant.package_ids || [];
        return !packageIds.includes(Number(id));
      });
      
      setAvailableTenants(filtered);
    } catch (error: any) {
      console.error("Error fetching available tenants:", error);
    }
  };
  const handleAddTenant = async () => {
    if (!selectedTenantId) {
      toast({
        title: "Error",
        description: "Please select a tenant",
        variant: "destructive"
      });
      return;
    }

    // Check if tenant already has a package
    const selectedTenant = availableTenants.find(t => t.id.toString() === selectedTenantId);
    if (selectedTenant?.package_id) {
      // Fetch the package name
      const {
        data: packageData,
        error: packageError
      } = await supabase.from("packages").select("name").eq("id", selectedTenant.package_id).single();
      if (!packageError && packageData) {
        setConfirmTenantData({
          tenantId: selectedTenantId,
          packageName: packageData.name
        });
        setIsConfirmDialogOpen(true);
        return;
      }
    }

    // If no existing package, proceed directly
    await proceedWithAddTenant(selectedTenantId);
  };
  const proceedWithAddTenant = async (tenantId: string) => {
    try {
      // Use the RPC function to add package to tenant (supports multiple packages)
      const { error } = await supabase.rpc('add_package_to_tenant', {
        p_tenant_id: Number(tenantId),
        p_package_id: Number(id)
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Tenant added to package successfully"
      });
      setIsAddDialogOpen(false);
      setIsConfirmDialogOpen(false);
      setSelectedTenantId("");
      setConfirmTenantData(null);
      fetchPackageData();
      fetchAvailableTenants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleRemoveSelectedTenants = async () => {
    if (selectedTenantIds.size === 0) return;
    try {
      const {
        error
      } = await supabase.from("tenants").update({
        package_id: null
      }).in("id", Array.from(selectedTenantIds));
      if (error) throw error;
      toast({
        title: "Success",
        description: `${selectedTenantIds.size} tenant(s) removed from package`
      });
      setSelectedTenantIds(new Set());
      fetchPackageData();
      fetchAvailableTenants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const toggleTenantSelection = (tenantId: number) => {
    setSelectedTenantIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tenantId)) {
        newSet.delete(tenantId);
      } else {
        newSet.add(tenantId);
      }
      return newSet;
    });
  };
  const handleDeleteStage = async (stageId: number) => {
    try {
      const {
        error
      } = await supabase.from("package_stages").delete().eq("id", stageId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Stage deleted successfully"
      });
      fetchPackageData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const fetchStaffTasks = async (stageId: number) => {
    try {
      const {
        data,
        error
      } = await supabase.from("package_staff_tasks").select("*").eq("package_id", Number(id)).eq("stage_id", stageId).order("order_number");
      if (error) throw error;
      setStaffTasks(data || []);
    } catch (error: any) {
      console.error("Error fetching staff tasks:", error);
    }
  };
  const fetchClientTasks = async (stageId: number) => {
    try {
      const {
        data,
        error
      } = await supabase.from("package_client_tasks").select("*").eq("package_id", Number(id)).eq("stage_id", stageId).order("order_number");
      if (error) throw error;
      setClientTasks(data || []);
    } catch (error: any) {
      console.error("Error fetching client tasks:", error);
    }
  };
  const fetchDocuments = async (stageId: number) => {
    try {
      const {
        data,
        error
      } = await supabase.from("package_documents").select("*").eq("package_id", Number(id)).eq("stage_id", stageId).order("order_number");
      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
    }
  };
  const handleStageSelect = (stage: StageData) => {
    setSelectedStage(stage);
    fetchStaffTasks(stage.id);
    fetchClientTasks(stage.id);
    fetchDocuments(stage.id);
  };
  const handleStaffTaskSuccess = () => {
    if (selectedStage) {
      fetchStaffTasks(selectedStage.id);
    }
    setEditingStaffTask(null);
    setIsStaffTaskDialogOpen(false);
  };
  const handleClientTaskSuccess = () => {
    if (selectedStage) {
      fetchClientTasks(selectedStage.id);
    }
    setEditingClientTask(null);
    setIsClientTaskDialogOpen(false);
  };
  const handleDocumentSuccess = () => {
    if (selectedStage) {
      fetchDocuments(selectedStage.id);
    }
    setEditingDocument(null);
    setIsDocumentDialogOpen(false);
  };
  const fetchPackageData = async () => {
    try {
      setIsLoading(true);

      // Fetch package info with all fields
      const {
        data: pkgData,
        error: pkgError
      } = await supabase.from("packages").select("id, name, slug, full_text, details, status, created_at, duration_months").eq("id", Number(id)).single();
      if (pkgError) throw pkgError;
      setPackageInfo(pkgData);

      // Fetch stages for this package
      const {
        data: stagesData,
        error: stagesError
      } = await supabase.from("package_stages").select("*").eq("package_id", Number(id)).order("order_number");
      if (stagesError) throw stagesError;
      setStages((stagesData || []) as StageData[]);

      // Fetch tenants for this package (check package_ids array)
      const {
        data: tenantsData,
        error: tenantsError
      } = await supabase.from("tenants").select("id, name, status, created_at").contains("package_ids", [Number(id)]).order("name");
      if (tenantsError) throw tenantsError;
      console.log("Tenants for package", id, ":", tenantsData);

      // For each tenant, count users
      const tenantsWithCounts = await Promise.all((tenantsData || []).map(async (tenant: any) => {
        const {
          count,
          error: countError
        } = await supabase.from("users").select("user_uuid", {
          count: "exact",
          head: true
        }).eq("tenant_id", tenant.id);
        if (countError) {
          console.error(`Error counting users for tenant ${tenant.id}:`, countError);
        }
        return {
          ...tenant,
          user_count: count || 0
        };
      }));

      // Split into active and all tenants
      const active = tenantsWithCounts.filter((t: any) => t.status === "active");
      setActiveTenants(active);
      setAllTenants(tenantsWithCounts);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  if (isLoading) {
    return <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>;
  }
  if (!packageInfo) {
    return <div className="p-6 text-center">
        <h2 className="text-2xl font-bold">Package not found</h2>
        <Button onClick={() => navigate("/manage-packages")} className="mt-4">
          Back to Packages
        </Button>
      </div>;
  }
  return <div className="p-6 space-y-6 animate-fade-in">
      {/* Header - Back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
        boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
        border: "1px solid #00000052"
      }}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setIsSetupClientDialogOpen(true)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
            <UserPlus className="h-4 w-4" />
            Setup Client
          </Button>
          <Button variant="ghost" onClick={() => setIsEditPackageDialogOpen(true)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
            <Edit className="h-4 w-4" />
            Edit Package
          </Button>
        </div>
      </div>

      {/* Selected Client Card */}
      {selectedClient && (
        <Card className="border-0 shadow-lg overflow-hidden bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedClient.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5" />
                      ID: {selectedClient.id}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(selectedClient.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={selectedClient.status === "active" ? "default" : "secondary"}>
                  {selectedClient.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClient(null)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package Header */}
      

      {/* Overview Section */}
      <div className="mb-20">
        {packageInfo.details && <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">{packageInfo.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Created {new Date(packageInfo.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Badge variant={packageInfo.status === "active" ? "default" : "secondary"}>
                  {packageInfo.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                
                <p className="whitespace-pre-wrap">{packageInfo.details}</p>
              </div>
            </CardContent>
          </Card>}
        {!packageInfo.details && <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground italic">No details available</p>
            </CardContent>
          </Card>}

        {/* Modern Separator */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/30"></div>
          </div>
          <div className="relative flex justify-center">
            <div className="bg-background px-4">
              <div className="h-1 w-1 rounded-full bg-primary/20"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Stages Section - Hidden when stage is selected */}
      {!selectedStage && <div className="space-y-4 animate-fade-in">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">Stages</h3>
                  {packageInfo.full_text && <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      {packageInfo.full_text}
                    </p>}
                </div>
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search stages..." value={stageSearchQuery} onChange={e => setStageSearchQuery(e.target.value)} className="pl-10 h-10" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
                    boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
                    border: "1px solid #00000052"
                  }} onClick={() => setIsAddExistingStageDialogOpen(true)}>
                    <Layers className="h-4 w-4" />
                    Existing
                  </Button>
                  <Button className="gap-2" onClick={() => setIsStageDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add Stage
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <GripVertical className="h-4 w-4" />
                Drag to reorder stages
              </p>

              <Card className="border shadow-sm bg-white">
                <CardContent className="p-0">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 hover:bg-transparent">
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-20">
                            Order
                          </TableHead>
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                            Stage Name
                          </TableHead>
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                            Short Name
                          </TableHead>
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                            Description
                          </TableHead>
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap">
                            Status
                          </TableHead>
                          <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={stages.filter(stage => stageSearchQuery === "" || stage.stage_name.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.short_name?.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.stage_description?.toLowerCase().includes(stageSearchQuery.toLowerCase())).map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stages.filter(stage => stageSearchQuery === "" || stage.stage_name.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.short_name?.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.stage_description?.toLowerCase().includes(stageSearchQuery.toLowerCase())).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                {stageSearchQuery ? "No stages match your search" : "No stages have been added to this package yet."}
                              </TableCell>
                            </TableRow>
                          ) : (
                            stages
                              .filter(stage => stageSearchQuery === "" || stage.stage_name.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.short_name?.toLowerCase().includes(stageSearchQuery.toLowerCase()) || stage.stage_description?.toLowerCase().includes(stageSearchQuery.toLowerCase()))
                              .map((stage, index) => (
                                <SortableRow
                                  key={stage.id}
                                  stage={stage}
                                  index={index}
                                  onSelect={handleStageSelect}
                                  onEdit={(stage) => {
                                    setEditingStage(stage);
                                    setIsEditStageDialogOpen(true);
                                  }}
                                  onDelete={handleDeleteStage}
                                />
                              ))
                          )}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
            </CardContent>
          </Card>
            </CardContent>
          </Card>
        </div>}

      {/* Stage Details - Shown when a stage is selected */}
      {selectedStage && <div className="animate-fade-in">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b-2 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold pb-[5px]" style={{ fontSize: '17px' }}>{selectedStage.stage_name}</h2>
                    <p className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Created {new Date(selectedStage.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => setSelectedStage(null)} className="gap-2 bg-white hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
                boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
                border: "1px solid #00000052"
              }}>
                    <ArrowLeft className="h-4 w-4" />
                    Back to Stages
                  </Button>
                </div>
              </div>

              <div className="p-6">
                <Tabs defaultValue="staff-tasks" className="space-y-6">
            <TabsList className="flex gap-2 bg-transparent h-auto p-0 mb-4">
              <TabsTrigger value="staff-tasks" className="h-10 px-4 py-2 gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black data-[state=active]:bg-[hsl(196deg_100%_93.53%)] data-[state=active]:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
                Staff Tasks
              </TabsTrigger>
              <TabsTrigger value="client-tasks" className="h-10 px-4 py-2 gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black data-[state=active]:bg-[hsl(196deg_100%_93.53%)] data-[state=active]:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
                Client Tasks
              </TabsTrigger>
              <TabsTrigger value="documents" className="h-10 px-4 py-2 gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black data-[state=active]:bg-[hsl(196deg_100%_93.53%)] data-[state=active]:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="staff-tasks" className="space-y-4">
              <div className="flex justify-end">
                <Button className="gap-2" onClick={() => setIsStaffTaskDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Staff Task
                </Button>
              </div>
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 hover:bg-transparent">
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-20">
                          Order
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Task Name
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Description
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Due Date
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-24">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffTasks.length === 0 ? <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            No staff tasks have been added yet.
                          </TableCell>
                        </TableRow> : staffTasks.map((task, index) => <TableRow key={task.id}>
                            <TableCell className="font-medium text-muted-foreground border-r">{index + 1}</TableCell>
                            <TableCell className="font-medium border-r">{task.name}</TableCell>
                            <TableCell className="border-r max-w-md truncate">{task.description || "-"}</TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">
                                  {task.due_date_offset ? `Due in ${task.due_date_offset} days` : "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          setEditingStaffTask(task);
                          setIsStaffTaskDialogOpen(true);
                        }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={async () => {
                          if (confirm("Are you sure you want to delete this staff task?")) {
                            const {
                              error
                            } = await supabase.from("package_staff_tasks").delete().eq("id", task.id);
                            if (error) {
                              toast({
                                title: "Error",
                                description: "Failed to delete staff task",
                                variant: "destructive"
                              });
                            } else {
                              toast({
                                title: "Success",
                                description: "Staff task deleted successfully"
                              });
                              fetchStaffTasks(selectedStage.id);
                            }
                          }
                        }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="client-tasks" className="space-y-4">
              <div className="flex justify-end">
                <Button className="gap-2" onClick={() => setIsClientTaskDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Client Task
                </Button>
              </div>
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 hover:bg-transparent">
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-20">
                          Order
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Task Name
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Description
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Due Date
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-24">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientTasks.length === 0 ? <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            No client tasks have been added yet.
                          </TableCell>
                        </TableRow> : clientTasks.map((task, index) => <TableRow key={task.id}>
                            <TableCell className="font-medium text-muted-foreground border-r">{index + 1}</TableCell>
                            <TableCell className="font-medium border-r">{task.name}</TableCell>
                            <TableCell className="border-r max-w-md truncate">{task.description || "-"}</TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">
                                  {task.due_date_offset ? `Due in ${task.due_date_offset} days` : "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          setEditingClientTask(task);
                          setIsClientTaskDialogOpen(true);
                        }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={async () => {
                          if (confirm("Are you sure you want to delete this client task?")) {
                            const {
                              error
                            } = await supabase.from("package_client_tasks").delete().eq("id", task.id);
                            if (error) {
                              toast({
                                title: "Error",
                                description: "Failed to delete client task",
                                variant: "destructive"
                              });
                            } else {
                              toast({
                                title: "Success",
                                description: "Client task deleted successfully"
                              });
                              fetchClientTasks(selectedStage.id);
                            }
                          }
                        }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
                  boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
                  border: "1px solid #00000052"
                }} onClick={() => setIsAddExistingDocDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Existing
                </Button>
                <Button className="gap-2" onClick={() => setIsDocumentDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Document
                </Button>
              </div>
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 hover:bg-transparent">
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-20">
                          Order
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Document Name
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Description
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                          Status
                        </TableHead>
                        <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-24">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.length === 0 ? <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            No documents have been added yet.
                          </TableCell>
                        </TableRow> : documents.map((doc, index) => <TableRow key={doc.id}>
                            <TableCell className="font-medium text-muted-foreground border-r">{index + 1}</TableCell>
                            <TableCell className="font-medium border-r">{doc.document_name}</TableCell>
                            <TableCell className="border-r max-w-md truncate">{doc.description || "-"}</TableCell>
                            <TableCell className="border-r">
                              <Badge variant={doc.is_active ? "default" : "secondary"}>
                                {doc.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          setEditingDocument(doc);
                          setIsDocumentDialogOpen(true);
                        }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={async () => {
                          if (confirm("Are you sure you want to delete this document?")) {
                            const {
                              error
                            } = await supabase.from("package_documents").delete().eq("id", doc.id);
                            if (error) {
                              toast({
                                title: "Error",
                                description: "Failed to delete document",
                                variant: "destructive"
                              });
                            } else {
                              toast({
                                title: "Success",
                                description: "Document deleted successfully"
                              });
                              fetchDocuments(selectedStage.id);
                            }
                          }
                        }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>}

      {/* Add Tenant Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Tenant to Package</DialogTitle>
            <DialogDescription>Search and select a tenant to add to this package</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 w-[94%]">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tenants by name or ID..." value={addTenantSearch} onChange={e => setAddTenantSearch(e.target.value)} className="pl-10 w-full" />
            </div>

            {/* Scrollable Tenant List */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                {availableTenants.filter(tenant => addTenantSearch === "" || tenant.name.toLowerCase().includes(addTenantSearch.toLowerCase()) || tenant.id.toString().includes(addTenantSearch)).map(tenant => <div key={tenant.id} onClick={() => setSelectedTenantId(tenant.id.toString())} className={cn("p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-b-0", selectedTenantId === tenant.id.toString() && "bg-primary/10 hover:bg-primary/15")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{tenant.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            ID: {tenant.id} • Status: {tenant.status}
                            {tenant.package_id && ` • Currently in package #${tenant.package_id}`}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs shrink-0", tenant.status === "active" ? "border-green-500 text-green-600" : "border-muted text-muted-foreground")}>
                          {tenant.status}
                        </Badge>
                      </div>
                    </div>)}

                {availableTenants.filter(tenant => addTenantSearch === "" || tenant.name.toLowerCase().includes(addTenantSearch.toLowerCase()) || tenant.id.toString().includes(addTenantSearch)).length === 0 && <div className="p-8 text-center text-muted-foreground">
                    {addTenantSearch ? "No tenants match your search" : "No available tenants found"}
                  </div>}
              </div>
            </div>
          </div>

          <DialogFooter className="w-[94%]">
            <Button variant="outline" onClick={() => {
            setIsAddDialogOpen(false);
            setSelectedTenantId("");
            setAddTenantSearch("");
          }}>
              Cancel
            </Button>
            <Button onClick={handleAddTenant} disabled={!selectedTenantId}>
              Add Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Package Addition */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="mt-[12px]">Add Tenant to Package</DialogTitle>
            <DialogDescription className="pt-[30px]">
              This tenant is already linked to <strong>{confirmTenantData?.packageName}</strong>. 
              The tenant will be added to this package as well.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
            setIsConfirmDialogOpen(false);
            setConfirmTenantData(null);
          }}>
              Cancel
            </Button>
            <Button onClick={() => {
            if (confirmTenantData) {
              proceedWithAddTenant(confirmTenantData.tenantId);
            }
          }}>
              Add to Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stage Dialog */}
      <AddStageDialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen} onSuccess={() => {
      setIsStageDialogOpen(false);
      fetchPackageData();
    }} packageId={Number(id)} />

      <AddStageDialog open={isEditStageDialogOpen} onOpenChange={setIsEditStageDialogOpen} onSuccess={() => {
      setIsEditStageDialogOpen(false);
      setEditingStage(null);
      fetchPackageData();
    }} packageId={Number(id)} stageData={editingStage} />

      <AddStaffTaskDialog open={isStaffTaskDialogOpen} onOpenChange={open => {
      setIsStaffTaskDialogOpen(open);
      if (!open) setEditingStaffTask(null);
    }} onSuccess={handleStaffTaskSuccess} packageId={Number(id)} stageId={selectedStage?.id} editTask={editingStaffTask} />

      <AddClientTaskDialog open={isClientTaskDialogOpen} onOpenChange={open => {
      setIsClientTaskDialogOpen(open);
      if (!open) setEditingClientTask(null);
    }} onSuccess={handleClientTaskSuccess} packageId={Number(id)} stageId={selectedStage?.id} editTask={editingClientTask} />

      <CreateDocumentDialog2 open={isDocumentDialogOpen} onOpenChange={open => {
      setIsDocumentDialogOpen(open);
      if (!open) setEditingDocument(null);
    }} onSuccess={handleDocumentSuccess} packageId={Number(id)} stageId={selectedStage?.id} editDocument={editingDocument} />

      <AddExistingDocumentDialog open={isAddExistingDocDialogOpen} onOpenChange={setIsAddExistingDocDialogOpen} onSuccess={handleDocumentSuccess} packageId={Number(id)} stageId={selectedStage?.id} />

      <AddExistingStageDialog open={isAddExistingStageDialogOpen} onOpenChange={setIsAddExistingStageDialogOpen} onSuccess={() => {
      setIsAddExistingStageDialogOpen(false);
      fetchPackageData();
    }} packageId={Number(id)} />

      <EditPackageDialog open={isEditPackageDialogOpen} onOpenChange={setIsEditPackageDialogOpen} onSuccess={fetchPackageData} packageData={packageInfo} />

      <AddTenantDialog 
        open={isSetupClientDialogOpen} 
        onOpenChange={setIsSetupClientDialogOpen} 
        preSelectedPackageId={Number(id)}
        onSuccess={async () => {
          // Fetch the most recently created tenant for this package
          const { data: newTenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('package_id', Number(id))
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (newTenant) {
            setSelectedClient({
              id: newTenant.id,
              name: newTenant.name,
              status: newTenant.status || 'active',
              created_at: newTenant.created_at
            });
          }
          fetchPackageData();
        }}
      />
    </div>;
};
export default PackageDetail;