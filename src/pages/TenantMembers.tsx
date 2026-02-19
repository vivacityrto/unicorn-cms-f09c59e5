import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Search, Mail, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
}

export default function TenantMembers() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [tenantName, setTenantName] = useState("");

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch tenant info
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", parseInt(tenantId!))
        .single();

      if (tenantData) {
        setTenantName(tenantData.name);
      }

      // Single join query: tenant_users → users via user_id = user_uuid FK
      const { data, error } = await supabase
        .from("tenant_users")
        .select("user_id, role, users(*)")
        .eq("tenant_id", parseInt(tenantId!));

      if (error) throw error;

      const formattedMembers: Member[] = (data || [])
        .filter((tu: any) => tu.users)
        .map((tu: any) => {
          const user = tu.users;
          return {
            id: user.user_uuid,
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            email: user.email,
            phone: user.phone || user.mobile_phone || "-",
            role: user.unicorn_role || tu.role || "User",
            status: user.disabled ? "inactive" : "active",
            created_at: user.created_at
          };
        });

      setMembers(formattedMembers);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load members",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter(member =>
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
        boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
        border: "1px solid #00000052"
      }}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Team Members</h1>
          <p className="text-sm text-muted-foreground">{tenantName}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Member</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Email</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Phone</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Role</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Status</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No members found
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member, index) => (
                  <TableRow 
                    key={member.id}
                    className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                  >
                    <TableCell className="py-6 border-r border-border/50">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {member.first_name?.[0]}{member.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-foreground">
                            {member.first_name} {member.last_name}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="border-r border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        {member.email}
                      </div>
                    </TableCell>
                    <TableCell className="border-r border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {member.phone}
                      </div>
                    </TableCell>
                    <TableCell className="border-r border-border/50">
                      <Badge variant="outline">{member.role}</Badge>
                    </TableCell>
                    <TableCell className="border-r border-border/50">
                      <Badge 
                        variant="outline"
                        className={member.status === "active" 
                          ? "border-green-500 bg-green-500/10 text-green-600" 
                          : "border-muted bg-muted/10 text-muted-foreground"
                        }
                      >
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
