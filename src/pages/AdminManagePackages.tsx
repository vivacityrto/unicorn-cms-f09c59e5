import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, FileText, Archive, X, GripVertical, Calendar as CalendarIcon, Layers, Edit, ChevronDown, Package, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddPackageDialog } from "@/components/AddPackageDialog";
import { AddStageDialog } from "@/components/AddStageDialog";
import { AddExistingStageDialog } from "@/components/AddExistingStageDialog";
import { AddStaffTaskDialog } from "@/components/AddStaffTaskDialog";
import { AddClientTaskDialog } from "@/components/AddClientTaskDialog";
import { CreateDocumentDialog2 } from "@/components/CreateDocumentDialog2";
import { AddExistingDocumentDialog } from "@/components/AddExistingDocumentDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AllStagesTable } from "@/components/admin/AllStagesTable";

type AdminPackageTab = 'packages' | 'stages';
interface PackageType {
  id: number;
  name: string;
  full_text: string;
  details: string;
  status: string;
  slug: string | null;
  created_at: string;
  stages_count?: number;
  duration_months?: number | null;
}
export default function AdminManagePackages() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [packages, setPackages] = useState<PackageType[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<AdminPackageTab>('packages');
  const [totalStagesCount, setTotalStagesCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<PackageType | null>(null);
  const [packageToEdit, setPackageToEdit] = useState<PackageType | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageType | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [isAddExistingStageDialogOpen, setIsAddExistingStageDialogOpen] = useState(false);
  const [isStageDetailOpen, setIsStageDetailOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<{ id: number; name: string } | null>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [isStaffTaskDialogOpen, setIsStaffTaskDialogOpen] = useState(false);
  const [isClientTaskDialogOpen, setIsClientTaskDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [isCreateDocumentDialog2Open, setIsCreateDocumentDialog2Open] = useState(false);
  const [isAddExistingDocumentDialogOpen, setIsAddExistingDocumentDialogOpen] = useState(false);
  
  // Document form state
  const [documentFormData, setDocumentFormData] = useState({
    title: "",
    description: "",
    format: "",
    watermark: false,
    versiondate: undefined as Date | undefined,
    versionnumber: "",
    versionlastupdated: undefined as Date | undefined,
    isclientdoc: false,
    stage: "",
    categories: [] as string[]
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [documentStages, setDocumentStages] = useState<Array<{ id: number; title: string }>>([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [nextOrderNumber, setNextOrderNumber] = useState<number | null>(null);
  const [packageDocuments, setPackageDocuments] = useState<any[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [editingDocument, setEditingDocument] = useState<any>(null);
  const [staffTasks, setStaffTasks] = useState<any[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [editingStaffTask, setEditingStaffTask] = useState<any>(null);
  const [editingClientTask, setEditingClientTask] = useState<any>(null);

  useEffect(() => {
    fetchPackages();
    fetchCategories();
    fetchDocumentStages();
    fetchNextDocumentOrderNumber();
  }, []);

  useEffect(() => {
    if (selectedPackage && selectedStage) {
      // Fetch all data in parallel for faster loading
      setLoadingDocuments(true);
      setLoadingTasks(true);
      
      Promise.all([
        supabase.from('package_documents').select('*').eq('package_id', selectedPackage.id).eq('stage_id', selectedStage.id).order('order_number', { ascending: true }),
        supabase.from('package_staff_tasks').select('*').eq('package_id', selectedPackage.id).eq('stage_id', selectedStage.id).order('order_number', { ascending: true }),
        supabase.from('package_client_tasks').select('*').eq('package_id', selectedPackage.id).eq('stage_id', selectedStage.id).order('order_number', { ascending: true })
      ]).then(([docsResult, staffResult, clientResult]) => {
        setPackageDocuments(docsResult.data || []);
        setStaffTasks(staffResult.data || []);
        setClientTasks(clientResult.data || []);
      }).catch(error => {
        console.error('Error fetching stage data:', error);
      }).finally(() => {
        setLoadingDocuments(false);
        setLoadingTasks(false);
      });
    }
  }, [selectedPackage, selectedStage]);
  useEffect(() => {
    filterPackages();
  }, [searchQuery, packages]);
  const fetchPackages = async () => {
    try {
      setLoading(true);
      
      // Fetch packages and stage counts in parallel with a single optimized query
      const [packagesResult, stageCounts] = await Promise.all([
        supabase.from('packages').select('*').order('created_at', { ascending: false }),
        supabase.from('package_stages').select('package_id')
      ]);
      
      if (packagesResult.error) throw packagesResult.error;
      
      // Count stages per package locally (much faster than N queries)
      const countMap = new Map<number, number>();
      (stageCounts.data || []).forEach(stage => {
        countMap.set(stage.package_id, (countMap.get(stage.package_id) || 0) + 1);
      });
      
      // Set total stages count
      setTotalStagesCount(stageCounts.data?.length || 0);
      
      const packagesWithCounts = (packagesResult.data || []).map(pkg => ({
        ...pkg,
        stages_count: countMap.get(pkg.id) || 0
      }));
      
      setPackages(packagesWithCounts);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch packages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  const filterPackages = () => {
    let filtered = [...packages];
    if (searchQuery) {
      filtered = filtered.filter(pkg => pkg.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    setFilteredPackages(filtered);
  };
  const handleDelete = async () => {
    if (!packageToDelete) return;
    try {
      const {
        error
      } = await supabase.from('packages').delete().eq('id', packageToDelete.id);
      if (error) throw error;
      toast({
        title: 'Success',
        description: 'Package deleted successfully'
      });
      fetchPackages();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete package',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setPackageToDelete(null);
    }
  };

  const fetchStagesForPackage = async (packageId: number) => {
    try {
      const { data, error } = await supabase
        .from('package_stages')
        .select('*')
        .eq('package_id', packageId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setStages(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stages',
        variant: 'destructive',
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("documents_categories")
        .select("id, name")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchDocumentStages = async () => {
    try {
      const { data, error } = await supabase
        .from("documents_stages")
        .select("id, title")
        .order("title", { ascending: true });
      if (error) throw error;
      setDocumentStages(data || []);
    } catch (error: any) {
      console.error("Error fetching document stages:", error);
    }
  };

  const fetchNextDocumentOrderNumber = async () => {
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id")
        .order("id", { ascending: false })
        .limit(1);
      if (error) throw error;
      
      if (data && data.length > 0) {
        setNextOrderNumber(data[0].id + 1);
      } else {
        setNextOrderNumber(1);
      }
    } catch (error: any) {
      console.error("Error fetching next order number:", error);
    }
  };

  const fetchPackageDocuments = async (packageId: number, stageId?: number) => {
    try {
      setLoadingDocuments(true);
      let query = supabase
        .from('package_documents')
        .select('*')
        .eq('package_id', packageId);
      
      // Filter by stage if provided
      if (stageId) {
        query = query.eq('stage_id', stageId);
      }
      
      const { data, error } = await query.order('order_number', { ascending: true });

      if (error) throw error;
      setPackageDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching package documents:', error);
      toast({
        title: "Error",
        description: "Failed to fetch documents for this package",
        variant: "destructive"
      });
    } finally {
      setLoadingDocuments(false);
    }
  };

  const fetchStaffTasks = async (packageId: number, stageId: number) => {
    try {
      setLoadingTasks(true);
      const { data, error } = await supabase
        .from('package_staff_tasks')
        .select('*')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('order_number', { ascending: true });

      if (error) throw error;
      setStaffTasks(data || []);
    } catch (error: any) {
      console.error('Error fetching staff tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchClientTasks = async (packageId: number, stageId: number) => {
    try {
      setLoadingTasks(true);
      const { data, error } = await supabase
        .from('package_client_tasks')
        .select('*')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .order('order_number', { ascending: true });

      if (error) throw error;
      setClientTasks(data || []);
    } catch (error: any) {
      console.error('Error fetching client tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleDeleteClientTask = async (taskId: number) => {
    try {
      const { error } = await supabase
        .from('package_client_tasks')
        .delete()
        .eq('id', String(taskId));

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client task deleted successfully"
      });

      if (selectedPackage && selectedStage) {
        fetchClientTasks(selectedPackage.id, selectedStage.id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete client task",
        variant: "destructive"
      });
    }
  };

  const handleDeleteStaffTask = async (taskId: number) => {
    try {
      const { error } = await supabase
        .from('package_staff_tasks')
        .delete()
        .eq('id', String(taskId));

      if (error) throw error;

      toast({
        title: "Success",
        description: "Staff task deleted successfully"
      });

      if (selectedPackage && selectedStage) {
        fetchStaffTasks(selectedPackage.id, selectedStage.id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete staff task",
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateDocument = async () => {
    try {
      // Upload files to storage if any
      const fileUrls: string[] = [];
      const fileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("document-files")
            .upload(fileName, file);
          if (uploadError) throw uploadError;
          fileUrls.push(uploadData.path);
          fileNames.push(file.name);
        }
      }

      if (editingDocumentId) {
        // Update existing document
        const existingDoc = packageDocuments.find(d => d.id === editingDocumentId);
        const existingFiles = existingDoc?.uploaded_files || [];
        const existingNames = existingDoc?.file_names || [];
        
        const { error } = await supabase.from("documents").update({
          title: documentFormData.title,
          description: documentFormData.description || null,
          format: documentFormData.format || null,
          watermark: documentFormData.watermark,
          versiondate: documentFormData.versiondate ? format(documentFormData.versiondate, "yyyy-MM-dd") : null,
          versionnumber: documentFormData.versionnumber ? parseInt(documentFormData.versionnumber) : null,
          versionlastupdated: documentFormData.versionlastupdated ? documentFormData.versionlastupdated.toISOString() : null,
          isclientdoc: documentFormData.isclientdoc,
          stage: documentFormData.stage ? parseInt(documentFormData.stage) : null,
          category: documentFormData.categories.length > 0 ? documentFormData.categories[0] : null,
          uploaded_files: fileUrls.length > 0 ? [...existingFiles, ...fileUrls] : existingFiles,
          file_names: fileNames.length > 0 ? [...existingNames, ...fileNames] : existingNames,
        }).eq('id', editingDocumentId);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Document updated successfully",
        });
      } else {
        // Insert new document
        const { error } = await supabase.from("documents").insert({
          title: documentFormData.title,
          description: documentFormData.description || null,
          format: documentFormData.format || null,
          watermark: documentFormData.watermark,
          versiondate: documentFormData.versiondate ? format(documentFormData.versiondate, "yyyy-MM-dd") : null,
          versionnumber: documentFormData.versionnumber ? parseInt(documentFormData.versionnumber) : null,
          versionlastupdated: documentFormData.versionlastupdated ? documentFormData.versionlastupdated.toISOString() : null,
          isclientdoc: documentFormData.isclientdoc,
          stage: documentFormData.stage ? parseInt(documentFormData.stage) : null,
          category: documentFormData.categories.length > 0 ? documentFormData.categories[0] : null,
          uploaded_files: fileUrls.length > 0 ? fileUrls : null,
          file_names: fileNames.length > 0 ? fileNames : null,
          package_id: selectedPackage?.id || null,
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Document created successfully",
        });
      }

      // Reset form
      setDocumentFormData({
        title: "",
        description: "",
        format: "",
        watermark: false,
        versiondate: undefined,
        versionnumber: "",
        versionlastupdated: undefined,
        isclientdoc: false,
        stage: "",
        categories: [],
      });
      setUploadedFiles([]);
      setEditingDocumentId(null);
      setIsDocumentDialogOpen(false);
      fetchNextDocumentOrderNumber();
      if (selectedPackage && selectedStage) {
        fetchPackageDocuments(selectedPackage.id, selectedStage.id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRowClick = (pkg: PackageType) => {
    navigate(`/admin/package/${pkg.id}`);
  };

  if (loading) {
    return <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>;
  }
  return <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Manage Packages</h1>
          <p className="text-muted-foreground">View and manage all system packages</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Package
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={cn(
            "animate-scale-in cursor-pointer hover:shadow-lg transition-all",
            activeTab === 'packages' && "shadow-lg"
          )} 
          style={{ animationDelay: "0ms" }}
          onClick={() => setActiveTab('packages')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Packages</CardTitle>
            <Package className="h-[22px] w-[22px] text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.length}</div>
            <p className="text-xs text-muted-foreground">All packages in system</p>
          </CardContent>
        </Card>

        <Card 
          className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" 
          style={{ animationDelay: "50ms" }}
          onClick={() => setActiveTab('packages')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-[22px] w-[22px] text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.filter(p => p.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">Active packages</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "animate-scale-in cursor-pointer hover:shadow-lg transition-all",
            activeTab === 'stages' && "shadow-lg"
          )}
          style={{ animationDelay: "100ms" }}
          onClick={() => setActiveTab('stages')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stages</CardTitle>
            <Layers className="h-[22px] w-[22px] text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStagesCount}</div>
            <p className="text-xs text-muted-foreground">Across all packages</p>
          </CardContent>
        </Card>

        <Card 
          className="animate-scale-in cursor-pointer hover:shadow-lg transition-all" 
          style={{ animationDelay: "150ms" }}
          onClick={() => setActiveTab('packages')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Clock className="h-[22px] w-[22px] text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.filter(p => p.status !== 'active').length}</div>
            <p className="text-xs text-muted-foreground">Inactive packages</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Content */}
      {activeTab === 'packages' && (
        <>
          {/* Search */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search packages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>

      {/* Packages Content */}
      {filteredPackages.length === 0 ? <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No packages found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {searchQuery ? "Try adjusting your search" : "Get started by adding a new package"}
            </p>
          </CardContent>
        </Card> : <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Package Name</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Details</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Status</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Created Date</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Duration</TableHead>
                  <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-border/50 text-center">Stages</TableHead>
                  <TableHead className="bg-muted/30 text-right font-semibold text-foreground h-14 whitespace-nowrap border-border/50">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackages.map((pkg, index) => <TableRow key={pkg.id} onClick={() => handleRowClick(pkg)} className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 animate-fade-in cursor-pointer`}>
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px] pr-8">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground whitespace-nowrap">{pkg.name}</p>
                        {pkg.full_text && (
                          <div className="flex items-center gap-2 mt-1">
                            <Archive className="h-3 w-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground whitespace-nowrap truncate">{pkg.full_text}</p>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[300px] pr-8">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {pkg.details || '-'}
                      </p>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[140px]">
                      <Badge 
                        variant="outline" 
                        className={`capitalize flex items-center gap-1.5 w-fit ${
                          pkg.status === "active" 
                            ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-600" 
                            : "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-600"
                        } text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]`}
                      >
                        {pkg.status === "active" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {pkg.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[160px]">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                          {new Date(pkg.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[100px] text-center">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {pkg.duration_months ? `${pkg.duration_months} month${pkg.duration_months !== 1 ? 's' : ''}` : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[100px] text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-foreground">{pkg.stages_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 text-right min-w-[200px]" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={e => {
                          e.stopPropagation();
                          setPackageToEdit(pkg);
                          setIsCreateDialogOpen(true);
                        }} className="h-8 px-3 text-muted-foreground hover:text-primary hover:bg-primary/10">
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={e => {
                    e.stopPropagation();
                    setPackageToDelete(pkg);
                    setDeleteDialogOpen(true);
                  }} className="h-8 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}
        </>
      )}

      {activeTab === 'stages' && <AllStagesTable />}

      {/* Add Package Dialog */}
      <AddPackageDialog open={isCreateDialogOpen} onOpenChange={open => {
      setIsCreateDialogOpen(open);
      if (!open) setPackageToEdit(null);
    }} onSuccess={fetchPackages} packageToEdit={packageToEdit} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the package "{packageToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Stage Dialog */}
      <AddStageDialog
        open={isStageDialogOpen}
        onOpenChange={setIsStageDialogOpen}
        onSuccess={() => {
          if (selectedPackage) {
            fetchStagesForPackage(selectedPackage.id);
          }
        }}
        packageId={selectedPackage?.id}
      />

      {/* Add Existing Stage Dialog */}
      <AddExistingStageDialog
        open={isAddExistingStageDialogOpen}
        onOpenChange={setIsAddExistingStageDialogOpen}
        onSuccess={() => {
          if (selectedPackage) {
            fetchStagesForPackage(selectedPackage.id);
          }
        }}
        packageId={selectedPackage?.id}
      />

      {/* Package Details Sidebar */}
      <Sheet
        open={isSidebarOpen || isStageDetailOpen}
        onOpenChange={(open) => {
          // Only allow the package sheet to close when the stage detail is not open
          if (!isStageDetailOpen) {
            setIsSidebarOpen(open);
          }
        }}
      >
        <SheetContent 
          className="w-[600px] overflow-y-auto [&>button]:hidden transition-all duration-300 border-r border-border/30 shadow-xl" 
          side="right"
          style={{
            right: '0',
            zIndex: 51
          }}
        >
          <SheetHeader className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-xl">{selectedPackage?.name}</SheetTitle>
                {selectedPackage?.full_text && (
                  <div className="flex items-center gap-2 mt-1">
                    <Archive className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{selectedPackage.full_text}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (selectedPackage) {
                      setPackageToEdit(selectedPackage);
                      setIsCreateDialogOpen(true);
                    }
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (selectedPackage) {
                      setPackageToDelete(selectedPackage);
                      setDeleteDialogOpen(true);
                      setIsSidebarOpen(false);
                    }
                  }}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/30"></div>
            </div>
            <div className="relative flex justify-center">
              <div className="bg-background px-4">
                <div className="h-1 w-1 rounded-full bg-primary/20"></div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Details Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Details</h3>
              <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: 'rgb(135 174 237 / 5%)', marginBottom: '40px' }}>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedPackage?.details || 'No details provided'}
                </p>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Stages Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Stages</h3>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => setIsStageDialogOpen(true)}
                    className="h-8 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setIsAddExistingStageDialogOpen(true)}
                    className="h-8 border-[hsl(188_74%_51%)] text-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Existing
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[60px_1fr_auto] gap-4 bg-muted/30 px-4 py-3 border-b border-border/50">
                  <span className="text-xs font-medium text-muted-foreground">Number</span>
                  <span className="text-xs font-medium text-muted-foreground">Stage</span>
                  <span className="text-xs font-medium text-muted-foreground">(Drag and drop to re-order stages)</span>
                </div>

                {/* Stage Items */}
                <div className="divide-y divide-border/50">
                  {stages.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                      No stages have been added to this package yet.
                    </div>
                  ) : (
                    stages.map((stage, index) => (
                      <div
                        key={stage.id}
                        className="grid grid-cols-[60px_1fr_auto] gap-4 items-center px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors group cursor-pointer"
                        onClick={() => {
                          setSelectedStage({ id: stage.id, name: stage.stage_name });
                          setIsStageDetailOpen(true);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                          <span className="text-sm font-medium">{index + 1}</span>
                        </div>
                        <span className="text-sm">{stage.stage_name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-[hsl(15_87%_62%)] hover:text-[hsl(15_87%_62%)] hover:bg-[hsl(15_87%_62%)]/10"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const { error } = await supabase
                                .from('package_stages')
                                .delete()
                                .eq('id', stage.id);
                              if (error) throw error;
                              if (selectedPackage) {
                                fetchStagesForPackage(selectedPackage.id);
                              }
                            } catch (error: any) {
                              toast({
                                title: 'Error',
                                description: error.message || 'Failed to remove stage',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Footer with Status and Date */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-border/50 bg-muted/20 px-6 py-4">
            <div className="flex items-center justify-between">
              <Badge variant={selectedPackage?.status === "active" ? "default" : "secondary"} className="capitalize">
                {selectedPackage?.status}
              </Badge>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                <span>
                  Created {selectedPackage && new Date(selectedPackage.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Stage Detail Sheet */}
      <Sheet 
        open={isStageDetailOpen} 
        onOpenChange={(open) => {
          // Don't allow closing if staff, client task, or document dialog is open
          if (!isStaffTaskDialogOpen && !isClientTaskDialogOpen && !isDocumentDialogOpen && !isCreateDocumentDialog2Open) {
            setIsStageDetailOpen(open);
          }
        }}
        modal={false}
      >
        <SheetContent 
          className="w-[800px] overflow-y-auto border-r border-border/30 shadow-2xl" 
          side="right"
          style={{
            right: isSidebarOpen ? '600px' : '0',
            zIndex: 50,
            transition: 'right 0.3s ease-in-out'
          }}
        >
          <div key={selectedStage?.id} className="animate-fade-in">
            <SheetHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-xl">{selectedStage?.name}</SheetTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-red-500 border border-red-300 bg-red-500/5 rounded-full hover:bg-red-500/10"
                  onClick={() => setIsStageDetailOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </SheetHeader>

            <div className="flex items-center gap-2 mt-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Manage package workflow stages</p>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/30"></div>
              </div>
              <div className="relative flex justify-center">
                <div className="bg-background px-4">
                  <div className="h-1 w-1 rounded-full bg-primary/20"></div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Staff Tasks Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Staff Tasks</h3>
                  <Button 
                    size="sm" 
                    className="h-8 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                    onClick={() => {
                      setEditingStaffTask(null);
                      setIsStaffTaskDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="grid grid-cols-[80px_1fr_120px_auto] gap-4 bg-muted/30 px-4 py-3 border-b border-border/50">
                    <span className="text-xs font-medium text-muted-foreground">Number</span>
                    <span className="text-xs font-medium text-muted-foreground">Name</span>
                    <span className="text-xs font-medium text-muted-foreground">Due Date</span>
                    <span className="text-xs font-medium text-muted-foreground">Actions</span>
                  </div>
                  {loadingTasks ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Loading tasks...
                    </div>
                  ) : staffTasks.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No staff tasks
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {staffTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="grid grid-cols-[80px_1fr_120px_auto] gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group items-center cursor-pointer"
                          onClick={() => {
                            setEditingStaffTask(task);
                            setIsStaffTaskDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                            <span className="text-sm font-medium text-muted-foreground">
                              {index + 1}
                            </span>
                          </div>
                          <span className="text-sm truncate" title={task.name}>
                            {task.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {task.due_date_offset ? `${task.due_date_offset} days` : '-'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStaffTask(task.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Tasks Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Client Tasks</h3>
                  <Button 
                    size="sm" 
                    className="h-8 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                    onClick={() => {
                      setEditingClientTask(null);
                      setIsClientTaskDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="grid grid-cols-[80px_1fr_120px_auto] gap-4 bg-muted/30 px-4 py-3 border-b border-border/50">
                    <span className="text-xs font-medium text-muted-foreground">Number</span>
                    <span className="text-xs font-medium text-muted-foreground">Name</span>
                    <span className="text-xs font-medium text-muted-foreground">Due Date</span>
                    <span className="text-xs font-medium text-muted-foreground">Actions</span>
                  </div>
                  {loadingTasks ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Loading tasks...
                    </div>
                  ) : clientTasks.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No client tasks
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {clientTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="grid grid-cols-[80px_1fr_120px_auto] gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group items-center cursor-pointer"
                          onClick={() => {
                            setEditingClientTask(task);
                            setIsClientTaskDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                            <span className="text-sm font-medium text-muted-foreground">
                              {index + 1}
                            </span>
                          </div>
                          <span className="text-sm truncate" title={task.name}>
                            {task.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {task.due_date_offset ? `${task.due_date_offset} days` : '-'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClientTask(task.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Documents Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Documents</h3>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setIsAddExistingDocumentDialogOpen(true);
                      }}
                    >
                      <Search className="h-3 w-3 mr-1" />
                      Add Existing
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-8 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                      onClick={() => {
                        setEditingDocument(null);
                        setIsCreateDocumentDialog2Open(true);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      New
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  {loadingDocuments ? (
                    <div className="flex items-center justify-center p-8 bg-muted/20">
                      <div className="text-sm text-muted-foreground">Loading documents...</div>
                    </div>
                  ) : packageDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20">
                      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground">No documents found for this package</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 bg-muted/30 px-4 py-3 border-b border-border/50">
                        <div className="w-4 flex-shrink-0"></div>
                        <span className="text-xs font-medium text-muted-foreground w-6 flex-shrink-0">#</span>
                        <span className="flex-1 text-xs font-medium text-muted-foreground">Document Name</span>
                        <span className="text-xs font-medium text-muted-foreground">Type</span>
                        <span className="text-xs font-medium text-muted-foreground">Actions</span>
                      </div>
                       <div className="divide-y divide-border/50">
                        {packageDocuments.map((doc, index) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group cursor-pointer"
                            onClick={() => {
                              setEditingDocument(doc);
                              setIsCreateDocumentDialog2Open(true);
                            }}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-move" />
                            <span className="text-sm font-medium text-muted-foreground w-6 flex-shrink-0">
                              {index + 1}
                            </span>
                            <span 
                              className="flex-1 text-sm truncate"
                              title={doc.document_name}
                            >
                              {doc.document_name}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {doc.file_type || '-'}
                            </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-auto py-1 px-2 flex-shrink-0"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete "${doc.document_name}"?`)) {
                                try {
                                  const { error } = await supabase
                                    .from('package_documents')
                                    .delete()
                                    .eq('id', doc.id);
                                  
                                  if (error) throw error;
                                  
                                  toast({
                                    title: "Success",
                                    description: "Document deleted successfully",
                                  });
                                  
                                  if (selectedPackage && selectedStage) {
                                    fetchPackageDocuments(selectedPackage.id, selectedStage.id);
                                  }
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message,
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </div>
              </div>

              {/* Emails Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Emails</h3>
                  <Button size="sm" className="h-8 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white">
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="grid grid-cols-[80px_1fr] gap-4 bg-muted/30 px-4 py-3 border-b border-border/50">
                    <span className="text-xs font-medium text-muted-foreground">Number</span>
                    <span className="text-xs font-medium text-muted-foreground">Name (Drag and drop to reorder emails)</span>
                  </div>
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No emails
                  </div>
                </div>
              </div>

            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Staff Task Dialog */}
      <AddStaffTaskDialog
        open={isStaffTaskDialogOpen}
        onOpenChange={setIsStaffTaskDialogOpen}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            // Refresh staff tasks for the stage
            fetchStaffTasks(selectedPackage.id, selectedStage.id);
            toast({
              title: "Task created",
              description: "Staff task has been added successfully"
            });
          }
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
      />

      {/* Add Client Task Dialog */}
      <AddClientTaskDialog
        open={isClientTaskDialogOpen}
        onOpenChange={setIsClientTaskDialogOpen}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            // Refresh client tasks for the stage
            fetchClientTasks(selectedPackage.id, selectedStage.id);
            toast({
              title: "Task created",
              description: "Client task has been added successfully"
            });
          }
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
      />

      {/* Create Document Dialog */}
      <Dialog open={isDocumentDialogOpen} onOpenChange={setIsDocumentDialogOpen}>
        <DialogContent className="border-[3px] border-[#dfdfdf] flex flex-col max-h-[90vh]" style={{ width: '650px', maxWidth: '90vw' }}>
          <DialogHeader className="p-0 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create New Document
            </DialogTitle>
            <DialogDescription>
              Create a new document by providing the required information below
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto scrollbar-hide px-1 min-h-0">
            <div className="grid gap-4 py-4 px-1">
              <div className="grid gap-2">
                <Label>Order Number (Auto-populated)</Label>
                <Input 
                  type="text" 
                  value={nextOrderNumber?.toString() || "Will be assigned automatically"} 
                  disabled 
                  className="bg-muted cursor-not-allowed" 
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="title">Name *</Label>
                <Input 
                  id="title" 
                  value={documentFormData.title} 
                  onChange={e => setDocumentFormData({ ...documentFormData, title: e.target.value })} 
                  required 
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  value={documentFormData.description} 
                  onChange={e => setDocumentFormData({ ...documentFormData, description: e.target.value })} 
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="format">Format</Label>
                <Select
                  value={documentFormData.format}
                  onValueChange={value => setDocumentFormData({ ...documentFormData, format: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PDF">PDF</SelectItem>
                    <SelectItem value="DOCX">DOCX</SelectItem>
                    <SelectItem value="XLSX">XLSX</SelectItem>
                    <SelectItem value="PPTX">PPTX</SelectItem>
                    <SelectItem value="TXT">TXT</SelectItem>
                    <SelectItem value="JPG">JPG</SelectItem>
                    <SelectItem value="PNG">PNG</SelectItem>
                    <SelectItem value="ZIP">ZIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch 
                  id="watermark" 
                  checked={documentFormData.watermark} 
                  onCheckedChange={checked => setDocumentFormData({ ...documentFormData, watermark: checked })} 
                />
                <Label htmlFor="watermark">Watermark</Label>
              </div>

              <div className="grid gap-2">
                <Label>Version Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={cn(
                        "justify-start text-left font-normal hover:!bg-[#349fff1c] hover:!text-black",
                        !documentFormData.versiondate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {documentFormData.versiondate ? format(documentFormData.versiondate, "dd/MM/yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[80]" align="start">
                    <Calendar 
                      mode="single" 
                      selected={documentFormData.versiondate} 
                      onSelect={date => setDocumentFormData({ ...documentFormData, versiondate: date })} 
                      initialFocus 
                      className="pointer-events-auto" 
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="versionnumber">Version Number</Label>
                <Input 
                  id="versionnumber" 
                  type="number" 
                  value={documentFormData.versionnumber} 
                  onChange={e => setDocumentFormData({ ...documentFormData, versionnumber: e.target.value })} 
                />
              </div>

              <div className="grid gap-2">
                <Label>Version Last Updated</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={cn(
                        "justify-start text-left font-normal hover:!bg-[#349fff1c] hover:!text-black",
                        !documentFormData.versionlastupdated && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {documentFormData.versionlastupdated ? format(documentFormData.versionlastupdated, "dd/MM/yyyy HH:mm") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[80]" align="start">
                    <Calendar 
                      mode="single" 
                      selected={documentFormData.versionlastupdated} 
                      onSelect={date => setDocumentFormData({ ...documentFormData, versionlastupdated: date })} 
                      initialFocus 
                      className="pointer-events-auto" 
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <Switch 
                  id="isclientdoc" 
                  checked={documentFormData.isclientdoc} 
                  onCheckedChange={checked => setDocumentFormData({ ...documentFormData, isclientdoc: checked })} 
                />
                <Label htmlFor="isclientdoc">Is Client Document</Label>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="stage">Stage</Label>
                <Select
                  value={documentFormData.stage}
                  onValueChange={value => setDocumentFormData({ ...documentFormData, stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {documentStages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        {stage.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start min-h-[40px] h-auto hover:!bg-[#349fff1c] hover:!text-black" 
                      role="combobox"
                    >
                      {documentFormData.categories.length === 0 ? (
                        <span className="text-muted-foreground">Select categories...</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {documentFormData.categories.map(catId => {
                            const category = categories.find(c => c.id.toString() === catId);
                            return category ? (
                              <Badge 
                                key={catId} 
                                variant="secondary" 
                                className="text-xs px-2 py-0.5"
                                onClick={e => {
                                  e.stopPropagation();
                                  setDocumentFormData({
                                    ...documentFormData,
                                    categories: documentFormData.categories.filter(id => id !== catId)
                                  });
                                }}
                              >
                                {category.name}
                                <X className="ml-1 h-3 w-3" />
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-background z-[80]" align="start" sideOffset={5}>
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search categories..." 
                          value={categorySearchQuery} 
                          onChange={e => setCategorySearchQuery(e.target.value)} 
                          className="pl-8 h-9"
                        />
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-1">
                      {categories.filter(cat => 
                        cat.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
                      ).length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No categories found.
                        </div>
                      ) : (
                        categories.filter(cat => 
                          cat.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
                        ).map(cat => {
                          const isSelected = documentFormData.categories.includes(cat.id.toString());
                          return (
                            <div 
                              key={cat.id} 
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black",
                                isSelected && "bg-[hsl(196deg_100%_93.53%)] text-black"
                              )} 
                              onClick={() => {
                                if (isSelected) {
                                  setDocumentFormData({
                                    ...documentFormData,
                                    categories: documentFormData.categories.filter(id => id !== cat.id.toString())
                                  });
                                } else {
                                  setDocumentFormData({
                                    ...documentFormData,
                                    categories: [...documentFormData.categories, cat.id.toString()]
                                  });
                                }
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <span>{cat.name}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="files">Files</Label>
                <Input 
                  id="files" 
                  type="file" 
                  multiple 
                  onChange={handleFileUpload} 
                  className="cursor-pointer" 
                />
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {uploadedFiles.map((file, index) => (
                      <Badge key={index} variant="secondary" className="gap-1 py-2 px-5">
                        {file.name}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveFile(index)} 
                          className="ml-1 text-destructive border border-destructive bg-destructive/20 hover:bg-destructive/30 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 mt-4 border-t">
            <Button 
              variant="outline" 
              size="default" 
              type="button" 
              onClick={() => setIsDocumentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateDocument} disabled={!documentFormData.title}>
              Create Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Task Dialog */}
      <AddStaffTaskDialog
        open={isStaffTaskDialogOpen}
        onOpenChange={(open) => {
          setIsStaffTaskDialogOpen(open);
          if (!open) setEditingStaffTask(null);
        }}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            fetchStaffTasks(selectedPackage.id, selectedStage.id);
          }
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
        editTask={editingStaffTask}
      />

      {/* Client Task Dialog */}
      <AddClientTaskDialog
        open={isClientTaskDialogOpen}
        onOpenChange={(open) => {
          setIsClientTaskDialogOpen(open);
          if (!open) setEditingClientTask(null);
        }}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            fetchClientTasks(selectedPackage.id, selectedStage.id);
          }
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
        editTask={editingClientTask}
      />

      {/* Create Document Dialog 2 */}
      <CreateDocumentDialog2
        open={isCreateDocumentDialog2Open}
        onOpenChange={(open) => {
          setIsCreateDocumentDialog2Open(open);
          if (!open) {
            setEditingDocument(null);
          }
        }}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            fetchPackageDocuments(selectedPackage.id, selectedStage.id);
          }
          setEditingDocument(null);
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
        editDocument={editingDocument}
      />

      {/* Add Existing Document Dialog */}
      <AddExistingDocumentDialog
        open={isAddExistingDocumentDialogOpen}
        onOpenChange={setIsAddExistingDocumentDialogOpen}
        onSuccess={() => {
          if (selectedPackage && selectedStage) {
            fetchPackageDocuments(selectedPackage.id, selectedStage.id);
          }
        }}
        packageId={selectedPackage?.id}
        stageId={selectedStage?.id}
      />
    </div>;
}
