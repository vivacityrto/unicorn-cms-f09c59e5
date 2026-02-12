import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft, Edit, Send, Copy, Trash2, FileText, Upload, Download, Eye, X, CalendarIcon, MessageSquare, Plus, Mail, Building2, ChevronDown, ChevronUp, History, Layers, Scan } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { DocumentVersionHistory } from '@/components/document/DocumentVersionHistory';
import { DocumentStageUsagePanel } from '@/components/document/DocumentStageUsagePanel';
import { ExcelDataSourcesTab } from '@/components/document/ExcelDataSourcesTab';
import { ExcelFieldsTab } from '@/components/document/ExcelFieldsTab';
import { MergeFieldsEditor } from '@/components/document/MergeFieldsEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, FileText as FileTextIcon, GitBranch, Table, FileSpreadsheet } from 'lucide-react';
import { DocumentScanStatus } from '@/components/document/DocumentScanStatus';

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
  createdat: string | null;
  updated_at: string | null;
  uploaded_files: string[] | null;
  file_names: string[] | null;
}

interface User {
  email: string;
  first_name: string;
  last_name: string;
  user_uuid: string;
}

interface Tenant {
  id: string;
  tenant_id: number;
  companyname: string;
  rto_name: string | null;
  state: string | null;
  cricos_id: string | null;
  email: string | null;
  framework: string | null;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [emailSearch, setEmailSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [sending, setSending] = useState(false);
  
  // Send type selection state
  const [sendType, setSendType] = useState<'email' | 'tenant' | null>(null);
  
  // Tenant send state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [stages, setStages] = useState<Array<{ id: number; title: string }>>([]);
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    format: '',
    watermark: false,
    versiondate: undefined as Date | undefined,
    versionnumber: '',
    versionlastupdated: undefined as Date | undefined,
    isclientdoc: false,
    stage: '',
    categories: [] as string[],
  });

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('documents_categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchStages = async () => {
    try {
      const { data, error } = await supabase
        .from('documents_stages')
        .select('id, title')
        .order('title', { ascending: true });

      if (error) throw error;
      setStages((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching stages:', error);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDocument();
      fetchUsers();
      fetchCategories();
      fetchStages();
      fetchTenants();
    }
  }, [id]);

  useEffect(() => {
    if (emailSearch) {
      const filtered = users.filter(user => 
        user.email.toLowerCase().includes(emailSearch.toLowerCase()) ||
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(emailSearch.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers([]);
    }
  }, [emailSearch, users]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      
      // Check if user is Super Admin or Team Leader
      const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
      const isTeamLeader = profile?.unicorn_role === 'Team Leader';
      
      if (isSuperAdmin || isTeamLeader) {
        // Super Admins and Team Leaders fetch from documents table
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', parseInt(id!))
          .maybeSingle();

        if (error) throw error;
        setDocument(data);
      } else {
        // Admin/User fetch from documents_tenants table
        const { data, error } = await supabase
          .from('documents_tenants')
          .select('*')
          .eq('id', parseInt(id!))
          .maybeSingle();

        if (error) throw error;
        // Map documents_tenants structure to Document interface
        if (data) {
          const mappedDoc = {
            ...data,
            createdat: data.created_at,
          };
          setDocument(mappedDoc as any);
        } else {
          setDocument(null);
        }
      }
    } catch (error: any) {
      console.error('Error fetching document:', error);
      toast({
        title: 'Error',
        description: 'Failed to load document',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('email, first_name, last_name, user_uuid');

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('id, tenant_id, companyname, rto_name, state, cricos_id, email, framework, status')
        .or('status.is.null,status.neq.inactive')
        .order('companyname', { ascending: true })
        .limit(1000);

      if (error) throw error;
      setTenants(data || []);
      setFilteredTenants(data || []);
    } catch (error: any) {
      console.error('Error fetching tenants:', error);
    }
  };

  // Apply tenant filters
  useEffect(() => {
    let result = tenants;

    // Search filter
    if (tenantSearch) {
      result = result.filter(tenant => 
        tenant.companyname.toLowerCase().includes(tenantSearch.toLowerCase()) ||
        (tenant.rto_name && tenant.rto_name.toLowerCase().includes(tenantSearch.toLowerCase())) ||
        (tenant.email && tenant.email.toLowerCase().includes(tenantSearch.toLowerCase()))
      );
    }

    setFilteredTenants(result);
    setCurrentPage(1); // Reset to first page when search changes
  }, [tenants, tenantSearch]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTenants = filteredTenants.slice(startIndex, endIndex);

  const handleSendToEmail = async () => {
    if (!selectedEmail || !document) return;

    // Verify email exists in users table and get tenant_id
    const user = users.find(u => u.email === selectedEmail);
    if (!user) {
      toast({
        title: 'Error',
        description: 'Email not found in users database',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSending(true);

      // Get user's tenant_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('email', selectedEmail)
        .single();

      if (userError || !userData?.tenant_id) {
        toast({
          title: 'Error',
          description: 'Could not find tenant for this user',
          variant: 'destructive',
        });
        return;
      }

      // Get current user ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      // Insert into documents_tenants (not duplicating in documents)
      const { data: insertedDoc, error } = await supabase
        .from('documents_tenants')
        .insert({
          tenant_id: userData.tenant_id,
          title: document.title,
          description: document.description,
          format: document.format,
          watermark: document.watermark,
          versiondate: document.versiondate,
          versionnumber: document.versionnumber,
          versionlastupdated: document.versionlastupdated,
          isclientdoc: document.isclientdoc,
          stage: document.stage,
          category: document.category,
          uploaded_files: document.uploaded_files,
          file_names: document.file_names,
          sent_by: currentUser?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for the receiving tenant
      if (insertedDoc) {
        const { error: notifError } = await supabase
          .from('notification_tenants')
          .insert({
            tenant_id: userData.tenant_id,
            document_id: insertedDoc.id,
            message: `New document received: ${document.title}`,
            is_read: false,
            type: 'Document Received',
          });

        if (notifError) {
          console.error('Error creating notification:', notifError);
          // Still show success for document send even if notification fails
        } else {
          console.log('Notification created successfully for tenant:', userData.tenant_id);
        }
      }

      toast({
        title: 'Success',
        description: `Document sent to ${selectedEmail}`,
      });

      // Reset state
      setIsSendDialogOpen(false);
      setEmailSearch('');
      setSelectedEmail('');
      setSendType(null);
    } catch (error: any) {
      console.error('Error sending document:', error);
      toast({
        title: 'Error',
        description: 'Failed to send document',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendToTenants = async () => {
    if (selectedTenants.length === 0 || !document) return;

    try {
      setSending(true);

      // Get current user ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      let successCount = 0;
      let errorCount = 0;

      // Update document to mark it as released
      const { error: updateError } = await supabase
        .from('documents')
        .update({ is_released: true })
        .eq('id', document.id);

      if (updateError) throw updateError;

      // Create notifications for each selected tenant
      for (const tenantId of selectedTenants) {
        const tenant = tenants.find(t => t.id === tenantId);
        if (!tenant) continue;

        try {
          await supabase
            .from('notification_tenants')
            .insert({
              tenant_id: tenant.tenant_id,
              document_id: document.id,
              message: `New document received: ${document.title}`,
              is_read: false,
              type: 'Document Received',
            });

          successCount++;
        } catch (error) {
          console.error(`Error creating notification for tenant ${tenant.companyname}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Document sent to ${successCount} tenant${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to send document to tenants',
          variant: 'destructive',
        });
      }

      // Reset state
      setIsSendDialogOpen(false);
      setTenantSearch('');
      setSelectedTenants([]);
      setSendType(null);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error sending document:', error);
      toast({
        title: 'Error',
        description: 'Failed to send document',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendDialogClose = () => {
    setIsSendDialogOpen(false);
    setSendType(null);
    setEmailSearch('');
    setSelectedEmail('');
    setTenantSearch('');
    setSelectedTenants([]);
    setCurrentPage(1);
  };

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenants(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  const selectAllFilteredTenants = () => {
    const allIds = filteredTenants.map(t => t.id);
    setSelectedTenants(allIds);
  };

  const handleDuplicate = async () => {
    if (!document) return;

    try {
      // Copy files to new paths if they exist
      const newFileUrls: string[] = [];
      const newFileNames: string[] = [];

      if (document.uploaded_files && document.uploaded_files.length > 0) {
        for (let i = 0; i < document.uploaded_files.length; i++) {
          const filePath = document.uploaded_files[i];
          const fileName = document.file_names?.[i] || 'file';
          
          try {
            // Download the original file
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('document-files')
              .download(filePath);

            if (downloadError) throw downloadError;

            // Upload with a new unique name
            const newFileName = `${Date.now()}-copy-${fileName}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('document-files')
              .upload(newFileName, fileData);

            if (uploadError) throw uploadError;

            newFileUrls.push(uploadData.path);
            newFileNames.push(fileName);
          } catch (fileError) {
            console.error('Error copying file:', fileError);
            // Continue with other files even if one fails
          }
        }
      }

      const { error } = await supabase
        .from('documents')
        .insert({
          title: `${document.title} (Copy)`,
          description: document.description,
          format: document.format,
          watermark: document.watermark,
          versiondate: document.versiondate,
          versionnumber: document.versionnumber,
          versionlastupdated: new Date().toISOString(),
          isclientdoc: document.isclientdoc,
          stage: document.stage,
          category: document.category,
          uploaded_files: newFileUrls.length > 0 ? newFileUrls : null,
          file_names: newFileNames.length > 0 ? newFileNames : null,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document duplicated successfully',
      });

      navigate('/manage-documents');
    } catch (error: any) {
      console.error('Error duplicating document:', error);
      toast({
        title: 'Error',
        description: 'Failed to duplicate document',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!document) return;

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });

      navigate('/manage-documents');
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const handleEditClick = () => {
    if (!document) return;
    
    const categoryIds = document.category ? document.category.split(',').map(id => id.trim()) : [];
    
    // Populate edit form with current document data
    setEditFormData({
      title: document.title || '',
      description: document.description || '',
      format: document.format || '',
      watermark: document.watermark || false,
      versiondate: document.versiondate ? new Date(document.versiondate) : undefined,
      versionnumber: document.versionnumber?.toString() || '',
      versionlastupdated: document.versionlastupdated ? new Date(document.versionlastupdated) : undefined,
      isclientdoc: document.isclientdoc || false,
      stage: document.stage?.toString() || '',
      categories: categoryIds,
    });
    setUploadedFiles([]);
    setIsEditDialogOpen(true);
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

  const handleUpdateDocument = async () => {
    if (!document) return;

    try {
      // Upload new files to storage if any
      const fileUrls: string[] = [...(document.uploaded_files || [])];
      const fileNames: string[] = [...(document.file_names || [])];
      
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('document-files')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          fileUrls.push(uploadData.path);
          fileNames.push(file.name);
        }
      }

      const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
      const isTeamLeader = profile?.unicorn_role === 'Team Leader';

      if (isSuperAdmin || isTeamLeader) {
        // Super Admin and Team Leader: Update master document
        const { error } = await supabase
          .from('documents')
          .update({
            title: editFormData.title,
            description: editFormData.description || null,
            format: editFormData.format || null,
            watermark: editFormData.watermark,
            versiondate: editFormData.versiondate ? format(editFormData.versiondate, 'yyyy-MM-dd') : null,
            versionnumber: editFormData.versionnumber ? parseInt(editFormData.versionnumber) : null,
            versionlastupdated: editFormData.versionlastupdated ? editFormData.versionlastupdated.toISOString() : null,
            isclientdoc: editFormData.isclientdoc,
            stage: editFormData.stage ? parseInt(editFormData.stage) : null,
            category: editFormData.categories.length > 0 ? editFormData.categories.join(',') : null,
            uploaded_files: fileUrls,
            file_names: fileNames,
            updated_at: new Date().toISOString(),
          })
          .eq('id', document.id);

        if (error) throw error;

        // Update the documents_tenants entry directly (no linked documents since document_id removed)
        const { error: updateError } = await supabase
          .from('documents_tenants')
          .update({
            title: editFormData.title,
            description: editFormData.description || null,
            format: editFormData.format || null,
            watermark: editFormData.watermark,
            versiondate: editFormData.versiondate ? format(editFormData.versiondate, 'yyyy-MM-dd') : null,
            versionnumber: editFormData.versionnumber ? parseInt(editFormData.versionnumber) : null,
            versionlastupdated: editFormData.versionlastupdated ? editFormData.versionlastupdated.toISOString() : null,
            isclientdoc: editFormData.isclientdoc,
            stage: editFormData.stage ? parseInt(editFormData.stage) : null,
            category: editFormData.categories.length > 0 ? editFormData.categories.join(',') : null,
            uploaded_files: fileUrls,
            file_names: fileNames,
            updated_at: new Date().toISOString(),
          })
          .eq('id', document.id);

        if (updateError) throw updateError;

        // Get tenant_id for notification
        const { data: docData } = await supabase
          .from('documents_tenants')
          .select('tenant_id')
          .eq('id', document.id)
          .single();

        if (docData) {
          // Create notification for the tenant
          const { error: notifError } = await supabase
            .from('notification_tenants')
            .insert({
              tenant_id: docData.tenant_id,
              document_id: document.id,
              message: `Document updated: ${editFormData.title}`,
              type: 'Document Updated',
            });

          if (notifError) console.error('Error creating notification:', notifError);
        }
      } else {
        // Admin/User: Update their tenant document
        const { error } = await supabase
          .from('documents_tenants')
          .update({
            title: editFormData.title,
            description: editFormData.description || null,
            format: editFormData.format || null,
            watermark: editFormData.watermark,
            versiondate: editFormData.versiondate ? format(editFormData.versiondate, 'yyyy-MM-dd') : null,
            versionnumber: editFormData.versionnumber ? parseInt(editFormData.versionnumber) : null,
            versionlastupdated: editFormData.versionlastupdated ? editFormData.versionlastupdated.toISOString() : null,
            isclientdoc: editFormData.isclientdoc,
            stage: editFormData.stage ? parseInt(editFormData.stage) : null,
            category: editFormData.categories.length > 0 ? editFormData.categories.join(',') : null,
            uploaded_files: fileUrls,
            file_names: fileNames,
            updated_at: new Date().toISOString(),
          })
          .eq('id', document.id);

        if (error) throw error;

        // Create notification for the tenant and connected super admins
        if (profile?.tenant_id) {
          // Notification for the admin's own tenant
          const { error: notifError } = await supabase
            .from('notification_tenants')
            .insert({
              tenant_id: profile.tenant_id,
              document_id: document.id,
              message: `Document updated: ${editFormData.title}`,
              type: 'Document Updated',
            });

          if (notifError) console.error('Error creating notification:', notifError);

          // Get all super admin users connected to this tenant
          const { data: connectedSuperAdmins, error: connectedError } = await supabase
            .from('connected_tenants')
            .select('user_uuid')
            .eq('tenant_id', profile.tenant_id);

          if (!connectedError && connectedSuperAdmins && connectedSuperAdmins.length > 0) {
            // For each connected super admin, check if they are actually super admin
            for (const connection of connectedSuperAdmins) {
              const { data: superAdminUser, error: userError } = await supabase
                .from('users')
                .select('unicorn_role, tenant_id')
                .eq('user_uuid', connection.user_uuid)
                .single();

              // If user is super admin
              if (!userError && superAdminUser && superAdminUser.unicorn_role === 'Super Admin') {
                // Create notification for this super admin viewing as this tenant
                const { error: superAdminNotifError } = await supabase
                  .from('notification_tenants')
                  .insert({
                    tenant_id: profile.tenant_id,
                    document_id: document.id,
                    message: `Tenant updated document: ${editFormData.title}`,
                    type: 'Document Updated',
                  });

                if (superAdminNotifError) console.error('Error creating super admin notification:', superAdminNotifError);
              }
            }
          }
        }
      }

      toast({
        title: 'Success',
        description: 'Document updated successfully',
      });

      setIsEditDialogOpen(false);
      setUploadedFiles([]);
      fetchDocument(); // Refresh document data
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Document not found</p>
        <Button onClick={() => navigate(-1)} variant="outline" className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const isNew = document.createdat && 
    new Date().getTime() - new Date(document.createdat).getTime() < 24 * 60 * 60 * 1000;

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('document-files')
        .download(filePath);

      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(link);

      toast({
        title: 'Success',
        description: 'File downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleViewFile = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('document-files')
        .createSignedUrl(filePath, 3600);

      if (error || !data?.signedUrl) throw error || new Error('Failed to generate file URL');
      window.open(data.signedUrl, '_blank');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Header with Back Button and Actions */}
      <div className="flex items-center justify-between">
        <Button 
          onClick={() => navigate(-1)} 
          variant="ghost" 
          className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
          style={{
            boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
            border: '1px solid #00000052'
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          {(profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader') ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleEditClick}
                className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline" 
                size="sm"
                onClick={() => setIsSendDialogOpen(true)}
                className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDuplicate}
                className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleEditClick}
                className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline" 
                size="sm"
                onClick={() => navigate('/messages')}
                className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                style={{
                  boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                  border: '1px solid #00000052'
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Document Title Section */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-primary/10">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{document.title}</h1>
            {isNew && (
              <Badge 
                variant="outline"
                className="text-xs font-medium"
                style={{
                  borderColor: '#22C55E',
                  color: '#22C55E',
                  backgroundColor: '#22C55E10',
                  borderWidth: '1.5px'
                }}
              >
                New
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">Document #{document.id}</p>
        </div>
      </div>

      {/* Document Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Document Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 divide-y-0">
              <div className="space-y-1 pb-4 border-b col-span-2">
                <p className="text-sm text-muted-foreground">Order Number</p>
                <p className="text-lg font-semibold">{document.id}</p>
              </div>
              <div className="space-y-1 pt-4 pb-4 border-b col-span-1">
                <p className="text-sm text-muted-foreground">Format</p>
                {document.format ? (
                  <Badge variant="secondary" className="text-sm">{document.format}</Badge>
                ) : (
                  <p className="text-muted-foreground">N/A</p>
                )}
              </div>
              <div className="space-y-1 pt-4 pb-4 border-b col-span-1">
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="font-medium">{document.versionnumber ? `v${document.versionnumber}` : 'N/A'}</p>
              </div>
              <div className="space-y-1 pt-4 pb-4 border-b col-span-1">
                <p className="text-sm text-muted-foreground">Version Date</p>
                <p className="font-medium">
                  {document.versiondate ? format(new Date(document.versiondate), 'dd MMM yyyy') : 'N/A'}
                </p>
              </div>
              <div className="space-y-1 pt-4 pb-4 border-b col-span-1">
                <p className="text-sm text-muted-foreground">Watermark</p>
                <Badge variant={document.watermark ? 'default' : 'outline'} className="w-fit">
                  {document.watermark ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="space-y-1 pt-4 pb-4 border-b col-span-1">
                <p className="text-sm text-muted-foreground">Client Document</p>
                <Badge 
                  variant="outline"
                  className="w-fit"
                  style={document.isclientdoc ? {
                    borderColor: '#3B82F6',
                    color: '#3B82F6',
                    backgroundColor: '#3B82F610',
                    borderWidth: '1.5px'
                  } : {}}
                >
                  {document.isclientdoc ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="space-y-1 pt-4 col-span-1">
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="font-medium">
                  {document.versionlastupdated 
                    ? format(new Date(document.versionlastupdated), 'dd MMM yyyy')
                    : 'N/A'
                  }
                </p>
              </div>
            </div>

            {document.description && (
              <div className="space-y-2 pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground">Description</p>
                <p className="text-sm leading-relaxed">{document.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uploaded Files Section */}
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Uploaded Files
            </h3>
          </div>
          {document.uploaded_files && document.uploaded_files.length > 0 ? (
            <div className="space-y-3">
              {document.file_names?.map((name, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <p className="text-sm font-medium truncate" title={name}>
                      {name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleViewFile(document.uploaded_files![idx])}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={() => handleDownloadFile(document.uploaded_files![idx], name)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No files uploaded
            </p>
          )}
        </div>
      </div>

      {/* Version History & Stage Usage - Only for Super Admin / Team Leader */}
      {(profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader') && (
        <div className="space-y-6">
          {/* Document Scan Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Scan className="h-4 w-4" />
                Merge Fields & Named Ranges Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentScanStatus
                documentId={document.id}
                scanStatus={(document as any).scan_status}
                scannedAt={(document as any).scanned_at}
                mergeFields={(document as any).merge_fields as string[] || []}
                namedRanges={(document as any).named_ranges as string[] || []}
                documentType={document.format || undefined}
                onScanComplete={fetchDocument}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DocumentVersionHistory 
              documentId={document.id}
              documentTitle={document.title}
              canPublish={true}
            />
            <DocumentStageUsagePanel documentId={document.id} />
          </div>
          
          {/* Merge Fields Editor */}
          <MergeFieldsEditor documentId={document.id} />
          
          {/* Excel Fields - Only show for Excel documents */}
          {(document.format?.toLowerCase().includes('excel') || 
            document.format?.toLowerCase().includes('xls') ||
            document.format?.toLowerCase().includes('spreadsheet')) && (
            <>
              <ExcelFieldsTab documentId={document.id} />
              <ExcelDataSourcesTab documentId={document.id} />
            </>
          )}
        </div>
      )}

      {/* Send Dialog */}
      <Dialog open={isSendDialogOpen} onOpenChange={handleSendDialogClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Send Document</DialogTitle>
          </DialogHeader>
          
          {/* Step 1: Select Send Type */}
          {sendType === null && (
            <div className="space-y-4 py-6">
              <p className="text-sm text-muted-foreground">Choose how you want to send this document:</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSendType('email')}
                  className="p-6 border-2 rounded-lg hover:border-primary hover:bg-accent transition-all flex flex-col items-center gap-3"
                >
                  <Mail className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold">Send to Email</h3>
                    <p className="text-xs text-muted-foreground mt-1">Send to a specific user by email</p>
                  </div>
                </button>
                <button
                  onClick={() => setSendType('tenant')}
                  className="p-6 border-2 rounded-lg hover:border-primary hover:bg-accent transition-all flex flex-col items-center gap-3"
                >
                  <Building2 className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold">Send to Tenant</h3>
                    <p className="text-xs text-muted-foreground mt-1">Send to one or more tenants with filtering</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2a: Send to Email */}
          {sendType === 'email' && (
            <>
              <div className="space-y-4 py-4 flex-1 overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="email">Recipient Email</Label>
                  <Input
                    id="email"
                    placeholder="Search by email or name..."
                    value={emailSearch}
                    onChange={(e) => {
                      setEmailSearch(e.target.value);
                      setSelectedEmail(e.target.value);
                    }}
                  />
                  {filteredUsers.length > 0 && emailSearch && (
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {filteredUsers.map((user) => (
                        <button
                          key={user.user_uuid}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          onClick={() => {
                            setEmailSearch(user.email);
                            setSelectedEmail(user.email);
                            setFilteredUsers([]);
                          }}
                        >
                          <div className="font-medium">{user.email}</div>
                          <div className="text-muted-foreground text-xs">
                            {user.first_name} {user.last_name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendType(null)}>
                  Back
                </Button>
                <Button onClick={handleSendToEmail} disabled={!selectedEmail || sending}>
                  {sending ? 'Sending...' : 'Send'}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 2b: Send to Tenant */}
          {sendType === 'tenant' && (
            <>
              <div className="space-y-4 py-4 flex-1 overflow-y-auto">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Search tenants by name, RTO, or email..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {filteredTenants.length} tenant{filteredTenants.length !== 1 ? 's' : ''} found
                    {selectedTenants.length > 0 && ` (${selectedTenants.length} selected)`}
                    {filteredTenants.length > 0 && ` • Page ${currentPage} of ${totalPages}`}
                  </p>
                  {filteredTenants.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllFilteredTenants}
                    >
                      Select All
                    </Button>
                  )}
                </div>

                <div className="border rounded-md">
                  {filteredTenants.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No tenants found matching your criteria
                    </div>
                  ) : (
                    <>
                      <div className="divide-y max-h-96 overflow-y-auto">
                        {paginatedTenants.map((tenant) => (
                        <div key={tenant.id} className="p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedTenants.includes(tenant.id)}
                              onCheckedChange={() => toggleTenantSelection(tenant.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-medium text-sm truncate">{tenant.companyname}</h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                                >
                                  {expandedTenant === tenant.id ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                              {tenant.rto_name && (
                                <p className="text-xs text-muted-foreground truncate">{tenant.rto_name}</p>
                              )}
                              {expandedTenant === tenant.id && (
                                <div className="mt-2 pt-2 border-t space-y-1 text-xs">
                                  {tenant.state && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">State:</span>
                                      <span className="font-medium">{tenant.state}</span>
                                    </div>
                                  )}
                                  {tenant.cricos_id && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">CRICOS:</span>
                                      <span className="font-medium">{tenant.cricos_id}</span>
                                    </div>
                                  )}
                                  {tenant.framework && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Framework:</span>
                                      <span className="font-medium">{tenant.framework}</span>
                                    </div>
                                  )}
                                  {tenant.email && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Email:</span>
                                      <span className="font-medium">{tenant.email}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        ))}
                      </div>
                      
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="border-t p-4">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious 
                                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                              </PaginationItem>
                              
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                <PaginationItem key={page}>
                                  <PaginationLink
                                    onClick={() => setCurrentPage(page)}
                                    isActive={currentPage === page}
                                    className="cursor-pointer"
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              ))}
                              
                              <PaginationItem>
                                <PaginationNext 
                                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendType(null)}>
                  Back
                </Button>
                <Button onClick={handleSendToTenants} disabled={selectedTenants.length === 0 || sending}>
                  {sending ? 'Sending...' : `Send to ${selectedTenants.length} Tenant${selectedTenants.length !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Name *</Label>
              <Input
                id="edit-title"
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-format">Format</Label>
              <Select
                value={editFormData.format}
                onValueChange={(value) => setEditFormData({ ...editFormData, format: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
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
                id="edit-watermark"
                checked={editFormData.watermark}
                onCheckedChange={(checked) => setEditFormData({ ...editFormData, watermark: checked })}
              />
              <Label htmlFor="edit-watermark">Watermark</Label>
            </div>
            
            <div className="grid gap-2">
              <Label>Version Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !editFormData.versiondate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editFormData.versiondate ? format(editFormData.versiondate, "dd/MM/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editFormData.versiondate}
                    onSelect={(date) => setEditFormData({ ...editFormData, versiondate: date })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-versionnumber">Version Number</Label>
              <Input
                id="edit-versionnumber"
                type="number"
                value={editFormData.versionnumber}
                onChange={(e) => setEditFormData({ ...editFormData, versionnumber: e.target.value })}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="edit-isclientdoc"
                checked={editFormData.isclientdoc}
                onCheckedChange={(checked) => setEditFormData({ ...editFormData, isclientdoc: checked })}
              />
              <Label htmlFor="edit-isclientdoc">Is Client Document</Label>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-stage">Phase</Label>
              <Combobox
                options={stages.map(stage => ({ value: stage.id.toString(), label: stage.title }))}
                value={editFormData.stage}
                onValueChange={(value) => setEditFormData({ ...editFormData, stage: value })}
                placeholder="Select phase..."
                searchPlaceholder="Search phases..."
                emptyText="No phases found."
                className="w-full"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-category">Category</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start min-h-[40px] h-auto"
                    role="combobox"
                  >
                    {editFormData.categories.length === 0 ? (
                      <span className="text-muted-foreground">Select categories...</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {editFormData.categories.map((catId) => {
                          const category = categories.find((c) => c.id.toString() === catId);
                          return category ? (
                            <Badge
                              key={catId}
                              variant="secondary"
                              className="text-xs px-2 py-0.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditFormData({
                                  ...editFormData,
                                  categories: editFormData.categories.filter((id) => id !== catId),
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
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-2 bg-background z-50" align="start">
                  <div className="space-y-1">
                    {categories.map((cat) => {
                      const isSelected = editFormData.categories.includes(cat.id.toString());
                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent",
                            isSelected && "bg-accent"
                          )}
                          onClick={() => {
                            if (isSelected) {
                              setEditFormData({
                                ...editFormData,
                                categories: editFormData.categories.filter((id) => id !== cat.id.toString()),
                              });
                            } else {
                              setEditFormData({
                                ...editFormData,
                                categories: [...editFormData.categories, cat.id.toString()],
                              });
                            }
                          }}
                        >
                          <Checkbox checked={isSelected} />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-files">Add More Files</Label>
              <Input
                id="edit-files"
                type="file"
                multiple
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {uploadedFiles.map((file, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 pr-1">
                      {file.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline"
                  style={{
                    boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
                    border: '1px solid #00000052'
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Insert Field
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 bg-background z-50" align="end">
                <div className="p-3 space-y-2">
                  <h4 className="font-medium text-sm">Select Field to Insert</h4>
                  <Select>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Choose a field..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="text">Text Field</SelectItem>
                      <SelectItem value="number">Number Field</SelectItem>
                      <SelectItem value="email">Email Field</SelectItem>
                      <SelectItem value="date">Date Field</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      <SelectItem value="select">Dropdown</SelectItem>
                      <SelectItem value="textarea">Text Area</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            <Button onClick={handleUpdateDocument} disabled={!editFormData.title}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
