import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { ResponsiveTableShell, ResponsiveListCard, ResponsiveListCards, columnVisibility } from '@/components/ui/responsive-table';
import { Users2, Building2, Search, FolderPlus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { positionTypeLabel, type PositionTypeOption } from '@/lib/roles/positionType';
import { cn } from '@/lib/utils';
import { TenantFilterDialog } from '@/components/tenant-users/TenantFilterDialog';

interface DirectoryRow {
  row_key: string;
  source: 'user' | 'contact';
  tenant_id: number;
  tenant_name: string;
  first_name: string;
  last_name: string | null;
  email: string;
  position_type: string | null;
  status: string;
  created_at: string;
}

interface ContactGroup {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

const ITEMS_PER_PAGE = 25;

export default function ContactDirectory() {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionTypeOptions, setPositionTypeOptions] = useState<PositionTypeOption[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilters, setTenantFilters] = useState<string[]>([]);
  const [tenantFilterDialogOpen, setTenantFilterDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [updatingPositionType, setUpdatingPositionType] = useState<string | null>(null);

  useEffect(() => {
    fetchDirectory();
    fetchPositionTypeOptions();
    fetchGroups();
  }, []);

  const fetchDirectory = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_contact_directory');
    if (error) {
      console.error('get_admin_contact_directory error:', error);
      toast.error('Failed to load the contact directory');
    } else {
      setRows((data || []) as DirectoryRow[]);
    }
    setLoading(false);
  };

  const handlePositionTypeChange = async (row: DirectoryRow, value: string) => {
    const nextPositionType = value === '__none__' ? null : value;
    if ((row.position_type ?? null) === nextPositionType) return;

    const [source, idStr] = row.row_key.split(':');
    const id = Number(idStr);
    const table = source === 'user' ? 'tenant_users' : 'tenant_contacts';

    setUpdatingPositionType(row.row_key);
    const { error } = await supabase.from(table).update({ position_type: nextPositionType }).eq('id', id);
    setUpdatingPositionType(null);

    if (error) {
      console.error(`${table} position_type update error:`, error);
      toast.error('Failed to update position type');
      return;
    }

    setRows((previous) =>
      previous.map((r) => (r.row_key === row.row_key ? { ...r, position_type: nextPositionType } : r))
    );
    toast.success(nextPositionType ? 'Position type updated' : 'Position type cleared');
  };

  const fetchPositionTypeOptions = async () => {
    const { data } = await supabase
      .from('dd_position_type')
      .select('value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    setPositionTypeOptions(data || []);
  };

  const fetchGroups = async () => {
    setGroupsLoading(true);
    const { data: groupRows, error } = await supabase
      .from('tenant_contact_groups')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('tenant_contact_groups fetch error:', error);
      setGroupsLoading(false);
      return;
    }
    const { data: memberRows } = await supabase
      .from('tenant_contact_group_members')
      .select('group_id');
    const counts = new Map<number, number>();
    (memberRows || []).forEach((m: { group_id: number }) => {
      counts.set(m.group_id, (counts.get(m.group_id) || 0) + 1);
    });
    setGroups(
      (groupRows || []).map((g) => ({ ...g, member_count: counts.get(g.id) || 0 }))
    );
    setGroupsLoading(false);
  };

  const tenantOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => map.set(r.tenant_id, r.tenant_name));
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name, status: null, csc_user_id: null }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    let filtered = [...rows];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          `${r.first_name} ${r.last_name || ''}`.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.tenant_name.toLowerCase().includes(q)
      );
    }
    if (tenantFilters.length > 0) {
      filtered = filtered.filter((r) => tenantFilters.includes(String(r.tenant_id)));
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    if (sourceFilter !== 'all') {
      filtered = filtered.filter((r) => r.source === sourceFilter);
    }
    if (positionFilter === '__none__') {
      filtered = filtered.filter((r) => r.position_type == null);
    } else if (positionFilter !== 'all') {
      filtered = filtered.filter((r) => r.position_type === positionFilter);
    }
    return filtered;
  }, [rows, searchQuery, tenantFilters, statusFilter, sourceFilter, positionFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, tenantFilters, statusFilter, sourceFilter, positionFilter]);

  const pagedRows = filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));

  const toggleSelected = (rowKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pagedRows.every((r) => next.has(r.row_key));
      pagedRows.forEach((r) => (allSelected ? next.delete(r.row_key) : next.add(r.row_key)));
      return next;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.row_key));

  const openAddToGroup = () => {
    if (selected.size === 0) {
      toast.error('Select at least one contact or user first');
      return;
    }
    setTargetGroupId('');
    setNewGroupName('');
    setAddToGroupOpen(true);
  };

  const handleAddToGroup = async () => {
    setSavingGroup(true);
    try {
      let groupId: number;
      if (targetGroupId === '__new__') {
        if (!newGroupName.trim()) {
          toast.error('Enter a name for the new group');
          setSavingGroup(false);
          return;
        }
        const { data, error } = await supabase
          .from('tenant_contact_groups')
          .insert({ name: newGroupName.trim() })
          .select('id')
          .single();
        if (error) throw error;
        groupId = data.id;
      } else {
        groupId = Number(targetGroupId);
      }

      const memberRows = selectedRows.map((r) => ({
        group_id: groupId,
        member_type: r.source,
        member_id: r.row_key.split(':')[1],
        tenant_id: r.tenant_id,
      }));

      const { error: insertError } = await supabase
        .from('tenant_contact_group_members')
        .upsert(memberRows, { onConflict: 'group_id,member_type,member_id' });
      if (insertError) throw insertError;

      toast.success(`Added ${selectedRows.length} to the group`);
      setAddToGroupOpen(false);
      setSelected(new Set());
      fetchGroups();
    } catch (err) {
      console.error('add to group error:', err);
      toast.error('Failed to add to group');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    const { error } = await supabase.from('tenant_contact_groups').delete().eq('id', groupToDelete.id);
    if (error) {
      toast.error('Failed to delete group');
      return;
    }
    toast.success('Group deleted');
    setGroupToDelete(null);
    fetchGroups();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 animate-fade-in">
        <PageHeader
          title="Contact Directory"
          description="Every Unicorn user and RTO contact across all tenants — build named groups here for bulk actions like Teams event registration."
          icon={Users2}
        />

        <Tabs defaultValue="directory">
          <TabsList>
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-4 mt-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setTenantFilterDialogOpen(true)}
                className={cn(
                  'w-full md:w-[220px] justify-between font-normal min-w-0',
                  tenantFilters.length === 0 && 'text-muted-foreground',
                )}
              >
                <span className="truncate">
                  {tenantFilters.length === 0
                    ? 'All Tenants'
                    : tenantFilters.length === 1
                      ? tenantOptions.find((tenant) => String(tenant.id) === tenantFilters[0])?.name ?? '1 tenant'
                      : `${tenantFilters.length} tenants selected`}
                </span>
                <Building2 className="h-4 w-4 shrink-0 opacity-50 ml-2" />
              </Button>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Users + Contacts</SelectItem>
                  <SelectItem value="user">Users only</SelectItem>
                  <SelectItem value="contact">Contacts only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Position type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All positions</SelectItem>
                  <SelectItem value="__none__">No position type</SelectItem>
                  {positionTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-sm">{selected.size} selected</span>
                <Button size="sm" onClick={openAddToGroup}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Add to group
                </Button>
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden">
                  <ResponsiveListCards isEmpty={pagedRows.length === 0} emptyState="No matching contacts or users">
                    {pagedRows.map((r) => (
                      <ResponsiveListCard
                        key={r.row_key}
                        title={`${r.first_name} ${r.last_name || ''}`.trim()}
                        subtitle={r.email}
                        status={<Badge variant={r.source === 'user' ? 'default' : 'outline'}>{r.source}</Badge>}
                        fields={[
                          { label: 'Client', value: r.tenant_name, priority: 'primary' },
                          {
                            label: 'Position',
                            value: (
                              <Select
                                value={r.position_type || '__none__'}
                                onValueChange={(value) => handlePositionTypeChange(r, value)}
                                disabled={updatingPositionType === r.row_key}
                              >
                                <SelectTrigger className="w-40 h-8 text-sm" aria-label={`Position type for ${r.email}`}>
                                  <SelectValue>
                                    {r.position_type ? positionTypeLabel(r.position_type, positionTypeOptions) : 'Position type'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No position type</SelectItem>
                                  {positionTypeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ),
                            priority: 'secondary',
                          },
                          { label: 'Status', value: r.status, priority: 'secondary' },
                        ]}
                      />
                    ))}
                  </ResponsiveListCards>
                </div>

                {/* Desktop */}
                <ResponsiveTableShell className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={pagedRows.length > 0 && pagedRows.every((r) => selected.has(r.row_key))}
                            onCheckedChange={toggleSelectAllOnPage}
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className={columnVisibility.lg}>Email</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className={columnVisibility.xl}>Position Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No matching contacts or users
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedRows.map((r) => (
                          <TableRow key={r.row_key}>
                            <TableCell>
                              <Checkbox checked={selected.has(r.row_key)} onCheckedChange={() => toggleSelected(r.row_key)} />
                            </TableCell>
                            <TableCell className="font-medium">
                              {r.first_name} {r.last_name || ''}
                            </TableCell>
                            <TableCell className={cn('text-sm text-muted-foreground', columnVisibility.lg)}>{r.email}</TableCell>
                            <TableCell className="text-sm">{r.tenant_name}</TableCell>
                            <TableCell className={columnVisibility.xl} onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={r.position_type || '__none__'}
                                onValueChange={(value) => handlePositionTypeChange(r, value)}
                                disabled={updatingPositionType === r.row_key}
                              >
                                <SelectTrigger className="w-40 h-8 text-sm" aria-label={`Position type for ${r.email}`}>
                                  <SelectValue>
                                    {r.position_type ? positionTypeLabel(r.position_type, positionTypeOptions) : 'Position type'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No position type</SelectItem>
                                  {positionTypeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.source === 'user' ? 'default' : 'outline'}>{r.source}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{r.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ResponsiveTableShell>

                {filteredRows.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredRows.length)}–
                      {Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} of {filteredRows.length}
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                          .map((p) => (
                            <PaginationItem key={p}>
                              <PaginationLink onClick={() => setCurrentPage(p)} isActive={currentPage === p} className="cursor-pointer">
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="groups" className="space-y-4 mt-4">
            {groupsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No groups yet — select rows in the Directory tab and use "Add to group" to create one.
              </p>
            ) : (
              <div className="divide-y border rounded-md">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {g.member_count} member{g.member_count === 1 ? '' : 's'}
                        {g.description ? ` · ${g.description}` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setGroupToDelete(g)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Tenant filter dialog — shared with Tenant Users for the same multi-select behavior. */}
      <TenantFilterDialog
        open={tenantFilterDialogOpen}
        onOpenChange={setTenantFilterDialogOpen}
        tenants={tenantOptions}
        selected={tenantFilters}
        onApply={setTenantFilters}
      />

      {/* Add to group dialog */}
      <Dialog open={addToGroupOpen} onOpenChange={setAddToGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selected.size} to a group</DialogTitle>
            <DialogDescription>Pick an existing group or create a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Group</Label>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">+ Create new group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {targetGroupId === '__new__' && (
              <div>
                <Label htmlFor="new-group-name">New group name</Label>
                <Input id="new-group-name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToGroupOpen(false)} disabled={savingGroup}>
              Cancel
            </Button>
            <Button onClick={handleAddToGroup} disabled={savingGroup || !targetGroupId}>
              {savingGroup && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete group confirmation */}
      <AlertDialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes "{groupToDelete?.name}" and its member list. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGroup}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
