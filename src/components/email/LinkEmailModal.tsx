import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Paperclip, Calendar, User, Building2, Package2, ListTodo, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useLinkedEmails } from "@/hooks/useLinkedEmails";
import { createClient } from "@supabase/supabase-js";

// Create an untyped client to avoid deep type instantiation issues
const supabaseUrl = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY";
const untypedClient = createClient(supabaseUrl, supabaseKey);

interface EmailToLink {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  hasAttachments: boolean;
}

interface LinkEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailToLink | null;
  defaultClientId?: number;
  defaultPackageId?: number;
  defaultTaskId?: string;
  tenantId: string;
  onSuccess?: () => void;
}

interface SelectOption {
  id: string;
  label: string;
}

export function LinkEmailModal({
  open,
  onOpenChange,
  email,
  defaultClientId,
  defaultPackageId,
  defaultTaskId,
  tenantId,
  onSuccess,
}: LinkEmailModalProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [packages, setPackages] = useState<SelectOption[]>([]);
  const [tasks, setTasks] = useState<SelectOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const { linkEmail, isLinking } = useLinkedEmails();

  // Fetch clients when modal opens
  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await untypedClient
        .from("tenants")
        .select("id, name")
        .eq("type", "client")
        .order("name");

      if (error) throw error;
      
      const options: SelectOption[] = (data || []).map((row: { id: number; name: string }) => ({
        id: String(row.id),
        label: row.name || "Unnamed Client",
      }));
      setClients(options);
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  // Fetch packages when client changes
  const fetchPackages = useCallback(async (clientId: string) => {
    if (!clientId) {
      setPackages([]);
      return;
    }
    
    setLoadingPackages(true);
    try {
      const { data, error } = await untypedClient
        .from("packages")
        .select("id, name")
        .eq("tenant_id", parseInt(clientId))
        .order("name");

      if (error) throw error;
      
      const options: SelectOption[] = (data || []).map((row: { id: number; name: string }) => ({
        id: String(row.id),
        label: row.name || "Unnamed Package",
      }));
      setPackages(options);
    } catch (err) {
      console.error("Error fetching packages:", err);
    } finally {
      setLoadingPackages(false);
    }
  }, []);

  // Fetch tasks when client changes
  const fetchTasks = useCallback(async (clientId: string) => {
    if (!clientId) {
      setTasks([]);
      return;
    }
    
    setLoadingTasks(true);
    try {
      const { data, error } = await untypedClient
        .from("tasks")
        .select("id, task_name")
        .eq("tenant_id", parseInt(clientId))
        .eq("status", "open")
        .order("date_created_ms", { ascending: false })
        .limit(50);

      if (error) throw error;
      
      const options: SelectOption[] = (data || []).map((row: { id: string; task_name: string }) => ({
        id: String(row.id),
        label: row.task_name || "Unnamed Task",
      }));
      setTasks(options);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  // Reset form and fetch clients when modal opens
  useEffect(() => {
    if (open) {
      setSelectedClientId(defaultClientId?.toString() || "");
      setSelectedPackageId(defaultPackageId?.toString() || "");
      setSelectedTaskId(defaultTaskId || "");
      fetchClients();
    }
  }, [open, defaultClientId, defaultPackageId, defaultTaskId, fetchClients]);

  // Fetch packages and tasks when client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchPackages(selectedClientId);
      fetchTasks(selectedClientId);
    } else {
      setPackages([]);
      setTasks([]);
    }
  }, [selectedClientId, fetchPackages, fetchTasks]);

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
    setSelectedPackageId("");
    setSelectedTaskId("");
  };

  const handleLink = () => {
    if (!email || !selectedClientId) return;

    linkEmail(
      {
        message_id: email.id,
        tenant_id: tenantId,
        client_id: selectedClientId || undefined,
        package_id: selectedPackageId || undefined,
        task_id: selectedTaskId || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Link Email to Unicorn
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email preview */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="font-medium line-clamp-2">{email.subject}</div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span>{email.from?.emailAddress?.name || email.from?.emailAddress?.address}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{format(new Date(email.receivedDateTime), "MMM d, yyyy h:mm a")}</span>
              </div>
              {email.hasAttachments && (
                <div className="flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Attachments</span>
                </div>
              )}
            </div>
          </div>

          {/* Client selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Client <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedClientId} onValueChange={handleClientChange}>
              <SelectTrigger>
                {loadingClients ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SelectValue placeholder="Select a client" />
                )}
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Package selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package2 className="h-4 w-4" />
              Package <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select
              value={selectedPackageId}
              onValueChange={setSelectedPackageId}
              disabled={!selectedClientId}
            >
              <SelectTrigger>
                {loadingPackages ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SelectValue placeholder="Select a package" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Task <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select
              value={selectedTaskId}
              onValueChange={setSelectedTaskId}
              disabled={!selectedClientId}
            >
              <SelectTrigger>
                {loadingTasks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SelectValue placeholder="Select a task" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={isLinking || !selectedClientId}>
            {isLinking ? "Linking..." : "Link Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
