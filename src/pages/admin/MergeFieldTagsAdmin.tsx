import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useMergeFields, type MergeFieldDefinition } from "@/hooks/useMergeFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Tags, Image, Type } from "lucide-react";

const SOURCE_TABLES = [
  { value: "tenants", label: "Tenants" },
  { value: "tenant_profile", label: "Tenant Profile" },
  { value: "tenant_addresses", label: "Tenant Addresses" },
  { value: "tga_rto_snapshots", label: "TGA RTO Snapshots" },
];

// Columns per source table (excludes internal/system columns)
const SOURCE_TABLE_COLUMNS: Record<string, string[]> = {
  tenants: [
    "name", "rto_name", "legal_name", "rto_id", "cricos_id", "abn", "acn",
    "website", "lms", "sms", "accounting_system", "state", "tenant_type",
    "status", "slug",
  ],
  tenant_profile: [
    "trading_name", "legal_name", "abn", "acn", "org_type",
    "primary_contact_name", "primary_contact_email", "primary_contact_phone",
    "address_line_1", "address_line_2", "suburb", "state", "postcode", "country",
    "rto_number", "cricos_number", "website", "phone1", "phone2", "rto_email",
    "gto_name",
  ],
  tenant_addresses: [
    "address1", "address2", "address3", "suburb", "state", "postcode",
    "country", "country_code", "full_address",
  ],
  tga_rto_snapshots: [
    "payload->registrations->0->endDate",
    "payload->registrations->0->startDate",
    "payload->organisationName",
    "payload->abn",
  ],
};

const ADDRESS_TYPES = [
  { value: "HO", label: "Head Office" },
  { value: "DS", label: "Delivery Site" },
  { value: "PO", label: "PO Box" },
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
];

interface FormData {
  tag: string;
  name: string;
  source_table: string;
  source_column: string;
  source_address_type: string;
  field_type: string;
  description: string;
  is_active: boolean;
}

const emptyForm: FormData = {
  tag: "",
  name: "",
  source_table: "",
  source_column: "",
  source_address_type: "",
  field_type: "text",
  description: "",
  is_active: true,
};

export default function MergeFieldTagsAdmin() {
  const { mergeFields, loading, addMergeField, updateMergeField, deleteMergeField } = useMergeFields();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<MergeFieldDefinition | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MergeFieldDefinition | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = mergeFields.filter(
    (f) =>
      f.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.source_table || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openCreate = () => {
    setEditingField(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (field: MergeFieldDefinition) => {
    setEditingField(field);
    setFormData({
      tag: field.tag,
      name: field.name,
      source_table: field.source_table || "",
      source_column: field.source_column || "",
      source_address_type: field.source_address_type || "",
      field_type: field.field_type || "text",
      description: field.description || "",
      is_active: field.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.tag || !formData.name) {
      toast({ title: "Tag and Name are required", variant: "destructive" });
      return;
    }
    // Check for duplicate tag (excluding current field being edited)
    const duplicate = mergeFields.find(
      (f) => f.tag.toLowerCase() === formData.tag.toLowerCase() && f.id !== editingField?.id
    );
    if (duplicate) {
      toast({ title: "Duplicate tag code", description: `"${formData.tag}" already exists`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingField) {
        await updateMergeField(editingField.id, {
          tag: formData.tag,
          name: formData.name,
          source_table: formData.source_table || null,
          source_column: formData.source_column || null,
          source_address_type: formData.source_address_type || null,
          field_type: formData.field_type,
          description: formData.description || null,
          is_active: formData.is_active,
        });
        toast({ title: "Merge field updated" });
      } else {
        await addMergeField({
          tag: formData.tag,
          name: formData.name,
          source_table: formData.source_table || null,
          source_column: formData.source_column || null,
          source_address_type: formData.source_address_type || null,
          field_type: formData.field_type,
          description: formData.description || null,
          is_active: formData.is_active,
        });
        toast({ title: "Merge field created" });
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMergeField(deleteTarget.id);
      toast({ title: "Merge field deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const handleToggleActive = async (field: MergeFieldDefinition) => {
    try {
      await updateMergeField(field.id, { is_active: !field.is_active });
      toast({ title: field.is_active ? "Field deactivated" : "Field activated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Tags className="h-6 w-6" />
              Merge Field Tags
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage document merge field definitions and source mappings
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tag, name, or source..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary">{mergeFields.length} fields</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-300px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Tag</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source Table</TableHead>
                    <TableHead>Source Column</TableHead>
                    <TableHead className="w-[80px]">Addr Type</TableHead>
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead className="w-[80px]">Active</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? "No matching fields" : "No merge fields defined"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((field) => (
                      <TableRow key={field.id} className={!field.is_active ? "opacity-50" : ""}>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                            {`{{${field.tag}}}`}
                          </code>
                        </TableCell>
                        <TableCell className="font-medium">{field.name}</TableCell>
                        <TableCell>
                          {field.source_table && (
                            <Badge variant="outline" className="text-xs">
                              {field.source_table}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {field.source_column || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {field.source_address_type || "—"}
                        </TableCell>
                        <TableCell>
                          {field.field_type === "image" ? (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Image className="h-3 w-3" /> Image
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Type className="h-3 w-3" /> Text
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={field.is_active}
                            onCheckedChange={() => handleToggleActive(field)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(field)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(field)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingField ? "Edit Merge Field" : "Add Merge Field"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tag Code *</Label>
                  <Input
                    value={formData.tag}
                    onChange={(e) => setFormData({ ...formData, tag: e.target.value.replace(/\s/g, "") })}
                    placeholder="RTOName"
                  />
                  <p className="text-xs text-muted-foreground">Used as {`{{${formData.tag || "Tag"}}}`}</p>
                </div>
                <div className="space-y-2">
                  <Label>Display Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="RTO Name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Source Table</Label>
                  <Select value={formData.source_table} onValueChange={(v) => setFormData({ ...formData, source_table: v, source_column: "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select table..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TABLES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source Column</Label>
                  {formData.source_table && SOURCE_TABLE_COLUMNS[formData.source_table] ? (
                    <Select value={formData.source_column} onValueChange={(v) => setFormData({ ...formData, source_column: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_TABLE_COLUMNS[formData.source_table].map((col) => {
                          const usedBy = mergeFields.find(
                            (f) =>
                              f.source_table === formData.source_table &&
                              f.source_column === col &&
                              f.source_address_type === (formData.source_address_type || null) &&
                              f.id !== editingField?.id
                          );
                          return (
                            <SelectItem key={col} value={col}>
                              <span className="flex items-center gap-2">
                                {col}
                                {usedBy && (
                                  <span className="text-xs text-amber-600 ml-1">
                                    (used by {`{{${usedBy.tag}}}`})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={formData.source_column}
                      onChange={(e) => setFormData({ ...formData, source_column: e.target.value })}
                      placeholder="Select a table first..."
                      disabled={!formData.source_table}
                    />
                  )}
                  {formData.source_column && (() => {
                    const conflict = mergeFields.find(
                      (f) =>
                        f.source_table === formData.source_table &&
                        f.source_column === formData.source_column &&
                        f.source_address_type === (formData.source_address_type || null) &&
                        f.id !== editingField?.id
                    );
                    return conflict ? (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        ⚠️ Already mapped to {`{{${conflict.tag}}}`}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Address Type</Label>
                  <Select value={formData.source_address_type} onValueChange={(v) => setFormData({ ...formData, source_address_type: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="N/A" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ADDRESS_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Field Type</Label>
                  <Select value={formData.field_type} onValueChange={(v) => setFormData({ ...formData, field_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Human-readable description of this field..."
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingField ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Merge Field</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong> ({`{{${deleteTarget?.tag}}}`})?
                This action cannot be undone. Consider deactivating instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
