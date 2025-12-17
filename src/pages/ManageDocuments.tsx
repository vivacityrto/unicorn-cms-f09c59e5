import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileText, Search, ArrowUpDown, Plus, FolderTree, FileStack, ListTree, X, Download, Eye, Trash2, Send, Mail, Building2, Filter, ChevronDown, ChevronUp, Pencil, FolderOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
interface Document {
  id: number;
  title: string;
  description: string | null;
  format: string | null;
  watermark: boolean | null;
  versiondate: string | null;
  versionnumber: number | null;
  versionlastupdated: string | null;
  isclientdoc: boolean | null;
  stage: number | null;
  category: string | null;
  sent_at?: string | null;
  is_sent?: boolean;
  uploaded_files?: string[] | null;
  file_names?: string[] | null;
  createdat?: string | null;
  created_by?: string | null;
  creator?: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}
export default function ManageDocuments() {
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [sortField, setSortField] = useState<"title" | "id" | "versiondate">("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [nextOrderNumber, setNextOrderNumber] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserTenantId, setCurrentUserTenantId] = useState<number | null>(null);
  const [categoriesCount, setCategoriesCount] = useState<number>(0);
  const [categories, setCategories] = useState<Array<{
    id: number;
    name: string;
  }>>([]);
  const [stagesCount, setStagesCount] = useState<number>(0);
  const [stages, setStages] = useState<Array<{
    id: number;
    title: string;
  }>>([]);
  const [fieldsCount, setFieldsCount] = useState<number>(0);
  const [fields, setFields] = useState<Array<{
    id: number;
    label: string;
    type: string;
  }>>([]);
  const [selectedFields, setSelectedFields] = useState<number[]>([]);
  const [isFieldsSheetOpen, setIsFieldsSheetOpen] = useState(false);
  const [fieldSearchQuery, setFieldSearchQuery] = useState("");
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkSendDialogOpen, setIsBulkSendDialogOpen] = useState(false);
  const [bulkSendEmail, setBulkSendEmail] = useState("");
  const [bulkSendSearchQuery, setBulkSendSearchQuery] = useState("");
  const [bulkSendUsers, setBulkSendUsers] = useState<Array<{
    email: string;
    first_name: string;
    last_name: string;
    user_uuid: string;
  }>>([]);
  const [bulkSendFilteredUsers, setBulkSendFilteredUsers] = useState<Array<{
    email: string;
    first_name: string;
    last_name: string;
    user_uuid: string;
  }>>([]);
  const [bulkSending, setBulkSending] = useState(false);

  // Bulk send type selection
  const [bulkSendType, setBulkSendType] = useState<'email' | 'tenant' | null>(null);

  // Bulk send to tenant state
  const [bulkTenants, setBulkTenants] = useState<Array<{
    id: string;
    tenant_id: number;
    companyname: string;
    rto_name: string | null;
    state: string | null;
    cricos_id: string | null;
    email: string | null;
    framework: string | null;
  }>>([]);
  const [bulkFilteredTenants, setBulkFilteredTenants] = useState<Array<{
    id: string;
    tenant_id: number;
    companyname: string;
    rto_name: string | null;
    state: string | null;
    cricos_id: string | null;
    email: string | null;
    framework: string | null;
  }>>([]);
  const [bulkTenantSearch, setBulkTenantSearch] = useState('');
  const [bulkSelectedTenants, setBulkSelectedTenants] = useState<string[]>([]);
  const [bulkExpandedTenant, setBulkExpandedTenant] = useState<string | null>(null);
  const [isBulkFilterOpen, setIsBulkFilterOpen] = useState(false);

  // Bulk tenant filters
  const [bulkStateFilter, setBulkStateFilter] = useState<string>('');
  const [bulkCricosFilter, setBulkCricosFilter] = useState<'all' | 'cricos' | 'non-cricos'>('all');
  const [bulkFrameworkFilter, setBulkFrameworkFilter] = useState<string>('');
  const [documentsCount, setDocumentsCount] = useState<number>(0);
  const {
    profile
  } = useAuth();
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Individual document actions
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [existingFiles, setExistingFiles] = useState<{
    url: string;
    name: string;
  }[]>([]);

  // Form state
  const [formData, setFormData] = useState({
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
  useEffect(() => {
    fetchCurrentUser();
    fetchCategories();
    fetchStages();
    fetchFields();
    fetchBulkSendUsers();
    fetchBulkTenants();
    fetchDocumentsCount();
  }, []);
  useEffect(() => {
    if (currentUserRole !== null) {
      fetchDocuments();
    }
  }, [currentUserRole, currentUserTenantId]);

  // Populate form when editing a document
  useEffect(() => {
    if (editingDocumentId && isCreateDialogOpen) {
      const doc = documents.find(d => d.id === editingDocumentId);
      if (doc) {
        setFormData({
          title: doc.title || "",
          description: doc.description || "",
          format: doc.format || "",
          watermark: doc.watermark || false,
          versiondate: doc.versiondate ? new Date(doc.versiondate) : undefined,
          versionnumber: doc.versionnumber?.toString() || "",
          versionlastupdated: doc.versionlastupdated ? new Date(doc.versionlastupdated) : undefined,
          isclientdoc: doc.isclientdoc || false,
          stage: doc.stage?.toString() || "",
          categories: doc.category ? doc.category.split(",").map(c => c.trim()) : []
        });
        // Set existing files
        if (doc.uploaded_files && doc.file_names) {
          const files = doc.uploaded_files.map((url, index) => ({
            url,
            name: doc.file_names?.[index] || `File ${index + 1}`
          }));
          setExistingFiles(files);
        } else {
          setExistingFiles([]);
        }
      }
    }
  }, [editingDocumentId, isCreateDialogOpen, documents]);
  const fetchCategories = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("documents_categories").select("id, name").order("id", {
        ascending: true
      });
      if (error) throw error;
      setCategories(data || []);
      setCategoriesCount((data || []).length);
    } catch (error: any) {
      console.error("Error fetching categories:", error);
    }
  };
  const fetchStages = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("documents_stages").select("id, title").order("title", {
        ascending: true
      });
      if (error) throw error;
      setStages(data as any || []);
      setStagesCount((data || []).length);
    } catch (error: any) {
      console.error("Error fetching stages:", error);
    }
  };
  const fetchFields = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("documents_fields").select("id, label, type").order("label", {
        ascending: true
      });
      if (error) throw error;
      setFields(data || []);
      setFieldsCount((data || []).length);
    } catch (error: any) {
      console.error("Error fetching fields:", error);
    }
  };
  const fetchBulkSendUsers = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("users").select("email, first_name, last_name, user_uuid");
      if (error) throw error;
      setBulkSendUsers(data || []);
    } catch (error: any) {
      console.error("Error fetching users:", error);
    }
  };
  const fetchBulkTenants = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('clients_legacy').select('id, tenant_id, companyname, rto_name, state, cricos_id, email, framework').order('companyname', {
        ascending: true
      });
      if (error) throw error;
      setBulkTenants(data || []);
      setBulkFilteredTenants(data || []);
    } catch (error: any) {
      console.error('Error fetching tenants:', error);
    }
  };

  // Apply bulk tenant filters
  useEffect(() => {
    let result = bulkTenants;

    // Search filter
    if (bulkTenantSearch) {
      result = result.filter(tenant => tenant.companyname.toLowerCase().includes(bulkTenantSearch.toLowerCase()) || tenant.rto_name && tenant.rto_name.toLowerCase().includes(bulkTenantSearch.toLowerCase()) || tenant.email && tenant.email.toLowerCase().includes(bulkTenantSearch.toLowerCase()));
    }

    // State filter
    if (bulkStateFilter) {
      result = result.filter(tenant => tenant.state === bulkStateFilter);
    }

    // CRICOS filter
    if (bulkCricosFilter === 'cricos') {
      result = result.filter(tenant => tenant.cricos_id && tenant.cricos_id.trim() !== '');
    } else if (bulkCricosFilter === 'non-cricos') {
      result = result.filter(tenant => !tenant.cricos_id || tenant.cricos_id.trim() === '');
    }

    // Framework filter
    if (bulkFrameworkFilter) {
      result = result.filter(tenant => tenant.framework === bulkFrameworkFilter);
    }
    setBulkFilteredTenants(result);
  }, [bulkTenants, bulkTenantSearch, bulkStateFilter, bulkCricosFilter, bulkFrameworkFilter]);
  const fetchDocumentsCount = async () => {
    try {
      const {
        count,
        error
      } = await supabase.from("documents").select("*", {
        count: "exact",
        head: true
      });
      if (error) throw error;
      setDocumentsCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching documents count:", error);
    }
  };
  useEffect(() => {
    applyFiltersAndSort();
    setCurrentPage(1); // Reset to first page when filters change
  }, [documents, searchQuery, formatFilter, categoryFilter, sortField, sortDirection]);
  useEffect(() => {
    if (bulkSendSearchQuery) {
      const filtered = bulkSendUsers.filter(user => user.email.toLowerCase().includes(bulkSendSearchQuery.toLowerCase()) || `${user.first_name} ${user.last_name}`.toLowerCase().includes(bulkSendSearchQuery.toLowerCase()));
      setBulkSendFilteredUsers(filtered);
    } else {
      setBulkSendFilteredUsers([]);
    }
  }, [bulkSendSearchQuery, bulkSendUsers]);
  const fetchCurrentUser = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data: userData,
        error
      } = await supabase.from("users").select("unicorn_role, tenant_id").eq("user_uuid", user.id).single();
      if (error) throw error;
      setCurrentUserRole(userData.unicorn_role);
      setCurrentUserTenantId(userData.tenant_id);
    } catch (error: any) {
      console.error("Error fetching current user:", error);
    }
  };
  const fetchDocuments = async () => {
    try {
      setLoading(true);

      // Check if user is Super Admin or Team Leader
      const isSuperAdmin = currentUserRole === "Super Admin" || currentUserRole === "SuperAdmin";
      const isTeamLeader = currentUserRole === "Team Leader";
      if (isSuperAdmin || isTeamLeader) {
        // Super Admins and Team Leaders see master documents from documents table
        const {
          data: documentsData,
          error: documentsError
        } = await supabase.from("documents").select("*").order("id", {
          ascending: true
        });
        if (documentsError) {
          console.error("Error fetching documents:", documentsError);
          throw documentsError;
        }

        // Fetch creator info for documents with created_by
        const creatorIds = [...new Set((documentsData || []).filter(d => d.created_by).map(d => d.created_by))];
        let creatorsMap: Record<string, { first_name: string | null; last_name: string | null; avatar_url: string | null }> = {};
        
        if (creatorIds.length > 0) {
          const { data: usersData } = await supabase
            .from("users")
            .select("user_uuid, first_name, last_name, avatar_url")
            .in("user_uuid", creatorIds);
          
          if (usersData) {
            usersData.forEach(user => {
              creatorsMap[user.user_uuid] = {
                first_name: user.first_name,
                last_name: user.last_name,
                avatar_url: user.avatar_url
              };
            });
          }
        }

        // Enrich documents with creator info
        const enrichedDocs = (documentsData || []).map(doc => ({
          ...doc,
          creator: doc.created_by ? creatorsMap[doc.created_by] || null : null
        }));

        setDocuments(enrichedDocs);

        // Calculate next order number
        if (documentsData && documentsData.length > 0) {
          const maxId = Math.max(...documentsData.map(d => d.id));
          setNextOrderNumber(maxId + 1);
        } else {
          setNextOrderNumber(1);
        }
      } else {
        // Regular users see documents sent to their tenant from documents_tenants
        const {
          data: tenantDocsData,
          error: tenantDocsError
        } = await supabase.from("documents_tenants").select("*").eq("tenant_id", currentUserTenantId).order("id", {
          ascending: true
        });
        if (tenantDocsError) {
          console.error("Error fetching tenant documents:", tenantDocsError);
          throw tenantDocsError;
        }

        // Mark these as sent documents
        const markedDocs = (tenantDocsData || []).map(doc => ({
          ...doc,
          is_sent: true
        }));
        setDocuments(markedDocs);
      }
    } catch (error: any) {
      console.error("Fetch documents error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const applyFiltersAndSort = () => {
    let filtered = [...documents];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(doc => doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.id.toString().includes(searchQuery));
    }

    // Format filter
    if (formatFilter !== "all") {
      filtered = filtered.filter(doc => doc.format === formatFilter);
    }

    // Category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter(doc => doc.category?.toString() === categoryFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "title":
          aVal = a.title || "";
          bVal = b.title || "";
          break;
        case "id":
          aVal = a.id || 0;
          bVal = b.id || 0;
          break;
        case "versiondate":
          aVal = a.versiondate || "";
          bVal = b.versiondate || "";
          break;
        default:
          aVal = "";
          bVal = "";
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      } else {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
    });
    setFilteredDocuments(filtered);
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex);
  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
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
      // Upload new files to storage if any
      const newFileUrls: string[] = [];
      const newFileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const {
            data: uploadData,
            error: uploadError
          } = await supabase.storage.from("document-files").upload(fileName, file);
          if (uploadError) throw uploadError;
          newFileUrls.push(uploadData.path);
          newFileNames.push(file.name);
        }
      }

      // Combine existing files with new uploads
      const allFileUrls = [...existingFiles.map(f => f.url), ...newFileUrls];
      const allFileNames = [...existingFiles.map(f => f.name), ...newFileNames];
      if (editingDocumentId) {
        // Update existing document
        const {
          error
        } = await supabase.from("documents").update({
          title: formData.title,
          description: formData.description || null,
          format: formData.format || null,
          watermark: formData.watermark,
          versiondate: formData.versiondate ? format(formData.versiondate, "yyyy-MM-dd") : null,
          versionnumber: formData.versionnumber ? parseInt(formData.versionnumber) : null,
          versionlastupdated: formData.versionlastupdated ? formData.versionlastupdated.toISOString() : null,
          isclientdoc: formData.isclientdoc,
          stage: formData.stage ? parseInt(formData.stage) : null,
          category: formData.categories.length > 0 ? formData.categories.join(',') : null,
          uploaded_files: allFileUrls.length > 0 ? allFileUrls : null,
          file_names: allFileNames.length > 0 ? allFileNames : null
        }).eq("id", editingDocumentId);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Document updated successfully"
        });
      } else {
        // Insert new document with created_by set to current user
        const {
          error
        } = await supabase.from("documents").insert({
          title: formData.title,
          description: formData.description || null,
          format: formData.format || null,
          watermark: formData.watermark,
          versiondate: formData.versiondate ? format(formData.versiondate, "yyyy-MM-dd") : null,
          versionnumber: formData.versionnumber ? parseInt(formData.versionnumber) : null,
          versionlastupdated: formData.versionlastupdated ? formData.versionlastupdated.toISOString() : null,
          isclientdoc: formData.isclientdoc,
          stage: formData.stage ? parseInt(formData.stage) : null,
          category: formData.categories.length > 0 ? formData.categories.join(',') : null,
          uploaded_files: allFileUrls.length > 0 ? allFileUrls : null,
          file_names: allFileNames.length > 0 ? allFileNames : null,
          created_by: profile?.user_uuid || null
        });
        if (error) throw error;
        toast({
          title: "Success",
          description: "Document created successfully"
        });

        // Update next order number only for new documents
        const newNextOrderNumber = nextOrderNumber ? nextOrderNumber + 1 : 1;
        setNextOrderNumber(newNextOrderNumber);
      }

      // Reset form
      setFormData({
        title: "",
        description: "",
        format: "",
        watermark: false,
        versiondate: undefined,
        versionnumber: "",
        versionlastupdated: undefined,
        isclientdoc: false,
        stage: "",
        categories: []
      });
      setUploadedFiles([]);
      setExistingFiles([]);
      setEditingDocumentId(null);
      setIsCreateDialogOpen(false);
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleDuplicateDocument = async (docId: number) => {
    try {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;

      // Copy files to new paths if they exist
      const newFileUrls: string[] = [];
      const newFileNames: string[] = [];
      if (doc.uploaded_files && doc.uploaded_files.length > 0) {
        for (let i = 0; i < doc.uploaded_files.length; i++) {
          const filePath = doc.uploaded_files[i];
          const fileName = doc.file_names?.[i] || "file";
          try {
            // Download the original file
            const {
              data: fileData,
              error: downloadError
            } = await supabase.storage.from("document-files").download(filePath);
            if (downloadError) throw downloadError;

            // Upload with a new unique name
            const newFileName = `${Date.now()}-copy-${fileName}`;
            const {
              data: uploadData,
              error: uploadError
            } = await supabase.storage.from("document-files").upload(newFileName, fileData);
            if (uploadError) throw uploadError;
            newFileUrls.push(uploadData.path);
            newFileNames.push(fileName);
          } catch (fileError) {
            console.error("Error copying file:", fileError);
            // Continue with other files even if one fails
          }
        }
      }
      const {
        error
      } = await supabase.from("documents").insert({
        title: `${doc.title} (Copy)`,
        description: doc.description,
        format: doc.format,
        watermark: doc.watermark,
        versiondate: doc.versiondate,
        versionnumber: doc.versionnumber,
        versionlastupdated: new Date().toISOString(),
        isclientdoc: doc.isclientdoc,
        stage: doc.stage,
        category: doc.category,
        uploaded_files: newFileUrls.length > 0 ? newFileUrls : null,
        file_names: newFileNames.length > 0 ? newFileNames : null
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Document duplicated successfully"
      });
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleDeleteDocument = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const {
        error
      } = await supabase.from("documents").delete().eq("id", docId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Document deleted successfully"
      });
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleSendDocument = (docId: number) => {
    navigate(`/document/${docId}`);
  };
  const toggleSelectDocument = (docId: number) => {
    setSelectedDocuments(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
  };
  const toggleSelectAll = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    }
  };
  const handleBulkDelete = async () => {
    try {
      const {
        error
      } = await supabase.from("documents").delete().in("id", selectedDocuments);
      if (error) throw error;
      toast({
        title: "Success",
        description: `${selectedDocuments.length} document(s) deleted successfully`
      });
      setSelectedDocuments([]);
      setIsBulkDeleteDialogOpen(false);
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleBulkSend = async () => {
    if (!bulkSendEmail) {
      toast({
        title: "Error",
        description: "Please select a recipient",
        variant: "destructive"
      });
      return;
    }
    try {
      setBulkSending(true);

      // Get recipient user data
      const {
        data: userData,
        error: userError
      } = await supabase.from("users").select("tenant_id, email, first_name, last_name").eq("email", bulkSendEmail).single();
      if (userError || !userData) throw new Error("Recipient not found");
      const {
        data: currentUser
      } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      // Send each selected document
      for (const docId of selectedDocuments) {
        const doc = documents.find(d => d.id === docId);
        if (!doc) continue;
        const {
          data: insertedDoc,
          error
        } = await supabase.from("documents_tenants").insert({
          tenant_id: userData.tenant_id,
          title: doc.title,
          description: doc.description,
          format: doc.format,
          watermark: doc.watermark,
          versiondate: doc.versiondate,
          versionnumber: doc.versionnumber,
          versionlastupdated: doc.versionlastupdated,
          isclientdoc: doc.isclientdoc,
          stage: doc.stage,
          category: doc.category,
          uploaded_files: doc.uploaded_files,
          file_names: doc.file_names,
          sent_by: currentUser.user?.id
        }).select().single();
        if (error) throw error;

        // Create notification
        if (insertedDoc) {
          await supabase.from("notification_tenants").insert({
            tenant_id: userData.tenant_id,
            document_id: insertedDoc.id,
            message: `New document received: ${doc.title}`,
            is_read: false,
            type: "Document Received"
          });
        }
      }
      toast({
        title: "Success",
        description: `${selectedDocuments.length} document(s) sent to ${bulkSendEmail}`
      });
      setIsBulkSendDialogOpen(false);
      setBulkSendEmail("");
      setBulkSendSearchQuery("");
      setBulkSendType(null);
      setSelectedDocuments([]);
    } catch (error: any) {
      console.error("Error sending documents:", error);
      toast({
        title: "Error",
        description: "Failed to send documents",
        variant: "destructive"
      });
    } finally {
      setBulkSending(false);
    }
  };
  const handleBulkSendToTenants = async () => {
    if (bulkSelectedTenants.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one tenant",
        variant: "destructive"
      });
      return;
    }
    try {
      setBulkSending(true);
      const {
        data: currentUser
      } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");
      let successCount = 0;
      let errorCount = 0;

      // For each selected tenant
      for (const tenantId of bulkSelectedTenants) {
        const tenant = bulkTenants.find(t => t.id === tenantId);
        if (!tenant) continue;

        // Send each selected document to this tenant
        for (const docId of selectedDocuments) {
          const doc = documents.find(d => d.id === docId);
          if (!doc) continue;
          try {
            const {
              data: insertedDoc,
              error
            } = await supabase.from("documents_tenants").insert({
              tenant_id: tenant.tenant_id,
              title: doc.title,
              description: doc.description,
              format: doc.format,
              watermark: doc.watermark,
              versiondate: doc.versiondate,
              versionnumber: doc.versionnumber,
              versionlastupdated: doc.versionlastupdated,
              isclientdoc: doc.isclientdoc,
              stage: doc.stage,
              category: doc.category,
              uploaded_files: doc.uploaded_files,
              file_names: doc.file_names,
              sent_by: currentUser.user?.id
            }).select().single();
            if (error) throw error;

            // Create notification
            if (insertedDoc) {
              await supabase.from("notification_tenants").insert({
                tenant_id: tenant.tenant_id,
                document_id: insertedDoc.id,
                message: `New document received: ${doc.title}`,
                is_read: false,
                type: "Document Received"
              });
            }
            successCount++;
          } catch (error) {
            console.error(`Error sending document ${doc.id} to tenant ${tenant.companyname}:`, error);
            errorCount++;
          }
        }
      }
      if (successCount > 0) {
        toast({
          title: "Success",
          description: `${selectedDocuments.length} document(s) sent to ${bulkSelectedTenants.length} tenant${bulkSelectedTenants.length > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`
        });
      } else {
        toast({
          title: "Error",
          description: 'Failed to send documents',
          variant: 'destructive'
        });
      }
      setIsBulkSendDialogOpen(false);
      setBulkTenantSearch('');
      setBulkSelectedTenants([]);
      setBulkSendType(null);
      setBulkStateFilter('');
      setBulkCricosFilter('all');
      setBulkFrameworkFilter('');
      setSelectedDocuments([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setBulkSending(false);
    }
  };
  const handleBulkSendDialogClose = () => {
    setIsBulkSendDialogOpen(false);
    setBulkSendType(null);
    setBulkSendEmail('');
    setBulkSendSearchQuery('');
    setBulkTenantSearch('');
    setBulkSelectedTenants([]);
    setBulkStateFilter('');
    setBulkCricosFilter('all');
    setBulkFrameworkFilter('');
  };
  const toggleBulkTenantSelection = (tenantId: string) => {
    setBulkSelectedTenants(prev => prev.includes(tenantId) ? prev.filter(id => id !== tenantId) : [...prev, tenantId]);
  };
  const selectAllBulkFilteredTenants = () => {
    const allIds = bulkFilteredTenants.map(t => t.id);
    setBulkSelectedTenants(allIds);
  };
  const handleDownloadFile = async (filePath: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const {
        data,
        error
      } = await supabase.storage.from("document-files").download(filePath);
      if (error) throw error;

      // Create a download link
      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Success",
        description: "Document downloaded successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleViewFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const {
        data
      } = await supabase.storage.from("document-files").getPublicUrl(filePath);
      window.open(data.publicUrl, "_blank");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const totalDocuments = documents.length;
  const clientDocs = documents.filter(d => d.isclientdoc).length;
  const watermarkedDocs = documents.filter(d => d.watermark).length;

  // Get unique formats for filter
  const uniqueFormats = Array.from(new Set(documents.map(d => d.format).filter(Boolean)));

  // Filtered categories based on search
  const filteredCategoriesForDropdown = categories.filter(cat => cat.name.toLowerCase().includes(categorySearchQuery.toLowerCase()));

  // Filtered fields based on search
  const filteredFieldsForSheet = fields.filter(field => field.label.toLowerCase().includes(fieldSearchQuery.toLowerCase()));
  if (loading) {
    return <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-[28px] font-bold">Manage Documents</h1>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>;
  }
  const isSuperAdmin = currentUserRole === "Super Admin" || currentUserRole === "SuperAdmin";
  return <div className="space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Manage Documents</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "View and manage all system documents" : "View your documents"}
          </p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && selectedDocuments.length > 0 && <>
              <Button variant="destructive" className="gap-2" onClick={() => setIsBulkDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete ({selectedDocuments.length})
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setIsBulkSendDialogOpen(true)}>
                <Send className="h-4 w-4" />
                Send ({selectedDocuments.length})
              </Button>
            </>}
          {(isSuperAdmin || isTeamLeader) && <Dialog open={isCreateDialogOpen} onOpenChange={open => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setEditingDocumentId(null);
            setFormData({
              title: "",
              description: "",
              format: "",
              watermark: false,
              versiondate: undefined,
              versionnumber: "",
              versionlastupdated: undefined,
              isclientdoc: false,
              stage: "",
              categories: []
            });
            setUploadedFiles([]);
            setExistingFiles([]);
          }
        }}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button className={isTeamLeader ? "bg-[#696969] hover:bg-[#696969] cursor-not-allowed" : "bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"} disabled={isTeamLeader}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Document
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  {isTeamLeader && <TooltipContent>
                      <p>Please contact Super Admins.</p>
                    </TooltipContent>}
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="border-[3px] border-[#dfdfdf] flex flex-col max-h-[90vh]" style={{
            width: '650px',
            maxWidth: '90vw'
          }}>
                <DialogHeader className="p-0 flex-shrink-0">
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {editingDocumentId ? "Edit Document" : "Create New Document"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDocumentId ? "Update the document information below" : "Create a new document by providing the required information below"}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto scrollbar-hide px-1 min-h-0">
                  <div className="grid gap-4 py-4 px-1">
                  <div className="grid gap-2">
                    <Label>Order Number (Auto-populated)</Label>
                    <Input type="text" value={nextOrderNumber?.toString() || "Will be assigned automatically"} disabled className="bg-muted cursor-not-allowed" />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="title">Name *</Label>
                    <Input id="title" value={formData.title} onChange={e => setFormData({
                    ...formData,
                    title: e.target.value
                  })} required />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" value={formData.description} onChange={e => setFormData({
                    ...formData,
                    description: e.target.value
                  })} />
                  </div>

                  

                  <div className="grid gap-2">
                    <Label>Version Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black", !formData.versiondate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.versiondate ? format(formData.versiondate, "dd/MM/yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 data-[side=bottom]:p-0 data-[side=top]:p-[10px]" align="start">
                        <Calendar mode="single" selected={formData.versiondate} onSelect={date => setFormData({
                        ...formData,
                        versiondate: date
                      })} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="versionnumber">Version Number</Label>
                    <Input id="versionnumber" type="number" value={formData.versionnumber} onChange={e => setFormData({
                    ...formData,
                    versionnumber: e.target.value
                  })} />
                  </div>

                  <div className="grid gap-2">
                    <Label>Version Last Updated</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black", !formData.versionlastupdated && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.versionlastupdated ? format(formData.versionlastupdated, "dd/MM/yyyy HH:mm") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 data-[side=bottom]:p-0 data-[side=top]:p-[10px]" align="start">
                        <Calendar mode="single" selected={formData.versionlastupdated} onSelect={date => setFormData({
                        ...formData,
                        versionlastupdated: date
                      })} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  

                  <div className="grid gap-2">
                    <Label htmlFor="stage">Stage</Label>
                    <Combobox options={stages.map(stage => ({
                    value: stage.id.toString(),
                    label: stage.title
                  }))} value={formData.stage} onValueChange={value => setFormData({
                    ...formData,
                    stage: value
                  })} placeholder="Select stage..." searchPlaceholder="Search stages..." emptyText="No stages found." className="w-full" showAvatar={false} autoWidth />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between min-h-[40px] h-auto hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black" role="combobox">
                          <span className="text-muted-foreground">
                            {formData.categories.length === 0 ? "Select categories..." : `${formData.categories.length} selected`}
                          </span>
                          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 bg-background z-50" align="start" sideOffset={5}>
                        <div className="p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search categories..." value={categorySearchQuery} onChange={e => setCategorySearchQuery(e.target.value)} className="pl-8 h-9" />
                          </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                          {filteredCategoriesForDropdown.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">
                              No categories found.
                            </div> : filteredCategoriesForDropdown.map((cat, index) => {
                          const isSelected = formData.categories.includes(cat.id.toString());
                          return <div key={cat.id} className={cn("flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black border-b border-border last:border-b-0", isSelected && "bg-[hsl(196deg_100%_93.53%)] text-black")} onClick={() => {
                            if (isSelected) {
                              setFormData({
                                ...formData,
                                categories: formData.categories.filter(id => id !== cat.id.toString())
                              });
                            } else {
                              setFormData({
                                ...formData,
                                categories: [...formData.categories, cat.id.toString()]
                              });
                            }
                          }}>
                                <Checkbox checked={isSelected} />
                                <span className="font-medium">{cat.name}</span>
                              </div>;
                        })}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {formData.categories.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1">
                        {formData.categories.map(catId => {
                      const category = categories.find(c => c.id.toString() === catId);
                      return category ? <Badge key={catId} variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary text-[0.8125rem] py-1 px-3 rounded-[11px] cursor-pointer" onClick={() => {
                        setFormData({
                          ...formData,
                          categories: formData.categories.filter(id => id !== catId)
                        });
                      }}>
                              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                              {category.name}
                              <X className="ml-1.5 h-3.5 w-3.5" />
                            </Badge> : null;
                    })}
                      </div>}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="files">Files</Label>
                    <Sheet open={isFieldsSheetOpen} onOpenChange={setIsFieldsSheetOpen}>
                      <SheetContent side="right" className="w-[560px] sm:max-w-[540px] data-[state=open]:duration-500">
                        <SheetHeader>
                          <SheetTitle>Document Fields</SheetTitle>
                          <SheetDescription>Select fields to add to your document</SheetDescription>
                        </SheetHeader>
                        <div className="space-y-4 mt-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search fields..." value={fieldSearchQuery} onChange={e => setFieldSearchQuery(e.target.value)} className="pl-10" />
                          </div>
                          {filteredFieldsForSheet.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">
                              {fieldSearchQuery ? "No fields found matching your search" : "No fields available. Create fields in the Fields management page."}
                            </p> : <div className="max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-hide">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>Label</TableHead>
                                    <TableHead>Type</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {filteredFieldsForSheet.map(field => {
                                const isSelected = selectedFields.includes(field.id);
                                return <TableRow key={field.id} className="cursor-pointer" onClick={() => {
                                  setSelectedFields(prev => prev.includes(field.id) ? prev.filter(f => f !== field.id) : [...prev, field.id]);
                                }}>
                                        <TableCell>
                                          <Checkbox checked={isSelected} onCheckedChange={() => {
                                      setSelectedFields(prev => prev.includes(field.id) ? prev.filter(f => f !== field.id) : [...prev, field.id]);
                                    }} />
                                        </TableCell>
                                        <TableCell className="font-medium">{field.label}</TableCell>
                                        <TableCell>
                                          <Badge variant="secondary" style={{
                                      backgroundColor: "hsl(275deg 54% 41% / 8%)",
                                      border: "1px solid hsl(275 54% 41%)",
                                      fontSize: "12px",
                                      color: "hsl(275 54% 41%)"
                                    }}>
                                            {field.type}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>;
                              })}
                                </TableBody>
                              </Table>
                            </div>}
                          <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setIsFieldsSheetOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={() => {
                            setIsFieldsSheetOpen(false);
                            toast({
                              title: "Fields Added",
                              description: `${selectedFields.length} field(s) added to the document`
                            });
                          }}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                    <Input id="files" type="file" multiple onChange={handleFileUpload} className="cursor-pointer" />
                    
                    {/* Display existing files (edit mode) */}
                    {existingFiles.length > 0 && <div className="space-y-1 mt-2">
                        {existingFiles.map((file, index) => <div key={`existing-${index}`} className="flex items-center justify-between border border-input rounded-md px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm truncate">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              <Button type="button" variant="ghost" size="sm" onClick={async () => {
                          try {
                            if (file.url.startsWith("http")) {
                              const url = new URL(file.url);
                              const segments = url.pathname.split("/").filter(Boolean);
                              const publicIndex = segments.indexOf("public");
                              if (publicIndex !== -1 && segments.length > publicIndex + 2) {
                                const bucket = segments[publicIndex + 1];
                                const objectPath = segments.slice(publicIndex + 2).join("/");
                                const {
                                  data
                                } = supabase.storage.from(bucket).getPublicUrl(objectPath);
                                if (data.publicUrl) {
                                  window.open(data.publicUrl, "_blank");
                                } else {
                                  window.open(file.url, "_blank");
                                }
                              } else {
                                window.open(file.url, "_blank");
                              }
                            } else {
                              const {
                                data
                              } = supabase.storage.from("document-files").getPublicUrl(file.url);
                              if (data.publicUrl) {
                                window.open(data.publicUrl, "_blank");
                              }
                            }
                          } catch {
                            window.open(file.url, "_blank");
                          }
                        }} className="h-6 w-6 p-0 text-muted-foreground hover:text-primary">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setExistingFiles(prev => prev.filter((_, i) => i !== index))} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>)}
                      </div>}

                    {/* Display new uploaded files */}
                    {uploadedFiles.length > 0 && <div className="space-y-1 mt-2">
                        {uploadedFiles.map((file, index) => <div key={`new-${index}`} className="flex items-center justify-between border border-input rounded-md px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm truncate">{file.name}</span>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveFile(index)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>)}
                      </div>}

                    {/* Display Selected Fields */}
                    {selectedFields.length > 0 && <div className="space-y-3 mt-4 pt-4 border-t">
                        <Label className="text-sm font-medium">Document Fields</Label>
                        {selectedFields.map(fieldId => {
                      const field = fields.find(f => f.id === fieldId);
                      if (!field) return null;
                      return <div key={field.id} className="grid gap-2">
                              <Label htmlFor={`field-${field.id}`}>{field.label}</Label>
                              {field.type === "text" && <Input id={`field-${field.id}`} placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "number" && <Input id={`field-${field.id}`} type="number" placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "email" && <Input id={`field-${field.id}`} type="email" placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "date" && <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className="justify-start text-left font-normal">
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      Pick a date
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" initialFocus className="pointer-events-auto" />
                                  </PopoverContent>
                                </Popover>}
                              {field.type === "datetime-local" && <Input id={`field-${field.id}`} type="datetime-local" />}
                              {field.type === "time" && <Input id={`field-${field.id}`} type="time" />}
                              {field.type === "tel" && <Input id={`field-${field.id}`} type="tel" placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "url" && <Input id={`field-${field.id}`} type="url" placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "checkbox" && <div className="flex items-center gap-2">
                                  <Checkbox id={`field-${field.id}`} />
                                  <Label htmlFor={`field-${field.id}`} className="text-sm font-normal">
                                    {field.label}
                                  </Label>
                                </div>}
                              {field.type === "select" && <Select>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select option" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="option1">Option 1</SelectItem>
                                    <SelectItem value="option2">Option 2</SelectItem>
                                  </SelectContent>
                                </Select>}
                              {field.type === "textarea" && <Textarea id={`field-${field.id}`} placeholder={`Enter ${field.label.toLowerCase()}`} />}
                              {field.type === "file" && <Input id={`field-${field.id}`} type="file" />}
                              {field.type === "color" && <Input id={`field-${field.id}`} type="color" className="h-10 w-20" />}
                              {field.type === "range" && <Input id={`field-${field.id}`} type="range" />}
                            </div>;
                    })}
                      </div>}
                  </div>
                  </div>
                </div>

                {/* Sheet for Document Fields */}
                <Sheet open={isFieldsSheetOpen} onOpenChange={setIsFieldsSheetOpen}>
                  <SheetContent side="right" className="w-[560px] sm:max-w-[540px] data-[state=open]:duration-500">
                    <SheetHeader>
                      <SheetTitle>Document Fields</SheetTitle>
                      <SheetDescription>Select fields to add to your document</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 mt-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search fields..." value={fieldSearchQuery} onChange={e => setFieldSearchQuery(e.target.value)} className="pl-10" />
                      </div>
                      {filteredFieldsForSheet.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">
                          {fieldSearchQuery ? "No fields found matching your search" : "No fields available. Create fields in the Fields management page."}
                        </p> : <div className="max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-hide">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead>Type</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredFieldsForSheet.map(field => {
                          const isSelected = selectedFields.includes(field.id);
                          return <TableRow key={field.id} className="cursor-pointer" onClick={() => {
                            setSelectedFields(prev => prev.includes(field.id) ? prev.filter(f => f !== field.id) : [...prev, field.id]);
                          }}>
                                    <TableCell>
                                      <Checkbox checked={isSelected} onCheckedChange={() => {
                                setSelectedFields(prev => prev.includes(field.id) ? prev.filter(f => f !== field.id) : [...prev, field.id]);
                              }} />
                                    </TableCell>
                                    <TableCell className="font-medium">{field.label}</TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" style={{
                                backgroundColor: "hsl(275deg 54% 41% / 8%)",
                                border: "1px solid hsl(275 54% 41%)",
                                fontSize: "12px",
                                color: "hsl(275 54% 41%)"
                              }}>
                                        {field.type}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>;
                        })}
                            </TableBody>
                          </Table>
                        </div>}
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsFieldsSheetOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={() => {
                      setIsFieldsSheetOpen(false);
                      toast({
                        title: "Fields Added",
                        description: `${selectedFields.length} field(s) added to the document`
                      });
                    }}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>

                <DialogFooter className="flex-shrink-0 pt-4 mt-4 border-t">
                  <Button variant="outline" size="default" type="button" onClick={() => setIsCreateDialogOpen(false)} className="hover:bg-[#40c6e524] hover:text-black">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateDocument} disabled={!formData.title}>
                    {editingDocumentId ? "Update Document" : "Create Document"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}
        </div>
      </div>

      {/* Statistics Cards - Only for Super Admins */}
      {isSuperAdmin && <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="animate-fade-in cursor-pointer hover:shadow-lg transition-all" onClick={() => {
        setFormatFilter("all");
      }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-[22px] w-[22px] text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documentsCount}</div>
              <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary">Click to manage</p>
            </CardContent>
          </Card>

          <Card className="animate-fade-in cursor-pointer hover:shadow-lg transition-all" style={{
        animationDelay: "100ms"
      }} onClick={() => navigate("/manage-categories")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
              <FolderTree className="h-[22px] w-[22px] text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categoriesCount}</div>
              <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary">Click to manage</p>
            </CardContent>
          </Card>

          <Card className="animate-fade-in cursor-pointer hover:shadow-lg transition-all" style={{
        animationDelay: "200ms"
      }} onClick={() => navigate("/manage-stages")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stages</CardTitle>
              <ListTree className="h-[22px] w-[22px] text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stagesCount}</div>
              <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary">Click to manage</p>
            </CardContent>
          </Card>

          <Card className="animate-fade-in cursor-pointer hover:shadow-lg transition-all" style={{
        animationDelay: "300ms"
      }} onClick={() => navigate("/manage-fields")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fields</CardTitle>
              <FileStack className="h-[22px] w-[22px] text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fieldsCount}</div>
              <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary">Click to manage</p>
            </CardContent>
          </Card>
        </div>}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input placeholder="Search by ID, name, or description..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50" />
        </div>

        <div className="w-full md:w-[200px]">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 justify-between font-semibold rounded-lg shadow-sm transition-all">
                <span className="text-foreground truncate">
                  {categoryFilter === "all" ? "All Categories" : categories.find(c => c.id.toString() === categoryFilter)?.name || "Category"}
                </span>
                <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/60 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 min-w-[240px] rounded-lg shadow-lg border-border/50 bg-popover z-50" align="start">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." value={categorySearchQuery} onChange={e => setCategorySearchQuery(e.target.value)} className="pl-9 h-9 text-sm rounded-md" />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                <div className={cn("px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2 whitespace-nowrap", categoryFilter === "all" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")} onClick={() => {
                  setCategoryFilter("all");
                  setCategorySearchQuery("");
                }}>
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  All Categories
                </div>
                <div className="mx-2 my-1 border-b border-border/50" />
                {filteredCategoriesForDropdown.map((cat, index) => (
                  <div key={cat.id}>
                    <div className={cn("px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2 whitespace-nowrap", categoryFilter === cat.id.toString() ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")} onClick={() => {
                      setCategoryFilter(cat.id.toString());
                      setCategorySearchQuery("");
                    }}>
                      <FolderOpen className={cn("h-4 w-4 shrink-0", categoryFilter === cat.id.toString() ? "text-primary" : "text-blue-600")} />
                      <span className="truncate">{cat.name}</span>
                    </div>
                    {index < filteredCategoriesForDropdown.length - 1 && (
                      <div className="mx-2 my-1 border-b border-border/50" />
                    )}
                  </div>
                ))}
                {filteredCategoriesForDropdown.length === 0 && categorySearchQuery && <p className="text-xs text-muted-foreground text-center py-2">No categories found</p>}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-lg border-0 bg-card shadow-lg overflow-x-auto">
          <Table className="min-w-[2000px]">
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-24">
                  ID
                </TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground min-w-[200px] h-14 whitespace-nowrap border-r">
                  Name
                </TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground min-w-[250px] h-14 whitespace-nowrap border-r">Description</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-24 h-14 whitespace-nowrap border-r text-center">Files</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-28 h-14 whitespace-nowrap border-r text-center">Created By</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-32 h-14 whitespace-nowrap border-r">
                  Version Date
                </TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-32 h-14 whitespace-nowrap border-r">Version #</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-40 h-14 whitespace-nowrap border-r">Version Updated</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-32 h-14 whitespace-nowrap border-r">Client Doc</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-24 h-14 whitespace-nowrap border-r">Stage</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-32 h-14 whitespace-nowrap border-r">Category</TableHead>
                <TableHead className="font-semibold bg-muted/30 text-foreground w-24 h-14 whitespace-nowrap text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.length === 0 ? <TableRow>
                  <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                    No documents found
                  </TableCell>
                </TableRow> : paginatedDocuments.map((doc, index) => {
            const isNew = doc.sent_at && new Date().getTime() - new Date(doc.sent_at).getTime() < 24 * 60 * 60 * 1000;
            const categoryIds = doc.category ? doc.category.split(',') : [];
            const categoryBadges = categoryIds.map(id => categories.find(c => c.id === parseInt(id.trim()))?.name).filter(Boolean);
            return <TableRow key={doc.id} className="group hover:bg-primary/5 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20 animate-fade-in" style={{
              animationDelay: `${index * 30}ms`
            }} onClick={() => {
              setEditingDocumentId(doc.id);
              setIsCreateDialogOpen(true);
            }}>
                      <TableCell className="py-6 border-r border-border/50 w-24">
                        <span className="font-semibold text-foreground">{doc.id}</span>
                      </TableCell>
                      <TableCell className="py-6 border-r border-border/50" style={{
                minWidth: '200px'
              }}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-semibold text-foreground">{doc.title}</span>
                            {isNew && <Badge variant="outline" className="text-xs font-medium" style={{
                      borderColor: "#22C55E",
                      color: "#22C55E",
                      backgroundColor: "#22C55E10",
                      borderWidth: "1.5px"
                    }}>
                              New
                            </Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1 pt-[5px]">
                            <CalendarIcon className="h-3 w-3" />
                            Created: {doc.createdat ? format(new Date(doc.createdat), "MM/dd/yyyy") : "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap py-6 border-r border-border/50">
                        <div className="truncate max-w-[230px]">{doc.description || "—"}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 border-r border-border/50 text-center" onClick={e => e.stopPropagation()}>
                        {doc.uploaded_files && doc.uploaded_files.length > 0 ? <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium cursor-pointer">
                            <FileText className="h-3 w-3 mr-1" />
                            {doc.uploaded_files.length} {doc.uploaded_files.length === 1 ? 'File' : 'Files'}
                          </Badge> : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 border-r border-border/50">
                        <div className="flex items-center justify-center">
                          {doc.creator ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center cursor-pointer border border-border">
                                    {doc.creator.avatar_url ? (
                                      <img 
                                        src={doc.creator.avatar_url} 
                                        alt={`${doc.creator.first_name || ''} ${doc.creator.last_name || ''}`}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {(doc.creator.first_name?.[0] || '').toUpperCase()}
                                        {(doc.creator.last_name?.[0] || '').toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{doc.creator.first_name} {doc.creator.last_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap py-6 text-muted-foreground border-r border-border/50">
                        {doc.versiondate ? format(new Date(doc.versiondate), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 border-r border-border/50 text-center">
                        {doc.versionnumber ? <Badge variant="secondary" className="text-xs font-medium py-[3px] rounded-[9px]">
                            v{doc.versionnumber}
                          </Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap py-6 text-muted-foreground border-r border-border/50">
                        {doc.versionlastupdated ? format(new Date(doc.versionlastupdated), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 border-r border-border/50 text-center">
                        <Badge variant="outline" className="text-xs font-medium py-[3px] rounded-[9px]" style={doc.isclientdoc ? {
                  borderColor: "#3B82F6",
                  color: "#3B82F6",
                  backgroundColor: "#3B82F610",
                  borderWidth: "1.5px"
                } : {}}>
                          {doc.isclientdoc ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 text-muted-foreground text-sm border-r border-border/50">
                        {stages.find(s => s.id === doc.stage)?.title || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6 text-muted-foreground text-sm border-r border-border/50">
                        {categoryBadges.length > 0 ? categoryBadges.length > 1 ? `${categoryBadges[0]} +${categoryBadges.length - 1}` : categoryBadges[0] : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-6">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={e => {
                    e.stopPropagation();
                    setEditingDocumentId(doc.id);
                    setIsCreateDialogOpen(true);
                  }}>
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10" onClick={e => {
                    e.stopPropagation();
                    setDocumentToDelete(doc.id);
                    setIsDeleteDialogOpen(true);
                  }}>
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>;
          })}
            </TableBody>
          </Table>
      </div>

      {/* Pagination */}
      {filteredDocuments.length > 0 && <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredDocuments.length)}–{Math.min(currentPage * itemsPerPage, filteredDocuments.length)} of {filteredDocuments.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
              
              {Array.from({
            length: totalPages
          }, (_, i) => i + 1).filter(page => {
            if (totalPages <= 7) return true;
            if (page === 1 || page === totalPages) return true;
            if (page >= currentPage - 1 && page <= currentPage + 1) return true;
            return false;
          }).map((page, index, array) => {
            if (index > 0 && array[index - 1] !== page - 1) {
              return [<PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-4">...</span>
                      </PaginationItem>, <PaginationItem key={page}>
                        <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                          {page}
                        </PaginationLink>
                      </PaginationItem>];
            }
            return <PaginationItem key={page}>
                      <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                        {page}
                      </PaginationLink>
                    </PaginationItem>;
          })}
              
              <PaginationItem>
                <PaginationNext onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>}

      {/* Bulk Delete Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Documents?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDocuments.length} document(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Document Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="hover:bg-muted hover:text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
            if (!documentToDelete) return;
            try {
              const {
                error
              } = await supabase.from("documents").delete().eq("id", documentToDelete);
              if (error) throw error;
              toast({
                title: "Success",
                description: "Document deleted successfully"
              });
              setDocumentToDelete(null);
              setIsDeleteDialogOpen(false);
              fetchDocuments();
            } catch (error: any) {
              toast({
                title: "Error",
                description: error.message,
                variant: "destructive"
              });
            }
          }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Send Dialog - Same two-step flow as DocumentDetail */}
      <Dialog open={isBulkSendDialogOpen} onOpenChange={handleBulkSendDialogClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Send {selectedDocuments.length} Document(s)</DialogTitle>
          </DialogHeader>
          
          {/* Step 1: Select Send Type */}
          {!bulkSendType && <div className="space-y-4 py-6">
              <p className="text-sm text-muted-foreground">Choose how you want to send these documents:</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setBulkSendType('email')} className="p-6 border-2 rounded-lg hover:border-primary hover:bg-accent transition-all flex flex-col items-center gap-3">
                  <Mail className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold">Send to Email</h3>
                    <p className="text-xs text-muted-foreground mt-1">Send to a specific user by email</p>
                  </div>
                </button>
                <button onClick={() => setBulkSendType('tenant')} className="p-6 border-2 rounded-lg hover:border-primary hover:bg-accent transition-all flex flex-col items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold">Send to Tenant</h3>
                    <p className="text-xs text-muted-foreground mt-1">Send to one or more tenants with filtering</p>
                  </div>
                </button>
              </div>
            </div>}

          {/* Step 2a: Send to Email */}
          {bulkSendType === 'email' && <>
              <div className="space-y-4 py-4 flex-1 overflow-y-auto">
                <div className="space-y-2">
                  <Label>Recipient Email</Label>
                  <Input placeholder="Search by email or name..." value={bulkSendSearchQuery} onChange={e => {
                setBulkSendSearchQuery(e.target.value);
                setBulkSendEmail(e.target.value);
              }} />
                  {bulkSendFilteredUsers.length > 0 && bulkSendSearchQuery && <div className="border rounded-md max-h-48 overflow-y-auto">
                      {bulkSendFilteredUsers.map(user => <button key={user.user_uuid} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => {
                  setBulkSendSearchQuery(user.email);
                  setBulkSendEmail(user.email);
                  setBulkSendFilteredUsers([]);
                }}>
                          <div className="font-medium">{user.email}</div>
                          <div className="text-muted-foreground text-xs">
                            {user.first_name} {user.last_name}
                          </div>
                        </button>)}
                    </div>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkSendType(null)}>
                  Back
                </Button>
                <Button onClick={handleBulkSend} disabled={!bulkSendEmail || bulkSending}>
                  {bulkSending ? 'Sending...' : 'Send'}
                </Button>
              </DialogFooter>
            </>}

          {/* Step 2b: Send to Tenant */}
          {bulkSendType === 'tenant' && <>
              <div className="space-y-4 py-4 flex-1 overflow-y-auto">
                <div className="flex gap-2">
                  <Input placeholder="Search tenants by name, RTO, or email..." value={bulkTenantSearch} onChange={e => setBulkTenantSearch(e.target.value)} className="flex-1" />
                  <Button variant="outline" size="icon" onClick={() => setIsBulkFilterOpen(!isBulkFilterOpen)}>
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {bulkFilteredTenants.length} tenant{bulkFilteredTenants.length !== 1 ? 's' : ''} found
                    {bulkSelectedTenants.length > 0 && ` (${bulkSelectedTenants.length} selected)`}
                  </p>
                  {bulkFilteredTenants.length > 0 && <Button variant="outline" size="sm" onClick={selectAllBulkFilteredTenants}>
                      Select All
                    </Button>}
                </div>

                <div className="border rounded-md max-h-96 overflow-y-auto">
                  {bulkFilteredTenants.length === 0 ? <div className="p-8 text-center text-muted-foreground">
                      No tenants found matching your criteria
                    </div> : <div className="divide-y">
                      {bulkFilteredTenants.map(tenant => <div key={tenant.id} className="p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox checked={bulkSelectedTenants.includes(tenant.id)} onCheckedChange={() => toggleBulkTenantSelection(tenant.id)} className="mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-medium text-sm truncate">{tenant.companyname}</h4>
                                <Button variant="ghost" size="sm" onClick={() => setBulkExpandedTenant(bulkExpandedTenant === tenant.id ? null : tenant.id)}>
                                  {bulkExpandedTenant === tenant.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>
                              {tenant.rto_name && <p className="text-xs text-muted-foreground truncate">{tenant.rto_name}</p>}
                              {bulkExpandedTenant === tenant.id && <div className="mt-2 pt-2 border-t space-y-1 text-xs">
                                  {tenant.state && <div className="flex gap-2">
                                      <span className="text-muted-foreground">State:</span>
                                      <span className="font-medium">{tenant.state}</span>
                                    </div>}
                                  {tenant.cricos_id && <div className="flex gap-2">
                                      <span className="text-muted-foreground">CRICOS:</span>
                                      <span className="font-medium">{tenant.cricos_id}</span>
                                    </div>}
                                  {tenant.framework && <div className="flex gap-2">
                                      <span className="text-muted-foreground">Framework:</span>
                                      <span className="font-medium">{tenant.framework}</span>
                                    </div>}
                                  {tenant.email && <div className="flex gap-2">
                                      <span className="text-muted-foreground">Email:</span>
                                      <span className="font-medium">{tenant.email}</span>
                                    </div>}
                                </div>}
                            </div>
                          </div>
                        </div>)}
                    </div>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkSendType(null)}>
                  Back
                </Button>
                <Button onClick={handleBulkSendToTenants} disabled={bulkSelectedTenants.length === 0 || bulkSending}>
                  {bulkSending ? 'Sending...' : `Send to ${bulkSelectedTenants.length} Tenant${bulkSelectedTenants.length !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </>}
        </DialogContent>
      </Dialog>

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground text-center">
        Showing {filteredDocuments.length} of {totalDocuments} documents
      </div>
    </div>;
}