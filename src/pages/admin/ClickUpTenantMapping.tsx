import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, MapPin } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const MATCH_FIELDS = [
  { value: "space_name", label: "Space Name" },
  { value: "folder_name_path", label: "Folder Name Path" },
  { value: "list_name", label: "List Name" },
] as const;

type MatchField = "space_name" | "folder_name_path" | "list_name";

interface MappingRow {
  id: number;
  tenant_id: number;
  match_field: string;
  match_pattern: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  tenant_name?: string;
}

export default function ClickUpTenantMapping() {
  const queryClient = useQueryClient();
  const [matchField, setMatchField] = useState<MatchField>("space_name");
  const [matchPattern, setMatchPattern] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [priority, setPriority] = useState("0");

  // Fetch mappings with tenant names
  const { data: mappings, isLoading } = useQuery({
    queryKey: ["clickup-tenant-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clickup_tenant_mapping")
        .select("*")
        .order("priority", { ascending: false });
      if (error) throw error;

      // Fetch tenant names for display
      const tenantIds = [...new Set((data || []).map((m: any) => m.tenant_id))];
      if (tenantIds.length === 0) return [];

      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds);

      const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.name]));
      return (data || []).map((m: any) => ({
        ...m,
        tenant_name: tenantMap.get(m.tenant_id) || `Tenant ${m.tenant_id}`,
      })) as MappingRow[];
    },
  });

  // Fetch tenants for dropdown
  const { data: tenants } = useQuery({
    queryKey: ["tenants-for-mapping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Add mapping
  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clickup_tenant_mapping")
        .insert({
          tenant_id: Number(selectedTenantId),
          match_field: matchField,
          match_pattern: matchPattern.trim(),
          priority: Number(priority),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clickup-tenant-mappings"] });
      setMatchPattern("");
      setSelectedTenantId("");
      setPriority("0");
      toast.success("Mapping added");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add mapping"),
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { error } = await supabase
        .from("clickup_tenant_mapping")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clickup-tenant-mappings"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update"),
  });

  // Delete mapping
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("clickup_tenant_mapping")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clickup-tenant-mappings"] });
      toast.success("Mapping deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  const canAdd = selectedTenantId && matchPattern.trim();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ClickUp Tenant Mapping</h1>
        <p className="text-muted-foreground mt-1">
          Map ClickUp hierarchy patterns (space, folder, list) to tenants for automatic task resolution.
        </p>
      </div>

      {/* Add new mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Mapping Rule
          </CardTitle>
          <CardDescription>
            Define a pattern to automatically assign ClickUp tasks to a tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <Label>Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants || []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Match Field</Label>
              <Select value={matchField} onValueChange={(v) => setMatchField(v as MatchField)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Match Pattern</Label>
              <Input
                value={matchPattern}
                onChange={(e) => setMatchPattern(e.target.value)}
                placeholder="e.g. Acme Training/Compliance"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                min={0}
              />
            </div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!canAdd || addMutation.isPending}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mappings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Current Mappings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !mappings?.length ? (
            <p className="text-muted-foreground text-center py-8">
              No mappings configured yet. Add one above to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Match Field</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.tenant_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {MATCH_FIELDS.find((f) => f.value === m.match_field)?.label || m.match_field}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{m.match_pattern}</TableCell>
                    <TableCell className="text-center">{m.priority}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={m.is_active}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: m.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete mapping?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the mapping for "{m.match_pattern}" → {m.tenant_name}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(m.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
