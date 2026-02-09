import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Package, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScopeOption {
  id: string;
  label: string;
}

export interface SelectedScope {
  client_id: string | null;
  client_name: string | null;
  package_id: string | null;
  package_name: string | null;
  phase_id: string | null;
  phase_name: string | null;
}

interface AskVivScopeSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number | null;
  currentScope: SelectedScope;
  onScopeChange: (scope: SelectedScope) => void;
}

/**
 * AskVivScopeSelectorModal - Allows user to change the scope for Ask Viv queries
 */
export function AskVivScopeSelectorModal({
  open,
  onOpenChange,
  tenantId,
  currentScope,
  onScopeChange,
}: AskVivScopeSelectorModalProps) {
  const [clients, setClients] = useState<ScopeOption[]>([]);
  const [packages, setPackages] = useState<ScopeOption[]>([]);
  const [phases, setPhases] = useState<ScopeOption[]>([]);
  
  const [selectedClientId, setSelectedClientId] = useState<string | null>(currentScope.client_id);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(currentScope.package_id);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(currentScope.phase_id);
  
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingPhases, setLoadingPhases] = useState(false);

  // Reset selections when modal opens
  useEffect(() => {
    if (open) {
      setSelectedClientId(currentScope.client_id);
      setSelectedPackageId(currentScope.package_id);
      setSelectedPhaseId(currentScope.phase_id);
    }
  }, [open, currentScope]);

  // Load clients (tenants the user has access to)
  useEffect(() => {
    async function loadClients() {
      if (!tenantId) return;
      
      setLoadingClients(true);
      try {
        // For now, just use the current tenant as the only client option
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("id, name")
          .eq("id", tenantId)
          .single();
        
        if (tenantData) {
          setClients([{ id: tenantData.id.toString(), label: tenantData.name }]);
          if (!selectedClientId) {
            setSelectedClientId(tenantData.id.toString());
          }
        }
      } catch (error) {
        console.error("Error loading clients:", error);
      } finally {
        setLoadingClients(false);
      }
    }
    
    if (open) {
      loadClients();
    }
  }, [open, tenantId]);

  // Load packages when client changes
  useEffect(() => {
    async function loadPackages() {
      if (!tenantId) return;
      
      setLoadingPackages(true);
      setPackages([]);
      setSelectedPackageId(null);
      setPhases([]);
      setSelectedPhaseId(null);
      
      try {
        // First get tenant to find package_ids
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("package_ids")
          .eq("id", tenantId)
          .single();
        
        if (tenantData?.package_ids && tenantData.package_ids.length > 0) {
          const { data: packagesData } = await supabase
            .from("packages")
            .select("id, name")
            .in("id", tenantData.package_ids)
            .order("name");
          
          if (packagesData) {
            setPackages(packagesData.map(p => ({ 
              id: p.id.toString(), 
              label: p.name 
            })));
          }
        }
      } catch (error) {
        console.error("Error loading packages:", error);
      } finally {
        setLoadingPackages(false);
      }
    }
    
    if (open && selectedClientId) {
      loadPackages();
    }
  }, [open, selectedClientId, tenantId]);

  // Load phases when package changes
  useEffect(() => {
    async function loadPhases() {
      if (!tenantId) return;
      
      setLoadingPhases(true);
      setPhases([]);
      setSelectedPhaseId(null);
      
      try {
        // Get tenant to find stage_ids
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("stage_ids")
          .eq("id", tenantId)
          .single();
        
        if (tenantData?.stage_ids && tenantData.stage_ids.length > 0) {
          const { data: stagesData } = await supabase
            .from("documents_stages")
            .select("id, title")
            .in("id", tenantData.stage_ids)
            .order("title");
          
          if (stagesData) {
            setPhases(stagesData.map(s => ({ 
              id: s.id.toString(), 
              label: s.title 
            })));
          }
        }
      } catch (error) {
        console.error("Error loading phases:", error);
      } finally {
        setLoadingPhases(false);
      }
    }
    
    if (open && selectedClientId) {
      loadPhases();
    }
  }, [open, selectedClientId, tenantId]);

  const handleApply = () => {
    const selectedClient = clients.find(c => c.id === selectedClientId);
    const selectedPackage = packages.find(p => p.id === selectedPackageId);
    const selectedPhase = phases.find(p => p.id === selectedPhaseId);
    
    onScopeChange({
      client_id: selectedClientId,
      client_name: selectedClient?.label ?? null,
      package_id: selectedPackageId,
      package_name: selectedPackage?.label ?? null,
      phase_id: selectedPhaseId,
      phase_name: selectedPhase?.label ?? null,
    });
    
    onOpenChange(false);
  };

  const handleClear = () => {
    setSelectedClientId(tenantId?.toString() ?? null);
    setSelectedPackageId(null);
    setSelectedPhaseId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Change Ask Viv Scope
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5" />
              Client
            </Label>
            <Select
              value={selectedClientId ?? "none"}
              onValueChange={(v) => setSelectedClientId(v === "none" ? null : v)}
              disabled={loadingClients}
            >
              <SelectTrigger className={cn(loadingClients && "opacity-50")}>
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingClients && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading clients...
              </div>
            )}
          </div>

          {/* Package selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Package className="h-3.5 w-3.5" />
              Package
            </Label>
            <Select
              value={selectedPackageId ?? "none"}
              onValueChange={(v) => setSelectedPackageId(v === "none" ? null : v)}
              disabled={loadingPackages || packages.length === 0}
            >
              <SelectTrigger className={cn((loadingPackages || packages.length === 0) && "opacity-50")}>
                <SelectValue placeholder={packages.length === 0 ? "No packages available" : "All packages"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All packages</SelectItem>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingPackages && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading packages...
              </div>
            )}
          </div>

          {/* Phase selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Layers className="h-3.5 w-3.5" />
              Phase
            </Label>
            <Select
              value={selectedPhaseId ?? "none"}
              onValueChange={(v) => setSelectedPhaseId(v === "none" ? null : v)}
              disabled={loadingPhases || phases.length === 0}
            >
              <SelectTrigger className={cn((loadingPhases || phases.length === 0) && "opacity-50")}>
                <SelectValue placeholder={phases.length === 0 ? "No phases available" : "All phases"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All phases</SelectItem>
                {phases.map((phase) => (
                  <SelectItem key={phase.id} value={phase.id}>
                    {phase.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingPhases && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading phases...
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleApply}>
            Apply Scope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
