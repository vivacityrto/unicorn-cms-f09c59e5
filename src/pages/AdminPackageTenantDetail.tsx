import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Building2, Mail, Phone, MapPin, Globe, User, Calendar, ExternalLink } from "lucide-react";
import PackageDetail from "./PackageDetail";

interface TenantInfo {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

interface TenantContact {
  name: string;
  email: string;
  phone: string;
  avatar_url?: string;
}

export default function AdminPackageTenantDetail() {
  const { id: packageId, tenantId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [tenantContact, setTenantContact] = useState<TenantContact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      fetchTenantInfo();
    }
  }, [tenantId]);

  const fetchTenantInfo = async () => {
    if (!tenantId) return;
    
    try {
      setLoading(true);
      
      // Fetch tenant basic info
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id, name, status, created_at")
        .eq("id", parseInt(tenantId))
        .single();
      
      if (tenantError) throw tenantError;
      setTenantInfo(tenant);
      
      // Fetch admin user for contact info
      const { data: adminUser, error: userError } = await supabase
        .from("users")
        .select("first_name, last_name, email, phone, mobile_phone, avatar_url")
        .eq("tenant_id", parseInt(tenantId))
        .eq("unicorn_role", "Admin")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (!userError && adminUser) {
        setTenantContact({
          name: `${adminUser.first_name || ''} ${adminUser.last_name || ''}`.trim() || 'No contact',
          email: adminUser.email || '',
          phone: adminUser.phone || adminUser.mobile_phone || '',
          avatar_url: adminUser.avatar_url || undefined
        });
      }
    } catch (error: any) {
      console.error("Error fetching tenant info:", error);
      toast({
        title: "Error",
        description: "Failed to load tenant information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with back button */}
      <div className="px-6 pt-6 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/package/${packageId}`)}
          className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Package
        </Button>
      </div>

      {/* Tenant Info Card */}
      {!loading && tenantInfo && (
        <div className="px-6 pb-6">
          <Card className="bg-gradient-to-br from-primary/5 via-background to-muted/20 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                    <Building2 className="h-7 w-7 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">{tenantInfo.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Tenant ID: {tenantInfo.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={tenantInfo.status === 'active' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {tenantInfo.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/tenant/${tenantId}`)}
                    className="gap-2"
                  >
                    View Full Profile
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Contact Person */}
                {tenantContact && (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                      <AvatarImage src={tenantContact.avatar_url} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                        {getInitials(tenantContact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{tenantContact.name}</p>
                      <p className="text-xs text-muted-foreground">Primary Contact</p>
                    </div>
                  </div>
                )}

                {/* Email */}
                {tenantContact?.email && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{tenantContact.email}</p>
                      <p className="text-xs text-muted-foreground">Email</p>
                    </div>
                  </div>
                )}

                {/* Phone */}
                {tenantContact?.phone && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tenantContact.phone}</p>
                      <p className="text-xs text-muted-foreground">Phone</p>
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(tenantInfo.created_at).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">Member Since</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state for tenant card */}
      {loading && (
        <div className="px-6 pb-6">
          <Card className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-muted" />
                <div className="space-y-2">
                  <div className="h-5 w-40 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted" />
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-20 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Package Detail Component */}
      <PackageDetail />
    </div>
  );
}
