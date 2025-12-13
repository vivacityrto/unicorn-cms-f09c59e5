import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, ChevronDown, User, Phone, Mail, MapPin, Calendar, Users, FileText, TrendingUp, LogIn, Package as PackageIcon, CheckCircle2, Clock, AlertCircle, Globe, ExternalLink, Facebook, Instagram, Linkedin, ArrowLeft, Timer, Building2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import TenantProgressTable from "@/components/tenant/TenantProgressTable";
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
  const [tenantStatus, setTenantStatus] = useState<string>("active");
  const [loading, setLoading] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [recentDocuments, setRecentDocuments] = useState<any[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [totalLogins, setTotalLogins] = useState(0);
  const [hoursUsed, setHoursUsed] = useState(0);
  const {
    toast
  } = useToast();

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
      // First get the tenant's package_ids
      const {
        data: tenantData,
        error: tenantError
      } = await supabase.from("tenants").select("package_ids, package_id").eq("id", parseInt(tenantId)).single();
      if (tenantError) throw tenantError;
      const packageIds = tenantData?.package_ids || (tenantData?.package_id ? [tenantData.package_id] : []);
      if (packageIds.length > 0) {
        // Fetch package details
        const {
          data: packagesData,
          error: packagesError
        } = await supabase.from("packages").select("id, name, slug, full_text, duration_months, total_hours").in("id", packageIds).order("name");
        if (packagesError) throw packagesError;
        setTenantPackages(packagesData || []);

        // Set the first package as active if not already set
        if (packagesData && packagesData.length > 0 && activePackageId === null) {
          setActivePackageId(packagesData[0].id);
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
          package_added_at,
          packages (
            id,
            name
          )
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
      setTenantStatus(tenantData.status || "active");
      const {
        count: memberCountData
      } = await supabase.from("users").select("*", {
        count: 'exact',
        head: true
      }).eq("tenant_id", parseInt(tenantId));
      setMemberCount(memberCountData || 0);

      // Always fetch package-specific documents when a package is selected
      if (currentPackageId) {
        const {
          data: docsData,
          count: docCountData
        } = await supabase.from("documents").select("*", {
          count: 'exact'
        }).eq("package_id", currentPackageId).eq("is_released", true).order("createdat", {
          ascending: false
        }).limit(3);
        setDocumentCount(docCountData || 0);
        setRecentDocuments(docsData || []);
      } else {
        // Fallback to tenant-specific documents if no package selected
        const {
          data: tenantDocsData,
          count: tenantDocCountData
        } = await supabase.from("documents_tenants").select("*", {
          count: 'exact'
        }).eq("tenant_id", parseInt(tenantId)).order("created_at", {
          ascending: false
        }).limit(3);
        setDocumentCount(tenantDocCountData || 0);
        setRecentDocuments(tenantDocsData || []);
      }

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
          qto_name: ""
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
      }
      if (tenantData.packages) {
        const packageDate = new Date(tenantData.package_added_at);
        setPackages([{
          id: tenantData.package_id,
          name: tenantData.packages.name,
          date: packageDate.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        }]);
      }

      // Fetch notes from tenant_notes table - filter by package if selected
      let notesQuery = supabase.from("tenant_notes").select("id, note_details, created_at, created_by, duration, started_date, completed_date").eq("tenant_id", parseInt(tenantId));
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

      // Calculate total minutes used from notes started_date to completed_date (same as TenantNotes)
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
      setHoursUsed(totalMinutesUsed); // Store total minutes (rename misleading but keep for now)
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
      } = await supabase.from("tenant_notes").insert({
        tenant_id: parseInt(tenantId),
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
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
            <p className="text-muted-foreground">Loading tenant details...</p>
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Back Button, Package Tabs and Status Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            
            
            {/* Packages Card - matching Package Details header style */}
            {tenantPackages.length > 0 && <Card className="border-0 shadow-lg overflow-hidden">
                
                
              </Card>}
          </div>
          <Badge variant={tenantStatus === "active" ? "default" : "secondary"} className={`px-4 py-1.5 text-sm font-semibold ${tenantStatus === "active" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`} style={{
          border: tenantStatus === "active" ? "0.7px solid rgb(22, 101, 52)" : "0.7px solid rgb(153, 27, 27)"
        }}>
            {tenantStatus === "active" ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Header Card */}
      <div className="px-6">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {clientData.companyname?.substring(0, 2).toUpperCase() || 'TN'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">
                    Hello, {clientData.contactname || clientData.companyname}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    {clientData.companyname}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <a href="#" className="group relative p-2.5 rounded-xl bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#1877F2]/30 cursor-not-allowed" title="Facebook" onClick={e => e.preventDefault()}>
                  <Facebook className="h-4 w-4 text-[#1877F2] group-hover:scale-110 transition-transform" />
                </a>
                <a href="#" className="group relative p-2.5 rounded-xl bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#E4405F]/30 cursor-not-allowed" title="Instagram" onClick={e => e.preventDefault()}>
                  <Instagram className="h-4 w-4 text-[#E4405F] group-hover:scale-110 transition-transform" />
                </a>
                <a href="#" className="group relative p-2.5 rounded-xl bg-gradient-to-br from-background to-muted border border-border/40 transition-all duration-300 hover:shadow-lg hover:scale-110 hover:border-[#0A66C2]/30 cursor-not-allowed" title="LinkedIn" onClick={e => e.preventDefault()}>
                  <Linkedin className="h-4 w-4 text-[#0A66C2] group-hover:scale-110 transition-transform" />
                </a>
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
                <h2 className="font-semibold text-foreground">Recent Documents</h2>
                <span className="text-xs font-medium text-primary cursor-pointer hover:underline" onClick={() => navigate(`/tenant/${tenantId}/documents${activePackageId ? `?packageId=${activePackageId}` : ''}`)}>
                  View all
                </span>
              </div>

              <CardContent className="p-0">
                <Table>
                <TableBody>
                    {recentDocuments && recentDocuments.length > 0 ? recentDocuments.map(doc => {
                    const docTitle = doc.title || doc.document_name || 'Untitled Document';
                    const categoryName = doc.documents_categories?.name || doc.category || 'Document';
                    const fileCount = doc.file_names?.length || doc.uploaded_files?.length || doc.file_paths?.length || 0;
                    const isReleased = doc.is_released_to_client ?? doc.isclientdoc ?? false;
                    return <TableRow key={doc.id}>
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
                          <TableCell>
                            {isReleased ? <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Released
                              </Badge> : <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>}
                          </TableCell>
                        </TableRow>;
                  }) : <TableRow>
                        <TableCell colSpan={3} className="text-center py-12">
                          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                          <p className="text-sm text-muted-foreground">No documents yet</p>
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Package & Progress Combined - Use activePackageId */}
            <TenantProgressTable key={`progress-${activePackageId}`} packageId={activePackageId || undefined} packageName={tenantPackages.find(p => p.id === activePackageId)?.name || packages[0]?.name} packageDate={packages[0]?.date} documentCount={documentCount} memberCount={memberCount} />
          </div>

          {/* Right: Package Details */}
          <div className="space-y-6">
            {/* Package Time Remaining */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <div className="bg-muted/30 px-6 py-4 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <PackageIcon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Active Package</span>
                  </div>
                  {activePackageId && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 text-primary hover:bg-primary/10" 
                      onClick={() => navigate(`/admin/package/${activePackageId}/tenant/${tenantId}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
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
                        {/* Current Package */}
                        <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-primary/5 to-transparent hover:shadow-md transition-all duration-200">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <PackageIcon className="h-5 w-5 text-primary" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Package</p>
                            <p className="text-xs mt-0.5 text-muted-foreground truncate">
                              {activePackage?.name || 'No package selected'}
                            </p>
                          </div>
                        </div>

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

                        {/* Package Selector Dropdown */}
                        <div className="pt-4 mt-4 border-t border-border/40">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full h-9 px-3 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-medium shadow-sm justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="truncate">{tenantPackages.find(p => p.id === activePackageId)?.name || 'Select Package'}</span>
                                </div>
                                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-64 bg-background border border-border/50 shadow-xl z-50 p-1">
                              {tenantPackages.map(pkg => (
                                <DropdownMenuItem 
                                  key={pkg.id} 
                                  onClick={() => setActivePackageId(pkg.id)} 
                                  className={`flex items-center gap-3 cursor-pointer rounded-md px-3 py-2.5 ${pkg.id === activePackageId ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
                                >
                                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${pkg.id === activePackageId ? 'bg-primary/20' : 'bg-muted'}`}>
                                    <FileText className="h-3.5 w-3.5" />
                                  </div>
                                  <span className="flex-1 font-medium text-sm">{pkg.name}</span>
                                  {pkg.id === activePackageId && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

            {/* Liaison Officer */}
            {liaisonName && <Card className="border-0 shadow-lg overflow-hidden">
              <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
                <h2 className="font-semibold text-foreground">CST Officer</h2>
              </div>
              
              <div className="p-6">
                <div className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-gradient-to-r from-primary/5 to-transparent hover:shadow-md transition-all duration-200">
                  <div className="flex-shrink-0">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarImage src={liaisonAvatar} alt={liaisonName} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {liaisonName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{liaisonName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{liaisonEmail}</p>
                  </div>
                  
                </div>
              </div>
            </Card>}

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

            {/* Quick Note */}
            <Card className="border-0 shadow-lg overflow-hidden">
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
            </Card>
          </div>
        </div>
      </div>
    </div>;
}