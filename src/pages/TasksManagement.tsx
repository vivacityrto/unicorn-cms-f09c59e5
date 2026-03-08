import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, AlertTriangle, Search, Calendar, CheckCheck, X, Plus, AlertCircle, ListTodo, CalendarIcon, ClipboardList, CalendarClock, Upload, File as FileIcon, Building, Download, User, UserCheck, Pencil, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, isPast } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { textToSafeHtml } from "@/lib/sanitize";
interface Task {
  id: string;
  tenant_id: number;
  package_id: number | null;
  task_name: string;
  description: string | null;
  due_date: string;
  status: string | null;
  completed: boolean | null;
  created_by: string | null;
  followers: string[];
  created_at: string | null;
  updated_at?: string | null;
  tenant_name?: string;
  package_name?: string;
  package_created_at?: string | null;
  package_full_text?: string | null;
  created_by_name?: string;
  follower_users?: Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>;
  file_paths?: string[];
  source?: 'task' | 'action' | 'ops';
}
type TaskStatus = "pending" | "in_progress" | "completed" | "overdue" | "extended";
export default function TasksManagement() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    task_name: "",
    description: "",
    due_date: "",
    tenant_id: "",
    package_id: "",
    package_name: "",
    status: "not_started",
    assigned_to: ""
  });
  const [followers, setFollowers] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const itemsPerPage = 20;
  const {
    toast
  } = useToast();
  const {
    user,
    isSuperAdmin
  } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    fetchTasks();
    fetchDropdownData();

    // Set up real-time subscription for task updates
    const channel = supabase
      .channel('task-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks_tenants'
        },
        (payload) => {
          console.log('Task updated:', payload);
          // Update the task in local state
          setTasks(prev => prev.map(task => 
            task.id === payload.new.id 
              ? {
                  ...task,
                  status: payload.new.status,
                  completed: payload.new.completed,
                  updated_at: payload.new.updated_at
                }
              : task
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    filterTasks();
  }, [searchQuery, statusFilter, tasks]);
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);
  const fetchTasks = async () => {
    try {
      setLoading(true);

      // Fetch all data from tasks_tenants table
      const {
        data: tasksData,
        error: tasksError
      } = await supabase.from("tasks_tenants").select(`
          id,
          tenant_id,
          package_id,
          task_name,
          description,
          due_date,
          status,
          completed,
          created_by,
          followers,
          created_at,
          updated_at,
          file_paths
        `).order("created_at", {
        ascending: false
      });
      if (tasksError) throw tasksError;

      // Fetch tenant and package names separately (no FK joins available)
      const tenantIds = [...new Set(tasksData?.map((t: any) => t.tenant_id).filter(Boolean))];
      const packageIds = [...new Set(tasksData?.map((t: any) => t.package_id).filter(Boolean))];

      let tenantsMap = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: tenantRows } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        if (tenantRows) tenantsMap = new Map(tenantRows.map((t: any) => [t.id, t.name]));
      }

      let packagesMap = new Map<number, { name: string; created_at: string | null; full_text: string | null }>();
      if (packageIds.length > 0) {
        const { data: pkgRows } = await supabase.from("packages").select("id, name, created_at, full_text").in("id", packageIds);
        if (pkgRows) packagesMap = new Map(pkgRows.map((p: any) => [p.id, { name: p.name, created_at: p.created_at, full_text: p.full_text }]));
      }

      // Get unique creator and follower user IDs
      const creatorIds = [...new Set(tasksData?.map((task: any) => task.created_by).filter(Boolean))] as string[];
      const followerIds = [...new Set(tasksData?.flatMap((task: any) => task.followers || []).filter(Boolean))] as string[];
      const allUserIds = [...new Set([...creatorIds, ...followerIds])];

      // Fetch user data if there are any
      let usersMap = new Map<string, { user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>();
      if (allUserIds.length > 0) {
        const {
          data: usersData
        } = await supabase.from("users").select("user_uuid, first_name, last_name, avatar_url").in("user_uuid", allUserIds);
        if (usersData) {
          usersMap = new Map(usersData.map(user => [user.user_uuid, user]));
        }
      }

      // Map all fields from tasks_tenants table
      const transformedTasks = tasksData?.map((task: any) => {
        const pkg = task.package_id ? packagesMap.get(task.package_id) : null;
        return {
          id: task.id,
          tenant_id: task.tenant_id,
          package_id: task.package_id,
          task_name: task.task_name,
          description: task.description,
          due_date: task.due_date,
          status: task.status,
          completed: task.completed,
          created_by: task.created_by,
          followers: task.followers || [],
          created_at: task.created_at,
          updated_at: task.updated_at,
          file_paths: task.file_paths || [],
          tenant_name: tenantsMap.get(task.tenant_id) || "N/A",
          package_name: pkg?.name || null,
          package_created_at: pkg?.created_at || null,
          package_full_text: pkg?.full_text || null,
          created_by_name: task.created_by ? `${usersMap.get(task.created_by)?.first_name || ''} ${usersMap.get(task.created_by)?.last_name || ''}`.trim() || "Unknown" : "Unknown",
          follower_users: (task.followers || []).map((id: string) => usersMap.get(id)).filter(Boolean)
        };
      }) || [];
      setTasks(transformedTasks);
      setFilteredTasks(transformedTasks);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Error",
        description: "Failed to fetch tasks",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const fetchDropdownData = async () => {
    try {
      // Fetch tenants (removed deprecated package_id field)
      const {
        data: tenantsData
      } = await supabase.from("tenants").select("id, name").order("name");

      // Fetch packages
      const {
        data: packagesData
      } = await supabase.from("packages").select("id, name").order("name");

      // Fetch only valid Vivacity Team users (those that exist in auth.users)
      const {
        data: usersData
      } = await supabase.rpc("get_valid_vivacity_users");
      setTenants(tenantsData || []);
      setPackages(packagesData || []);
      setUsers(usersData || []);
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
    }
  };
  const filterTasks = () => {
    let filtered = [...tasks];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(task => task.task_name.toLowerCase().includes(query) || task.tenant_name?.toLowerCase().includes(query) || task.package_name?.toLowerCase().includes(query) || task.created_by_name?.toLowerCase().includes(query));
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(task => {
        const status = getTaskStatus(task);
        if (statusFilter === "completed") return status === "completed";
        if (statusFilter === "overdue") return status === "overdue";
        if (statusFilter === "in_progress") return status === "pending" || status === "in_progress";
        return true;
      });
    }
    
    setFilteredTasks(filtered);
  };
  const getTaskStatus = (task: Task): TaskStatus => {
    if (task.completed) return "completed";
    if (task.status === "extended") return "extended";
    if (isPast(new Date(task.due_date)) && !task.completed) return "overdue";
    if (task.status === "in_progress") return "in_progress";
    if (task.status === "not_started") return "pending";
    return "pending";
  };
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "overdue":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "extended":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };
  const getStatusBadge = (status: TaskStatus) => {
    const variants: Record<TaskStatus, {
      label: string;
      className: string;
    }> = {
      completed: {
        label: "Completed",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium"
      },
      overdue: {
        label: "Overdue",
        className: "bg-red-500/10 text-red-600 border-red-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      },
      extended: {
        label: "Extended",
        className: "bg-blue-500/10 text-blue-600 border-blue-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      },
      in_progress: {
        label: "In Progress",
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      },
      pending: {
        label: "Not Started",
        className: "bg-muted text-muted-foreground border-border text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
      }
    };
    const {
      label,
      className
    } = variants[status];
    return <Badge variant="outline" className={className}>
        {label}
      </Badge>;
  };
  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus
      };

      // If marking as completed, set completed flag and current timestamp
      if (newStatus === "completed") {
        updateData.completed = true;
      } else {
        updateData.completed = false;
      }
      const {
        error
      } = await supabase.from("tasks_tenants").update(updateData).eq("id", taskId);
      if (error) throw error;

      // Update local state
      setTasks(prevTasks => prevTasks.map(task => task.id === taskId ? {
        ...task,
        status: newStatus,
        completed: newStatus === "completed"
      } : task));
      toast({
        title: "Success",
        description: "Task status updated successfully"
      });
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive"
      });
    }
  };
  const deleteTask = async (taskId: string) => {
    try {
      const {
        error
      } = await supabase.from("tasks_tenants").delete().eq("id", taskId);
      if (error) throw error;

      // Update local state
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
      toast({
        title: "Success",
        description: "Task deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive"
      });
    }
  };
  const handleActionChange = async (taskId: string, action: string) => {
    if (action === "delete") {
      await deleteTask(taskId);
    } else {
      await updateTaskStatus(taskId, action);
    }
  };
  const handleRowClick = (task: Task) => {
    setSelectedTask(task);
    setIsSidebarOpen(true);
  };

  // Pagination
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  if (loading) {
    return <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>;
  }
  return <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Tasks Management</h1>
          <p className="text-muted-foreground">View and manage all client tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={open => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setUploadedFiles([]);
          }
        }}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Task
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[650px] border-[3px] border-[#dfdfdf] overflow-hidden">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2">
                <CheckCheck className="h-5 w-5" />
                Create Task
              </DialogTitle>
              <DialogDescription>
                Create a new task by providing the required information below
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[calc(90vh-180px)] overflow-y-auto px-1">
              <div className="grid gap-4 py-4 px-1">
                <div className="grid gap-2">
                  <Label htmlFor="task_name">Name *</Label>
                  <Input id="task_name" value={formData.task_name} onChange={e => setFormData({
                  ...formData,
                  task_name: e.target.value
                })} required />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={formData.description} onChange={e => setFormData({
                  ...formData,
                  description: e.target.value
                })} rows={4} className="leading-[26px]" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="due_date">Due Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black", !formData.due_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.due_date ? format(new Date(formData.due_date), "dd/MM/yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 data-[side=bottom]:p-0 data-[side=top]:p-[10px]" align="start">
                        <CalendarPicker mode="single" selected={formData.due_date ? new Date(formData.due_date) : undefined} onSelect={date => setFormData({
                        ...formData,
                        due_date: date ? format(date, "yyyy-MM-dd") : ""
                      })} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Combobox 
                      options={[
                        { value: "not_started", label: "Not Started" },
                        { value: "in_progress", label: "In Progress" },
                        { value: "completed", label: "Completed" }
                      ]} 
                      value={formData.status} 
                      onValueChange={value => setFormData({
                        ...formData,
                        status: value
                      })} 
                      placeholder="Select status" 
                      className="w-full" 
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-primary font-semibold">Followers</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {followers.map(userId => {
                      const user = users.find((u: any) => u.user_uuid === userId);
                      if (!user) return null;
                      return (
                        <div key={userId} className="relative group">
                          <Avatar className="h-10 w-10 border-2 border-background shadow-sm cursor-pointer" onClick={() => setFollowers(prev => prev.filter(id => id !== userId))}>
                            {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {user.first_name?.[0]}{user.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <button 
                            onClick={() => setFollowers(prev => prev.filter(id => id !== userId))}
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      );
                    })}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2 z-[80]" align="start">
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {users.filter((user: any) => !followers.includes(user.user_uuid)).map((user: any) => (
                            <div
                              key={user.user_uuid}
                              onClick={() => setFollowers(prev => [...prev, user.user_uuid])}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted transition-colors"
                            >
                              <Avatar className="h-7 w-7">
                                {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                  {user.first_name?.[0]}{user.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{user.first_name} {user.last_name}</span>
                            </div>
                          ))}
                          {users.filter((user: any) => !followers.includes(user.user_uuid)).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">All team members added</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tenant">Client *</Label>
                  <Combobox options={tenants.map(tenant => ({
                  value: tenant.id.toString(),
                  label: tenant.name
                }))} value={formData.tenant_id} onValueChange={value => {
                  const selectedTenant = tenants.find(t => t.id.toString() === value);
                  const selectedPackage = selectedTenant?.package_id ? packages.find(p => p.id === selectedTenant.package_id) : null;
                  setFormData({
                    ...formData,
                    tenant_id: value,
                    package_id: selectedTenant?.package_id?.toString() || "",
                    package_name: selectedPackage?.name || ""
                  });
                }} placeholder="Choose..." searchPlaceholder="Search client..." emptyText="No clients found." className="w-full" />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="files">Attachments</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input id="files" type="file" multiple onChange={e => {
                      const files = Array.from(e.target.files || []);
                      setUploadedFiles(prev => [...prev, ...files]);
                    }} className="cursor-pointer" />
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {uploadedFiles.length > 0 && <div className="space-y-1">
                        {uploadedFiles.map((file, idx) => <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                            <div className="flex items-center gap-2">
                              <FileIcon className="h-4 w-4" />
                              <span>{file.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ({(file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => {
                        setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
                      }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>)}
                      </div>}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex w-full justify-between items-center px-1">
              <div className="flex items-center">
                {formData.tenant_id && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ClipboardList className="h-4 w-4" />
                    <span>Package: {formData.package_name || "None"}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="hover:bg-[#40c6e524] hover:text-black">
                  Cancel
                </Button>
                <Button onClick={async () => {
                  if (!formData.task_name || !formData.due_date || !formData.tenant_id || !user) return;
                  
                  try {
                    const { data: newTask, error } = await supabase.from('tasks_tenants').insert({
                      tenant_id: parseInt(formData.tenant_id),
                      package_id: formData.package_id ? parseInt(formData.package_id) : null,
                      task_name: formData.task_name,
                      description: formData.description || null,
                      due_date: formData.due_date,
                      created_by: user.id,
                      followers: followers.length > 0 ? followers : [],
                      status: formData.status || 'not_started',
                      completed: false
                    }).select().single();

                    if (error) throw error;

                    // Upload files if any
                    if (uploadedFiles.length > 0 && newTask) {
                      const filePaths: string[] = [];
                      for (const file of uploadedFiles) {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${newTask.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                        const { error: uploadError } = await supabase.storage.from('task-files').upload(fileName, file);
                        if (uploadError) {
                          console.error('File upload error:', uploadError);
                          toast({
                            title: "Warning",
                            description: `Failed to upload ${file.name}`,
                            variant: "destructive"
                          });
                        } else {
                          filePaths.push(fileName);
                        }
                      }

                      // Update task with file paths
                      if (filePaths.length > 0) {
                        const { error: updateError } = await supabase.from('tasks_tenants').update({
                          file_paths: filePaths
                        }).eq('id', newTask.id);
                        if (updateError) {
                          console.error('Error updating file paths:', updateError);
                        }
                      }
                    }

                    toast({
                      title: "Success",
                      description: "Task created successfully"
                    });

                    setIsCreateDialogOpen(false);
                    setFormData({
                      task_name: "",
                      description: "",
                      due_date: "",
                      tenant_id: "",
                      package_id: "",
                      package_name: "",
                      status: "not_started"
                    });
                    setFollowers([]);
                    setUploadedFiles([]);
                    fetchTasks();
                  } catch (error: any) {
                    let errorMessage = error.message;
                    // Handle foreign key constraint error for assigned_to
                    if (error.message?.includes('tasks_tenants_assigned_to_fkey')) {
                      errorMessage = 'The selected assignee is no longer a valid user. Please select a different assignee or leave it unassigned.';
                    }
                    toast({
                      title: "Error",
                      description: errorMessage,
                      variant: "destructive"
                    });
                  }
                }} disabled={!formData.task_name || !formData.due_date || !formData.tenant_id} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                  Save
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>

        {/* Edit Task Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={open => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingTask(null);
            setUploadedFiles([]);
          }
        }}>
          <DialogContent className="max-w-2xl border-[3px] border-[#dfdfdf]">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Task
              </DialogTitle>
              <DialogDescription>
                Update task information below
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[calc(90vh-180px)] overflow-y-auto px-1">
              <div className="grid gap-4 py-4 px-1">
                <div className="grid gap-2">
                  <Label htmlFor="edit_task_name">Name *</Label>
                  <Input id="edit_task_name" value={formData.task_name} onChange={e => setFormData({
                    ...formData,
                    task_name: e.target.value
                  })} required />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit_description">Description</Label>
                  <Textarea id="edit_description" value={formData.description} onChange={e => setFormData({
                    ...formData,
                    description: e.target.value
                  })} rows={4} className="leading-[26px]" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit_due_date">Due Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black", !formData.due_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.due_date ? format(new Date(formData.due_date), "dd/MM/yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 data-[side=bottom]:p-0 data-[side=top]:p-[10px]" align="start">
                        <CalendarPicker mode="single" selected={formData.due_date ? new Date(formData.due_date) : undefined} onSelect={date => setFormData({
                          ...formData,
                          due_date: date ? format(date, "yyyy-MM-dd") : ""
                        })} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit_status">Status</Label>
                    <Combobox 
                      options={[
                        { value: "not_started", label: "Not Started" },
                        { value: "in_progress", label: "In Progress" },
                        { value: "completed", label: "Completed" }
                      ]} 
                      value={editingTask?.status || formData.status || "not_started"} 
                      onValueChange={value => {
                        setFormData({ ...formData, status: value });
                        if (editingTask) {
                          setEditingTask({ ...editingTask, status: value });
                        }
                      }} 
                      placeholder="Select status" 
                      className="w-full" 
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-primary font-semibold">Followers</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {followers.map(userId => {
                      const user = users.find((u: any) => u.user_uuid === userId);
                      if (!user) return null;
                      return (
                        <div key={userId} className="relative group">
                          <Avatar className="h-10 w-10 border-2 border-background shadow-sm cursor-pointer" onClick={() => setFollowers(prev => prev.filter(id => id !== userId))}>
                            {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {user.first_name?.[0]}{user.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <button 
                            onClick={() => setFollowers(prev => prev.filter(id => id !== userId))}
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      );
                    })}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2 z-[80]" align="start">
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {users.filter((user: any) => !followers.includes(user.user_uuid)).map((user: any) => (
                            <div
                              key={user.user_uuid}
                              onClick={() => setFollowers(prev => [...prev, user.user_uuid])}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted transition-colors"
                            >
                              <Avatar className="h-7 w-7">
                                {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                  {user.first_name?.[0]}{user.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{user.first_name} {user.last_name}</span>
                            </div>
                          ))}
                          {users.filter((user: any) => !followers.includes(user.user_uuid)).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">All team members added</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={async () => {
                if (!editingTask) return;
                
                try {
                  const updateData: any = {
                    task_name: formData.task_name,
                    description: formData.description,
                    due_date: formData.due_date,
                    followers: followers,
                    status: formData.status || 'not_started',
                    updated_at: new Date().toISOString()
                  };

                  // If marking as completed, set completed flag
                  if (formData.status === "completed") {
                    updateData.completed = true;
                  } else {
                    updateData.completed = false;
                  }

                  const { error } = await supabase
                    .from('tasks_tenants')
                    .update(updateData)
                    .eq('id', editingTask.id);

                  if (error) throw error;

                  toast({
                    title: "Success",
                    description: "Task updated successfully"
                  });

                  setIsEditDialogOpen(false);
                  fetchTasks();
                } catch (error: any) {
                  toast({
                    title: "Error",
                    description: error.message,
                    variant: "destructive"
                  });
                }
              }} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          onClick={() => {
            setStatusFilter("all");
            setSearchQuery("");
          }}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Tasks</span>
            <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
              <ListTodo className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{tasks.length}</p>
          <p className="text-xs text-muted-foreground">All tasks in system</p>
        </div>

        <div 
          onClick={() => setStatusFilter("completed")}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Completed</span>
            <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{tasks.filter(t => getTaskStatus(t) === "completed").length}</p>
          <p className="text-xs text-muted-foreground">Tasks finished</p>
        </div>

        <div 
          onClick={() => setStatusFilter("overdue")}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Overdue</span>
            <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{tasks.filter(t => getTaskStatus(t) === "overdue").length}</p>
          <p className="text-xs text-muted-foreground">Past due date</p>
        </div>

        <div 
          onClick={() => setStatusFilter("in_progress")}
          className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">In Progress</span>
            <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold mb-1">{tasks.filter(t => {
            const status = getTaskStatus(t);
            return status === "pending" || status === "in_progress";
          }).length}</p>
          <p className="text-xs text-muted-foreground">Awaiting action</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input placeholder="Search tasks by name, client, or package..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50" />
        </div>
      </div>

      {/* Tasks Table */}
      <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Task</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Client</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Package</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                  Status
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">
                  Due Date
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Followers</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50">Files</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTasks.map(task => {
              const taskStatus = getTaskStatus(task);
              const isOverdue = taskStatus === "overdue";
              return <TableRow key={task.id} onClick={() => handleRowClick(task)} className="hover:bg-muted/50 transition-colors border-b border-border/50 cursor-pointer">
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px] whitespace-nowrap">
                      <div className="font-semibold text-foreground pb-[10px] truncate">{task.task_name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <User className="w-3 h-3" />
                        <span>{task.created_by_name || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px] whitespace-nowrap">
                      <div className="font-semibold text-foreground pb-[10px]">{task.tenant_name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <CalendarIcon className="w-3 h-3" />
                        <span>
                          {task.created_at ? new Date(task.created_at).toLocaleDateString("en-GB") : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[200px] whitespace-nowrap">
                      <div>
                        <div className="font-semibold text-foreground pb-[10px]">
                          {task.package_name || "NA"}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <ClipboardList className="w-3 h-3" />
                          <span>{task.package_full_text || "No Package Added"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {getStatusIcon(taskStatus)}
                        {getStatusBadge(taskStatus)}
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <Calendar className={cn("h-4 w-4", isOverdue ? "text-red-600" : "text-muted-foreground")} />
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                          {format(new Date(task.due_date), "dd/MM/yy")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {task.follower_users && task.follower_users.length > 0 ? (
                          task.follower_users.slice(0, 3).map((follower) => (
                            <Avatar key={follower.user_uuid} className="h-9 w-9 border border-background">
                              {follower.avatar_url && <AvatarImage src={follower.avatar_url} />}
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {follower.first_name?.[0]}{follower.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">No followers</span>
                        )}
                        {task.follower_users && task.follower_users.length > 3 && (
                          <span className="text-xs text-muted-foreground ml-1">+{task.follower_users.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {task.file_paths && task.file_paths.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const filePath = task.file_paths![0];
                              const { data, error } = await supabase.storage
                                .from('task-files')
                                .createSignedUrl(filePath, 3600); // 1 hour expiry

                              if (error) throw error;

                              if (data?.signedUrl) {
                                window.open(data.signedUrl, '_blank');
                              }
                            } catch (error) {
                              console.error('Error opening file:', error);
                              toast({
                                title: 'Error',
                                description: 'Failed to open file',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="gap-2 hover:bg-[hsl(191.08deg_88%_53%_/_10%)] hover:text-black"
                        >
                          <FileIcon className="h-4 w-4" />
                          View Files ({task.file_paths.length})
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">No files</span>
                      )}
                    </TableCell>
                    <TableCell className="py-6 px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTask(task);
                            setFormData({
                              task_name: task.task_name,
                              description: task.description || "",
                              due_date: task.due_date,
                              tenant_id: task.tenant_id.toString(),
                              package_id: task.package_id?.toString() || "",
                              package_name: task.package_name || "",
                              status: task.status || "not_started"
                            });
                            setFollowers(task.followers || []);
                            setIsEditDialogOpen(true);
                          }}
                          className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActionChange(task.id, "delete");
                          }}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>;
            })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {filteredTasks.length > 0 && <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredTasks.length)}–
            {Math.min(currentPage * itemsPerPage, filteredTasks.length)} of {filteredTasks.length} results
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
              </PaginationItem>
              {Array.from({
            length: totalPages
          }, (_, i) => i + 1).filter(page => {
            if (totalPages <= 7) return true;
            if (page === 1 || page === totalPages) return true;
            if (page >= currentPage - 1 && page <= currentPage + 1) return true;
            return false;
          }).map((page, idx, arr) => {
            if (idx > 0 && page - arr[idx - 1] > 1) {
              return <PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-2">...</span>
                      </PaginationItem>;
            }
            return <PaginationItem key={page}>
                      <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                        {page}
                      </PaginationLink>
                    </PaginationItem>;
          })}
              <PaginationItem>
                <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>}

      {/* Task Details Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent className="w-[540px] overflow-y-auto p-0">
          {selectedTask && <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <h2 className="text-lg font-semibold mb-3">{selectedTask.task_name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-xs font-medium hover:bg-[hsl(191.08deg_88%_53%_/_10%)] hover:text-black"
                  onClick={() => navigate(`/tenants/${selectedTask.tenant_id}`)}
                >
                  <Building className="h-3.5 w-3.5 mr-1.5" />
                  {selectedTask.tenant_name}
                </Button>
              </div>
              </div>

              {/* Content */}
              <div className="flex-1 px-6 py-5 space-y-5">
                {/* Description */}
                {selectedTask.description && <>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                        <FileIcon className="h-3.5 w-3.5" />
                        Description
                      </label>
                      <div className="p-3 bg-[rgb(135_174_237_/_5%)] rounded-lg border">
                      <div className="text-sm leading-[26px] whitespace-pre-wrap" dangerouslySetInnerHTML={{
                    __html: textToSafeHtml(selectedTask.description)
                  }} />
                      </div>
                    </div>
                    <Separator />
                  </>}

                {/* Status */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Status
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {(() => {
                      const taskStatus = getTaskStatus(selectedTask);
                      const statusConfig = {
                        completed: { 
                          label: "Completed", 
                          className: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20" 
                        },
                        overdue: { 
                          label: "Overdue", 
                          className: "bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20" 
                        },
                        extended: { 
                          label: "Extended", 
                          className: "bg-blue-500/10 text-blue-600 border border-blue-500/20 hover:bg-blue-500/20" 
                        },
                        in_progress: { 
                          label: "In Progress", 
                          className: "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 hover:bg-yellow-500/20" 
                        },
                        pending: { 
                          label: "Not Started", 
                          className: "bg-muted text-muted-foreground border border-border hover:bg-muted/80" 
                        }
                      };
                      const config = statusConfig[taskStatus];
                      return (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className={cn("h-8 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium pointer-events-none", config.className)}
                        >
                          {config.label}
                        </Button>
                      );
                    })()}
                  </div>
                </div>

                <Separator />

                {/* Due Date */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Due date
                  </label>
                  <p className="text-sm leading-relaxed">{format(new Date(selectedTask.due_date), "PPP")}</p>
                </div>

                <Separator />

                {/* Created By */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    Created By
                  </label>
                  <p className="text-sm leading-relaxed">{selectedTask.created_by_name || "Unknown"}</p>
                </div>

                <Separator />

                {/* Followers */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Followers
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {selectedTask.follower_users && selectedTask.follower_users.length > 0 ? (
                      selectedTask.follower_users.map((follower) => (
                        <Avatar key={follower.user_uuid} className="h-8 w-8 border border-background">
                          {follower.avatar_url && <AvatarImage src={follower.avatar_url} />}
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {follower.first_name?.[0]}{follower.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No followers</p>
                    )}
                  </div>
                </div>

                {/* Attachments */}
                {selectedTask.file_paths && selectedTask.file_paths.length > 0 && <>
                    <Separator />
                    <div className="space-y-3">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                        <FileIcon className="h-3.5 w-3.5" />
                        Attachments ({selectedTask.file_paths.length})
                      </label>
                    <div className="space-y-2">
                      {selectedTask.file_paths.map((filePath, index) => {
                  const fileName = filePath.split('/').pop() || `file-${index + 1}`;
                  return <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className="p-1.5 rounded bg-background">
                                <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <span className="text-sm truncate font-medium">{fileName}</span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={async () => {
                      try {
                        const {
                          data,
                          error
                        } = await supabase.storage.from('task-files').download(filePath);
                        if (error) throw error;
                        const url = URL.createObjectURL(data);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({
                          title: "Success",
                          description: "File downloaded successfully"
                        });
                      } catch (error) {
                        console.error('Error downloading file:', error);
                        toast({
                          title: "Error",
                          description: "Failed to download file",
                          variant: "destructive"
                        });
                      }
                    }}>
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>;
                })}
                    </div>
                  </div>
                </>}
              </div>
            </div>}
        </SheetContent>
      </Sheet>
    </div>;
}