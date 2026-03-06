import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, ChevronDown, User, Phone, Mail, MapPin, Calendar, Users, FileText, TrendingUp, LogIn, Package as PackageIcon, CheckCircle2, Clock, AlertCircle, Globe, ExternalLink, Facebook, Instagram, Linkedin, ArrowLeft, Timer, Building2, XCircle, Eye, EyeOff, MessageSquare } from "lucide-react";
import { ReviewModePanel } from "@/components/tenant/ReviewModePanel";
import { OrgTypeBadge } from "@/components/tenant/OrgTypeBadge";
import { useReviewMode } from "@/hooks/useReviewMode";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TenantProgressTable from "@/components/tenant/TenantProgressTable";
import { TenantClickUpActivity } from "@/components/tenant/TenantClickUpActivity";
import { CSCProfileCard } from "@/components/csc/CSCProfileCard";
import { ViewAsClientButton } from "@/components/client/ViewAsClientButton";
import { ClientQuickNav } from "@/components/client/ClientQuickNav";
import { EnrichTenantButton } from "@/components/tenant/EnrichTenantButton";
import { TenantStatusDropdown } from '@/components/tenant/TenantStatusDropdown';
import { TenantLogoUpload } from '@/components/tenant/TenantLogoUpload';
import type { TenantType } from "@/contexts/TenantTypeContext";
interface ClientData {
  id: string;
  companyname: string;
  email: string;
  phone: string;
  head_office_address: string;
  state: string;
  rto_name: string;
  rtoid: string;
  abn: string;
  acn: string;
  street_number_name: string;
  suburb: string;
  postcode: string;
  country: string;
  document_contact_email: string;
  student_management_system: string;
  contactname: string;
  website: string;
  accounting_system: string;
  training_facility_address: string;
  po_box_address: string;
  cricos_id: string;
  registration_end_date: string;
  keap_url: string;
  clickup_url: string;
  accountable_person: string;
  qto_name: string;
  profilephoto: string | null;
  logo_url: string | null;
}
interface Package {
  id: number;
  name: string;
  date: string;
}
interface LoginHistory {
  last_login: string;
  login_count: number;
}
interface Note {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
}
interface TenantPackage {
  id: number;
  name: string;
  slug: string | null;
  full_text: string | null;
  duration_months: number | null;
  total_hours: number | null;
  stage_count?: number;
}
export default function TenantDetail() {
  const {
    tenantId
  } = useParams();
  const navigate = useNavigate();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [tenantPackages, setTenantPackages] = useState<TenantPackage[]>([]);
  const [activePackageId, setActivePackageId] = useState<number | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistory | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [cloName, setCloName] = useState<string>("");
  const [cloAvatar, setCloAvatar] = useState<string>("");
  const [cloEmail, setCloEmail] = useState<string>("");
  const [liaisonName, setLiaisonName] = useState<string>("");
  const [liaisonAvatar, setLiaisonAvatar] = useState<string>("");
  const [liaisonEmail, setLiaisonEmail] = useState<string>("");
  const [primaryContactName, setPrimaryContactName] = useState<string>("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState<string>("");
  const [primaryContactAvatar, setPrimaryContactAvatar] = useState<string>("");
  const [tenantStatus, setTenantStatus] = useState<string>("active");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [tenantTypeValue, setTenantTypeValue] = useState<TenantType>("compliance_system");
  const [orgType, setOrgType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parsedTenantIdForReview = tenantId ? parseInt(tenantId) : null;
  const { reviewMode, toggleReviewMode, reviewSummary, summaryLoading } = useReviewMode(parsedTenantIdForReview);
  const [memberCount, setMemberCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [recentDocuments, setRecentDocuments] = useState<any[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [totalLogins, setTotalLogins] = useState(0);
  const [hoursUsed, setHoursUsed] = useState(0);
  const {
    toast
  } = useToast();
  const {
    profile
  } = useAuth();
  const {
    isViewingAsClient,
    toggleViewAsClient
  } = useViewMode();
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  // Fetch tenant packages on mount
  useEffect(() => {
    if (tenantId) {
      fetchTenantPackages();
    }
  }, [tenantId]);

  // Fetch data when active package changes
  useEffect(() => {
    if (tenantId && activePackageId !== null) {
      fetchTenantData(activePackageId);
    }
  }, [tenantId, activePackageId]);
  const fetchTenantPackages = async () => {
    if (!tenantId) return;
    try {
      // Fetch active package instances for this tenant (source of truth)
      const { data: instancesData, error: instancesError } = await supabase
        .from("package_instances")
        .select("package_id")
        .eq("tenant_id", parseInt(tenantId))
        .eq("is_complete", false);
      
      if (instancesError) throw instancesError;
      
      const packageIds = (instancesData || []).map((i: any) => i.package_id);
      
      if (packageIds.length > 0) {
        // Fetch package details and stage counts from documents
        const [packagesResult, stageCountsResult] = await Promise.all([
          supabase.from("packages").select("id, name, slug, full_text, duration_months, total_hours").in("id", packageIds).order("name"),
          supabase.from('documents').select('package_id, stage').in('package_id', packageIds).not('stage', 'is', null)
        ]);
        
        if (packagesResult.error) throw packagesResult.error;
        
        // Count distinct stages per package
        const stageCounts: Record<number, Set<number>> = {};
        if (stageCountsResult.data) {
          stageCountsResult.data.forEach((row: { package_id: number; stage: number }) => {
            if (!stageCounts[row.package_id]) {
              stageCounts[row.package_id] = new Set();
            }
            stageCounts[row.package_id].add(row.stage);
          });
        }
        
        // Add stage counts to packages
        const packagesWithCounts = (packagesResult.data || []).map(pkg => ({
          ...pkg,
          stage_count: stageCounts[pkg.id]?.size || 0
        }));
        
        setTenantPackages(packagesWithCounts);

        // Set the first package as active if not already set
        if (packagesWithCounts.length > 0 && activePackageId === null) {
          setActivePackageId(packagesWithCounts[0].id);
        }
      } else {
        // No packages, still fetch data
        fetchTenantData();
      }
    } catch (error: any) {
      console.error("Error fetching tenant packages:", error);
      fetchTenantData();
    }
  };

  // Real-time subscription for documents
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel('documents-realtime').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'documents_tenants',
      filter: `tenant_id=eq.${tenantId}`
    }, () => {
      fetchTenantData();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'package_documents'
    }, () => {
      fetchTenantData();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);
  const fetchTenantData = async (packageIdOverride?: number | null) => {
    if (!tenantId) return;
    // Use override if provided, otherwise use activePackageId state
    const currentPackageId = packageIdOverride !== undefined ? packageIdOverride : activePackageId;
    setLoading(true);
    try {
      const {
        data: tenantData,
        error: tenantError
      } = await supabase.from("tenants").select(`
          id,
          name,
          status,
          package_id,
          package_ids,
          package_added_at,
          tenant_type,
          logo_path
        `).eq("id", parseInt(tenantId)).single();
      if (tenantError) throw tenantError;
      if (!tenantData) {
        toast({
          title: "Not Found",
          description: "Tenant not found",
          variant: "destructive"
        });
        navigate('/manage-tenants');
        return;
      }
      
      // Fetch package details via package_instances (source of truth)
      let activePackage: { id: number; name: string } | null = null;
      const { data: instanceData } = await supabase
        .from('package_instances')
        .select('package_id')
        .eq('tenant_id', parseInt(tenantId))
        .eq('is_complete', false)
        .limit(1)
        .maybeSingle();
      
      if (instanceData?.package_id) {
        const { data: pkgData } = await supabase
          .from('packages')
          .select('id, name')
          .eq('id', instanceData.package_id)
          .single();
        activePackage = pkgData;
      }
      setTenantStatus(tenantData.status || "active");
      setTenantTypeValue((tenantData.tenant_type as TenantType) || "compliance_system");

      // Fetch org_type from tenant_profile
      const { data: tpData } = await supabase
        .from('tenant_profile')
        .select('org_type')
        .eq('tenant_id', parseInt(tenantId))
        .maybeSingle();
      setOrgType(tpData?.org_type || null);

      setLogoPath((tenantData as any).logo_path || null);
      setLogoPath((tenantData as any).logo_path || null);
      const {
        count: memberCountData
      } = await supabase.from("users").select("*", {
        count: 'exact',
        head: true
      }).eq("tenant_id", parseInt(tenantId));
      setMemberCount(memberCountData || 0);

      // Fetch released package documents only
      const tenantPackageIds = tenantData.package_ids || (tenantData.package_id ? [tenantData.package_id] : []);
      let packageDocs: any[] = [];
      let packageDocCount = 0;
      
      if (tenantPackageIds.length > 0) {
        const {
          data: docsData,
          count: docCountData
        } = await (supabase as any).from("documents").select("*, packages:package_id(name)", {
          count: 'exact'
        }).in("package_id", tenantPackageIds).eq("is_released", true).order("createdat", {
          ascending: false
        }).limit(5);
        packageDocs = docsData || [];
        packageDocCount = docCountData || 0;
      }

      setDocumentCount(packageDocCount);
      setRecentDocuments(packageDocs);

      // Fetch total logins from user_activity for users in this tenant
      const {
        data: userIds
      } = await supabase.from("users").select("user_uuid").eq("tenant_id", parseInt(tenantId));
      if (userIds && userIds.length > 0) {
        const uuids = userIds.map(u => u.user_uuid);
        const {
          count: loginCount
        } = await supabase.from("user_activity").select("*", {
          count: 'exact',
          head: true
        }).in("user_id", uuids);
        setTotalLogins(loginCount || 0);
      }
      if (currentPackageId) {
        // Fetch tasks count using currentPackageId
        const {
          count: tasksCountData
        } = await supabase.from("package_client_tasks").select("*", {
          count: 'exact',
          head: true
        }).eq("package_id", currentPackageId);
        setTaskCount(tasksCountData || 0);
      }
      const {
        data: userData,
        error: userError
      } = await supabase.from("users").select("*").eq("tenant_id", parseInt(tenantId)).eq("unicorn_role", "Admin").order("created_at", {
        ascending: true
      }).limit(1).maybeSingle();
      if (userError) throw userError;
      if (userData) {
        setClientData({
          id: userData.user_uuid,
          companyname: tenantData.name,
          contactname: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          email: userData.email,
          phone: userData.phone || userData.mobile_phone || "",
          head_office_address: userData.head_office_address || "",
          state: userData.state?.toString() || "",
          rto_name: userData.rto_name || "",
          rtoid: userData.rto_id?.toString() || "",
          abn: userData.abn || "",
          acn: userData.acn || "",
          street_number_name: userData.street_number_and_name || "",
          suburb: userData.suburb || "",
          postcode: userData.postcode || "",
          country: userData.country || "Australia",
          document_contact_email: userData.email_address || userData.email,
          student_management_system: userData.lms || "",
          website: userData.website || "",
          accounting_system: userData.accounting_system || "",
          training_facility_address: userData.training_facility_address || "",
          po_box_address: userData.po_box_address || "",
          cricos_id: userData.cricos_id || "",
          registration_end_date: userData.registration_end_date || "",
          keap_url: userData.keap_url || "",
          clickup_url: userData.clickup_url || "",
          accountable_person: userData.accountable_person || "",
          qto_name: "",
          profilephoto: userData.avatar_url || null,
          logo_url: null
        });
        if (userData.last_sign_in_at) {
          const loginDate = new Date(userData.last_sign_in_at);
          setLoginHistory({
            last_login: loginDate.toLocaleString('en-AU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            login_count: 0
          });
        }
        const {
          data: cloData
        } = await supabase.from("client_liaisons").select("vivacity_user_id").eq("client_id", userData.user_uuid).maybeSingle();
        if (cloData?.vivacity_user_id) {
          const {
            data: cloUserData
          } = await supabase.from("users").select("first_name, last_name, avatar_url, email").eq("user_uuid", cloData.vivacity_user_id).maybeSingle();
          if (cloUserData) {
            setCloName(`${cloUserData.first_name} ${cloUserData.last_name}`);
            setCloAvatar(cloUserData.avatar_url || "");
            setCloEmail(cloUserData.email || "");
          }
        }

        // Fetch Liaison Officer from connected_tenants table
        const {
          data: connectedUser
        } = await supabase.from("connected_tenants").select("user_uuid").eq("tenant_id", parseInt(tenantId)).maybeSingle();
        if (connectedUser?.user_uuid) {
          // Get the assigned user's details
          const {
            data: liaisonUserData
          } = await supabase.from("users").select("first_name, last_name, avatar_url, email").eq("user_uuid", connectedUser.user_uuid).maybeSingle();
          if (liaisonUserData) {
            setLiaisonName(`${liaisonUserData.first_name || ''} ${liaisonUserData.last_name || ''}`.trim());
            setLiaisonAvatar(liaisonUserData.avatar_url || "");
            setLiaisonEmail(liaisonUserData.email || "");
         }
        }

        // Fetch primary contact from tenant_users
        const { data: primaryContactData } = await supabase
          .from("tenant_users")
          .select("user_id")
          .eq("tenant_id", parseInt(tenantId))
          .eq("primary_contact", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (primaryContactData?.user_id) {
          const { data: pcUser } = await supabase
            .from("users")
            .select("first_name, last_name, avatar_url, email")
            .eq("user_uuid", primaryContactData.user_id)
            .maybeSingle();
          if (pcUser) {
            setPrimaryContactName(`${pcUser.first_name || ''} ${pcUser.last_name || ''}`.trim());
            setPrimaryContactAvatar(pcUser.avatar_url || "");
            setPrimaryContactEmail(pcUser.email || "");
          } else {
            setPrimaryContactName("");
            setPrimaryContactAvatar("");
            setPrimaryContactEmail("");
          }
        } else {
          setPrimaryContactName("");
          setPrimaryContactAvatar("");
          setPrimaryContactEmail("");
        }
      }
      if (activePackage) {
        const packageDate = new Date(tenantData.package_added_at || new Date());
        setPackages([{
          id: activePackage.id,
          name: activePackage.name,
          date: packageDate.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        }]);
      }

      // Fetch notes from unified notes table - filter by package if selected
      let notesQuery = supabase.from("notes").select("id, note_details, created_at, created_by, duration, started_date, completed_date")
        .eq("tenant_id", parseInt(tenantId))
        .eq("parent_type", "tenant")
        .eq("parent_id", parseInt(tenantId));
      if (currentPackageId) {
        notesQuery = notesQuery.eq("package_id", currentPackageId);
      }
      const {
        data: notesData
      } = await notesQuery.order("created_at", {
        ascending: false
      });
      setNotes(notesData?.map(n => ({
        id: n.id,
        note: n.note_details,
        created_at: n.created_at,
        created_by: n.created_by
      })) || []);

      // Calculate total minutes used from notes started_date to completed_date
      const totalMinutesUsed = notesData?.reduce((sum, n) => {
        if (n.started_date && n.completed_date) {
          const start = new Date(n.started_date);
          const end = new Date(n.completed_date);
          const diffMs = end.getTime() - start.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          return sum + (diffMins > 0 ? diffMins : 0);
        }
        return sum;
      }, 0) || 0;
      setHoursUsed(totalMinutesUsed);
    } catch (error: any) {
      console.error("Error fetching tenant data:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load tenant details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleAddNote = async () => {
    if (!newNote.trim() || !tenantId) return;
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to add notes",
          variant: "destructive"
        });
        return;
      }
      const {
        error
      } = await supabase.from("notes").insert({
        tenant_id: parseInt(tenantId),
        parent_type: "tenant",
        parent_id: parseInt(tenantId),
        note_details: newNote.trim(),
        created_by: user.id
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Note added successfully"
      });
      setNewNote("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  if (loading || !clientData) {
    return <div className="p-6 max-w-7xl mx-auto">
        
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Back Button, Package Tabs and Status Header */}
      

      {/* Header Card */}
      <div className="px-6">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/20" style={{
          backgroundImage: 'linear-gradient(135deg, rgb(98 33 145) 0%, rgb(213 28 73 / 72%) 100%)'
        }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border-2 border-white/30">
                  <AvatarImage src={clientData.profilephoto || clientData.logo_url || ''} alt={clientData.companyname} />
                  <AvatarFallback className="bg-white/20 text-white text-lg font-semibold">
                    {clientData.contactname ? clientData.contactname.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : clientData.companyname?.substring(0, 2).toUpperCase() || 'TN'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">
                    Hello, {clientData.contactname || clientData.companyname}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Building2 className="h-4 w-4" />
                    {clientData.companyname}
                    <OrgTypeBadge orgType={orgType} />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <User className="h-4 w-4" />
                    {primaryContactName
                      ? <>Primary Contact: {primaryContactName}</>
                      : <span className="text-white/40">No primary contact</span>
                    }
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-2.5">
                  {/* Status Dropdown */}
                  <TenantStatusDropdown
                    tenantId={parseInt(tenantId!)}
                    currentStatus={tenantStatus}
                    onStatusChange={setTenantStatus}
                    onNonActiveChange={(statusDescription) => {
                      const title = `** CLIENT ${statusDescription.toUpperCase()} **`;
                      navigate(`/tenant/${tenantId}/notes?initNote=true&noteTitle=${encodeURIComponent(title)}`);
                    }}
                  />
                  {/* Enrich Tenant — SuperAdmin only */}
                  {tenantId && (
                    <EnrichTenantButton
                      tenantId={parseInt(tenantId)}
                      website={clientData.website}
                      abn={clientData.abn}
                      rtoCode={clientData.rtoid}
                    />
                  )}
                  {/* View as Client Button - Only for Super Admin and Team Leader */}
                  {tenantId && (
                    <ViewAsClientButton
                      tenantId={parseInt(tenantId)}
                      tenantName={clientData.companyname}
                      tenantType={tenantTypeValue}
                      compact
                    />
                  )}
                  {tenantId && <ClientQuickNav currentTenantId={parseInt(tenantId)} />}
                  {/* Message Client */}
                  {tenantId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20"
                      onClick={() => navigate(`/communications?tenant=${tenantId}`)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Message
                    </Button>
                  )}
                  <a href="#" className="group relative p-2.5 rounded-full bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#1877F2]/30 cursor-not-allowed" title="Facebook" onClick={e => e.preventDefault()}>
                    <Facebook className="h-4 w-4 text-[#1877F2] group-hover:scale-110 transition-transform" />
                  </a>
                  <a href="#" className="group relative p-2.5 rounded-full bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#E4405F]/30 cursor-not-allowed" title="Instagram" onClick={e => e.preventDefault()}>
                    <Instagram className="h-4 w-4 text-[#E4405F] group-hover:scale-110 transition-transform" />
                  </a>
                  <a href="#" className="group relative p-2.5 rounded-full bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#0A66C2]/30 cursor-not-allowed" title="LinkedIn" onClick={e => e.preventDefault()}>
                    <Linkedin className="h-4 w-4 text-[#0A66C2] group-hover:scale-110 transition-transform" />
                  </a>
                </div>
                {/* Tenant Logo Upload */}
                {tenantId && (
                  <TenantLogoUpload
                    tenantId={parseInt(tenantId)}
                    currentLogoPath={logoPath}
                    onLogoChange={setLogoPath}
                  />
                )}
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div onClick={() => navigate(`/tenant/${tenantId}/logins`)} className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Total Logins</span>
                  <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                    <LogIn className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{totalLogins}</p>
                <p className="text-xs text-muted-foreground">↑ {totalLogins > 0 ? 'Active' : 'No activity'}</p>
              </div>

              <div onClick={() => navigate(`/tenant/${tenantId}/members`)} className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Members</span>
                  <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                    <Users className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{memberCount}</p>
                <p className="text-xs text-muted-foreground">{memberCount} Active user{memberCount !== 1 ? 's' : ''}</p>
              </div>

              <div onClick={() => navigate(`/tenant/${tenantId}/documents${activePackageId ? `?packageId=${activePackageId}` : ''}`)} className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Documents</span>
                  <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                    <FileText className="h-5 w-5 text-green-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{documentCount}</p>
                <p className="text-xs text-muted-foreground">{documentCount} Document{documentCount !== 1 ? 's' : ''} available</p>
              </div>

              <div onClick={() => navigate(`/tenant/${tenantId}/notes${activePackageId ? `?packageId=${activePackageId}` : ''}`)} className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Notes</span>
                  <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
                    <FileText className="h-5 w-5 text-amber-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{notes.length}</p>
                <p className="text-xs text-muted-foreground">{notes.length} Note{notes.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-6 py-8">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Performance/Current Tasks */}
          <div className="lg:col-span-3 space-y-6">
            {/* Recent Documents */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center justify-between">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-foreground">Recent Documents</h2>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Added in 7 days
                  </span>
                </div>
                <span className="text-xs font-medium text-primary cursor-pointer hover:underline" onClick={() => navigate(`/tenant/${tenantId}/documents${activePackageId ? `?packageId=${activePackageId}` : ''}`)}>
                  View all
                </span>
              </div>

              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r min-w-[200px]">Document Name</TableHead>
                      <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r w-24">Files</TableHead>
                      <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap border-r w-28">Status</TableHead>
                      <TableHead className="bg-muted/20 h-12 font-semibold text-foreground whitespace-nowrap w-32">Package</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                    {recentDocuments && recentDocuments.length > 0 ? recentDocuments.map((doc: any) => {
                    const docTitle = doc.title || doc.document_name || 'Untitled Document';
                    const categoryName = doc.documents_categories?.name || doc.category || 'Document';
                    const fileCount = doc.file_names?.length || doc.uploaded_files?.length || doc.file_paths?.length || 0;
                    const isReleased = doc.source === 'tenant' ? true : (doc.is_released ?? false);
                    const packageName = doc.packages?.name || null;
                    
                    return <TableRow key={`${doc.source}-${doc.id}`}>
                          <TableCell className="border-r">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-semibold text-primary">
                                  {categoryName.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm font-medium">{docTitle}</span>
                            </div>
                          </TableCell>
                          <TableCell className="border-r">
                            <span className="text-sm font-medium text-muted-foreground">
                              {fileCount} file{fileCount !== 1 ? 's' : ''}
                            </span>
                          </TableCell>
                          <TableCell className="border-r">
                            {isReleased ? <Badge variant="default" className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
                                <CheckCircle2 className="h-3 w-3" />
                                Released
                              </Badge> : <Badge variant="default" className="gap-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>}
                          </TableCell>
                          <TableCell>
                            {doc.source === 'tenant' ? (
                              <Badge variant="outline" className="text-xs font-medium py-[3px] rounded-[9px] whitespace-nowrap bg-amber-500/10 text-amber-600 border-amber-600">
                                Sent to Tenant
                              </Badge>
                            ) : packageName ? (
                              <Badge variant="outline" className="text-xs font-medium py-[3px] rounded-[9px] whitespace-nowrap">
                                {packageName}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>;
                  }) : <TableRow>
                        <TableCell colSpan={4} className="text-center py-12">
                          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                          <p className="text-sm text-muted-foreground">No documents yet</p>
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Package & Progress Combined - Use activePackageId */}
            <TenantProgressTable key={`progress-${activePackageId}-${tenantId}`} packageId={activePackageId || undefined} tenantId={tenantId ? parseInt(tenantId) : undefined} packageName={tenantPackages.find(p => p.id === activePackageId)?.name || packages[0]?.name} packageDate={packages[0]?.date} documentCount={documentCount} memberCount={memberCount} />

            {/* ClickUp Activity - SuperAdmin only */}
            {(profile?.global_role === 'SuperAdmin' || profile?.unicorn_role === 'Super Admin') && tenantId && (
              <TenantClickUpActivity tenantId={parseInt(tenantId)} />
            )}
          </div>

          {/* Right: Package Details */}
          <div className="space-y-6">
            {/* CSC Review Mode Panel */}
            <ReviewModePanel
              reviewMode={reviewMode}
              onToggle={toggleReviewMode}
              summary={reviewSummary}
              loading={summaryLoading}
            />
            {/* Package Time Remaining */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <div className="bg-muted/30 px-6 py-4 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    
                    <span className="text-sm font-semibold text-foreground">Active Package ({tenantPackages.length})</span>
                  </div>
                  {activePackageId && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-foreground hover:bg-primary hover:text-primary-foreground" onClick={() => navigate(`/admin/package/${activePackageId}/tenant/${tenantId}`)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>}
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-3">
                  {(() => {
                  // Get active package details
                  const activePackage = tenantPackages.find(p => p.id === activePackageId);
                  const durationMonths = activePackage?.duration_months || 12;

                  // Calculate days remaining based on package_added_at + duration_months
                  const packageAddedAt = packages[0]?.date ? new Date(packages[0].date.split('/').reverse().join('-')) : new Date();
                  const expiryDate = new Date(packageAddedAt);
                  expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
                  const today = new Date();
                  const diffMs = expiryDate.getTime() - today.getTime();
                  const daysRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                  const isExpired = diffMs <= 0;

                  // hoursUsed now stores total minutes directly
                  const minutesUsed = hoursUsed;

                  // Calculate used time for display (same calculation as TenantNotes)
                  const daysUsed = Math.floor(minutesUsed / 1440);
                  const hoursUsedDisplay = Math.floor(minutesUsed % 1440 / 60);
                  const minsUsed = minutesUsed % 60;

                  // Deduct full days of usage from days remaining
                  const adjustedDaysRemaining = Math.max(0, daysRemaining - daysUsed);
                  const isAdjustedExpired = adjustedDaysRemaining <= 0;
                  return <>
                        {/* Current Package - Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-primary/5 to-transparent hover:shadow-md transition-all duration-200 cursor-pointer group">
                              <div className="flex-shrink-0">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <FileText className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">Package</p>
                                <p className="text-xs mt-0.5 text-muted-foreground truncate">
                                  {activePackage?.name || 'No package selected'}
                                </p>
                              </div>
                              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] bg-background border border-border/50 shadow-xl z-50 p-1">
                            {tenantPackages.map((pkg, index) => <React.Fragment key={pkg.id}>
                                <DropdownMenuItem onClick={() => setActivePackageId(pkg.id)} className={`flex items-center gap-3 cursor-pointer rounded-md px-3 py-2.5 ${pkg.id === activePackageId ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}>
                                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${pkg.id === activePackageId ? 'bg-primary/20' : 'bg-muted'}`}>
                                    <FileText className="h-3.5 w-3.5" />
                                  </div>
                                  <span className="flex-1 font-medium text-sm">{pkg.name} ({pkg.stage_count || 0})</span>
                                  {pkg.id === activePackageId && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>
                                {index < tenantPackages.length - 1 && <div className="mx-2 my-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />}
                              </React.Fragment>)}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Days Remaining */}
                        <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-blue-500/5 to-transparent hover:shadow-md transition-all duration-200">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                              <Calendar className="h-5 w-5 text-blue-500" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Days Remaining</p>
                            <p className={`text-xs mt-0.5 ${isAdjustedExpired ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                              {adjustedDaysRemaining} days
                            </p>
                          </div>
                        </div>
                        
                        {/* Time Used Summary - from Notes Duration */}
                        <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-orange-500/5 to-transparent hover:shadow-md transition-all duration-200">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                              <Timer className="h-5 w-5 text-orange-500" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Package Used</p>
                            <p className="text-xs mt-0.5 text-muted-foreground">
                              {daysUsed}d {hoursUsedDisplay}h {minsUsed}m
                            </p>
                          </div>
                        </div>
                      </>;
                })()}
                  
                  {tenantPackages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No package assigned</p>}
                </div>
              </div>
            </Card>

            {/* Liaison Officer */}
            {cloName && <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
                  <h2 className="font-semibold text-foreground">Liaison Officer</h2>
                </div>
                
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    {cloAvatar ? <img src={cloAvatar} alt={cloName} className="h-12 w-12 rounded-full object-cover border-2 border-primary/20" /> : <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                        <User className="h-6 w-6 text-primary" />
                      </div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{cloName}</p>
                      {cloEmail && <a href={`mailto:${cloEmail}`} className="text-xs text-primary hover:underline">
                          {cloEmail}
                        </a>}
                    </div>
                  </div>
                </div>
              </Card>}

            {/* CSC Profile Card - uses new CSC assignment system */}
            <CSCProfileCard tenantId={parseInt(tenantId || '0')} compact={true} />

            {/* Contact Info */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
                <h2 className="font-semibold text-foreground">Contact</h2>
              </div>
              
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-blue-500/5 to-transparent hover:shadow-md transition-all duration-200">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-blue-500" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Email</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{clientData.email}</p>
                    </div>
                  </div>

                  {clientData.phone && <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-green-500/5 to-transparent hover:shadow-md transition-all duration-200">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Phone className="h-5 w-5 text-green-500" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Phone</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{clientData.phone}</p>
                      </div>
                    </div>}

                  {clientData.state && <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-purple-500/5 to-transparent hover:shadow-md transition-all duration-200">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                          <MapPin className="h-5 w-5 text-purple-500" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Location</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{clientData.state}</p>
                      </div>
                    </div>}

                  {cloName && <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-orange-500/5 to-transparent hover:shadow-md transition-all duration-200">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-orange-500" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Liaison Officer</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{cloName}</p>
                      </div>
                    </div>}
                </div>
              </div>
            </Card>

            {/* Quick Note - Hidden for Admin/User roles */}
            {!isAdminOrUser && <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">Quick Note</h2>
                  <Button variant="link" className="text-primary text-sm p-0 h-auto" onClick={() => navigate(`/tenant/${tenantId}/notes`)}>
                    View All
                  </Button>
                </div>
                
                <div className="p-6">
                  <Textarea placeholder="Write a message..." value={newNote} onChange={e => setNewNote(e.target.value)} className="min-h-[100px] mb-4 text-sm border-border/40 focus:border-primary/50 transition-colors" />
                  <Button onClick={handleAddNote} disabled={!newNote.trim() || loading} className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Add Note
                  </Button>
                </div>
              </Card>}
          </div>
        </div>
      </div>
    </div>;
}