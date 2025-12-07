import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Calendar, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LoginRecord {
  id: string;
  user_email: string;
  user_name: string;
  login_time: string;
  ip_address: string;
  device: string;
  status: string;
}

export default function TenantLogins() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loginRecords, setLoginRecords] = useState<LoginRecord[]>([]);
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

      // Mock login data (replace with actual query when available)
      const mockData: LoginRecord[] = [
        {
          id: "1",
          user_email: "chris.margaritis@ahmrc.edu.au",
          user_name: "Chris Margaritis",
          login_time: "2024-11-15 09:30:00",
          ip_address: "203.45.67.89",
          device: "Chrome on Windows",
          status: "success"
        },
        {
          id: "2",
          user_email: "geralyn@vivacity.com.au",
          user_name: "Geralyn Papulot",
          login_time: "2024-11-14 14:22:00",
          ip_address: "192.168.1.1",
          device: "Safari on macOS",
          status: "success"
        },
        {
          id: "3",
          user_email: "chris.margaritis@ahmrc.edu.au",
          user_name: "Chris Margaritis",
          login_time: "2024-11-13 08:15:00",
          ip_address: "203.45.67.89",
          device: "Chrome on Windows",
          status: "success"
        }
      ];

      setLoginRecords(mockData);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load login records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = loginRecords.filter(record =>
    record.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.user_name.toLowerCase().includes(searchQuery.toLowerCase())
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
          <h1 className="text-[28px] font-bold">Login History</h1>
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
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">User</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Email</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Login Time</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">IP Address</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Device</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No login records found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record, index) => (
                  <TableRow 
                    key={record.id}
                    className={`group transition-all duration-200 border-b border-border/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                  >
                    <TableCell className="py-6 border-r border-border/50 font-semibold text-foreground">{record.user_name}</TableCell>
                    <TableCell className="text-muted-foreground border-r border-border/50">{record.user_email}</TableCell>
                    <TableCell className="border-r border-border/50">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{new Date(record.login_time).toLocaleDateString()}</span>
                        <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                        <span>{new Date(record.login_time).toLocaleTimeString()}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm border-r border-border/50">{record.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground border-r border-border/50">{record.device}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-green-500 bg-green-500/10 text-green-600">
                        {record.status}
                      </Badge>
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
