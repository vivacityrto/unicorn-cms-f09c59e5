import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, Settings, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface GlobalFlags {
  ai_meeting_summary_enabled: boolean;
  ai_doc_extract_enabled: boolean;
  ai_phase_check_enabled: boolean;
  ai_risk_radar_enabled: boolean;
}

interface TenantOverride {
  id: string;
  tenant_id: number;
  flag_name: string;
  enabled: boolean;
  updated_at: string;
}

interface TenantOption {
  id: number;
  name: string;
}

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  ai_meeting_summary_enabled: {
    label: "Meeting Summary AI",
    description: "Generate AI summaries from meeting transcripts and notes",
  },
  ai_doc_extract_enabled: {
    label: "Document Extraction AI",
    description: "Extract structured data from TAS and Trainer Matrix documents",
  },
  ai_phase_check_enabled: {
    label: "Phase Completeness Check",
    description: "AI-assisted phase completeness evaluation",
  },
  ai_risk_radar_enabled: {
    label: "Risk Radar AI",
    description: "AI-powered risk explanations and suggested actions",
  },
};

const FLAG_NAMES = Object.keys(FLAG_LABELS);

export default function AdminAiFeatureFlags() {
  const { profile } = useAuth();
  const [globalFlags, setGlobalFlags] = useState<GlobalFlags | null>(null);
  const [overrides, setOverrides] = useState<TenantOverride[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = profile?.unicorn_role === "Super Admin" || profile?.global_role === "SuperAdmin";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load global flags
      const { data: settings } = await supabase
        .from("app_settings")
        .select("ai_meeting_summary_enabled, ai_doc_extract_enabled, ai_phase_check_enabled, ai_risk_radar_enabled")
        .limit(1)
        .single();

      if (settings) setGlobalFlags(settings as unknown as GlobalFlags);

      // Load tenants
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      
      if (tenantData) setTenants(tenantData.map((t: any) => ({ id: t.id, name: t.name })));

      // Load overrides
      const { data: overrideData } = await supabase
        .from("ai_feature_overrides" as any)
        .select("*")
        .order("tenant_id");

      if (overrideData) setOverrides(overrideData as unknown as TenantOverride[]);
    } catch (err) {
      console.error("Failed to load data:", err);
      toast.error("Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, loadData]);

  async function toggleGlobalFlag(flagName: string, enabled: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({ [flagName]: enabled } as any)
        .eq("id", 1);

      if (error) throw error;

      setGlobalFlags((prev) => prev ? { ...prev, [flagName]: enabled } : null);

      await supabase.from("audit_events").insert({
        entity: "app_settings",
        entity_id: "1",
        action: `ai_flag.${flagName}.${enabled ? "enabled" : "disabled"}`,
        user_id: profile?.user_uuid,
        details: { flag: flagName, enabled, scope: "global" },
      });

      toast.success(`${FLAG_LABELS[flagName]?.label} ${enabled ? "enabled" : "disabled"} globally`);
    } catch (err) {
      toast.error("Failed to update flag");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTenantOverride(tenantId: number, flagName: string, enabled: boolean) {
    setSaving(true);
    try {
      // Upsert override
      const { data: existing } = await supabase
        .from("ai_feature_overrides" as any)
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("flag_name", flagName)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("ai_feature_overrides" as any)
          .update({ enabled, updated_by: profile?.user_uuid } as any)
          .eq("id", (existing as any).id);
      } else {
        await supabase
          .from("ai_feature_overrides" as any)
          .insert({
            tenant_id: tenantId,
            flag_name: flagName,
            enabled,
            updated_by: profile?.user_uuid,
          } as any);
      }

      await supabase.from("audit_events").insert({
        entity: "ai_feature_overrides",
        entity_id: String(tenantId),
        action: `ai_flag.${flagName}.${enabled ? "enabled" : "disabled"}`,
        user_id: profile?.user_uuid,
        details: { flag: flagName, enabled, scope: "tenant", tenant_id: tenantId },
      });

      await loadData();
      toast.success(`Override ${enabled ? "enabled" : "disabled"} for tenant`);
    } catch (err) {
      toast.error("Failed to update override");
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(overrideId: string) {
    try {
      await supabase
        .from("ai_feature_overrides" as any)
        .delete()
        .eq("id", overrideId);

      await loadData();
      toast.success("Override removed");
    } catch {
      toast.error("Failed to remove override");
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-muted-foreground">SuperAdmin access required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  const selectedTenant = selectedTenantId ? Number(selectedTenantId) : null;
  const tenantOverrides = selectedTenant
    ? overrides.filter((o) => o.tenant_id === selectedTenant)
    : [];

  function getTenantFlagState(flagName: string): boolean | null {
    const override = tenantOverrides.find((o) => o.flag_name === flagName);
    return override ? override.enabled : null;
  }

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Feature Flags</h1>
          <p className="text-sm text-muted-foreground">
            Manage global defaults and per-tenant overrides for Phase 1 AI features
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-muted rounded w-1/3" />
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Global Defaults */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Global Defaults</CardTitle>
              <CardDescription>
                These apply to all tenants unless overridden. Default is <strong>OFF</strong> in production.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {FLAG_NAMES.map((flag) => {
                const meta = FLAG_LABELS[flag];
                const enabled = globalFlags ? (globalFlags as any)[flag] : false;

                return (
                  <div key={flag} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <div className="text-sm font-medium text-foreground">{meta.label}</div>
                      <div className="text-xs text-muted-foreground">{meta.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${enabled ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                        {enabled ? "ON" : "OFF"}
                      </Badge>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => toggleGlobalFlag(flag, v)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Tenant Overrides */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Tenant Overrides</CardTitle>
                  <CardDescription>
                    Enable AI features for specific tenants regardless of global setting
                  </CardDescription>
                </div>
                <Button size="sm" variant="ghost" onClick={loadData}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tenant selector */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tenants..."
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTenants.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))
                    }
                  </SelectContent>
                </Select>
              </div>

              {/* Selected tenant flags */}
              {selectedTenant && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="text-sm font-medium text-foreground">
                    {tenants.find((t) => t.id === selectedTenant)?.name}
                  </div>

                  {FLAG_NAMES.map((flag) => {
                    const meta = FLAG_LABELS[flag];
                    const overrideState = getTenantFlagState(flag);
                    const globalState = globalFlags ? (globalFlags as any)[flag] : false;
                    const effectiveState = overrideState !== null ? overrideState : globalState;
                    const existingOverride = tenantOverrides.find((o) => o.flag_name === flag);

                    return (
                      <div key={flag} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{meta.label}</span>
                          {overrideState !== null && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              Override
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={effectiveState}
                            onCheckedChange={(v) => toggleTenantOverride(selectedTenant, flag, v)}
                            disabled={saving}
                          />
                          {existingOverride && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => removeOverride(existingOverride.id)}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Existing overrides summary */}
              {overrides.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Active overrides ({overrides.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {overrides.map((o) => {
                      const tenantName = tenants.find((t) => t.id === o.tenant_id)?.name || `Tenant ${o.tenant_id}`;
                      const flagLabel = FLAG_LABELS[o.flag_name]?.label || o.flag_name;
                      return (
                        <Badge
                          key={o.id}
                          variant="outline"
                          className={`text-[10px] cursor-pointer ${
                            o.enabled
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }`}
                          onClick={() => setSelectedTenantId(String(o.tenant_id))}
                        >
                          {tenantName}: {flagLabel} = {o.enabled ? "ON" : "OFF"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
