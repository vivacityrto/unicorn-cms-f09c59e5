import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MultiSelect } from "../MultiSelect";
import { useTenantSharepointStatus } from "../useTenantSharepointStatus";
import { cn } from "@/lib/utils";

type Tenant = { id: number; name: string | null; rto_name: string | null };

export type ScopeValue = {
  scope: "all" | "selected";
  tenant_ids: number[];
};

interface Props {
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
}

export function ScopeStep({ value, onChange }: Props) {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["bulk-generate", "active-tenants"],
    staleTime: 60_000,
    queryFn: async (): Promise<Tenant[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, rto_name, status, is_system_tenant")
        .eq("status", "active")
        .eq("is_system_tenant", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Tenant[]).filter(
        (t) => !/^test/i.test(t.name ?? ""),
      );
    },
  });

  const spStatus = useTenantSharepointStatus(tenants.map((t) => t.id));
  const spMap = spStatus.data;

  const options = useMemo(
    () =>
      tenants.map((t) => {
        const s = spMap?.get(t.id);
        return {
          value: String(t.id),
          label: t.name ?? t.rto_name ?? `Tenant #${t.id}`,
          description: t.rto_name && t.rto_name !== t.name ? t.rto_name : undefined,
          right: s ? (
            <TooltipProvider>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 border",
                        s.has_shared
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-amber-50 text-amber-800 border-amber-300",
                      )}
                    >
                      Shared
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {s.has_shared
                      ? "Shared folder provisioned"
                      : "Will be auto-provisioned during the run"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 border",
                        s.has_governance
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-amber-50 text-amber-800 border-amber-300",
                      )}
                    >
                      Gov
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {s.has_governance
                      ? "Governance folder provisioned"
                      : "Will be auto-provisioned during the run"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : null,
        };
      }),
    [tenants, spMap],
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Scope</Label>
        <RadioGroup
          value={value.scope}
          onValueChange={(v) =>
            onChange({
              scope: v as "all" | "selected",
              tenant_ids: v === "all" ? [] : value.tenant_ids,
            })
          }
          className="mt-2 space-y-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="scope-all" />
            <Label htmlFor="scope-all" className="font-normal cursor-pointer">
              All active clients
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="selected" id="scope-selected" />
            <Label
              htmlFor="scope-selected"
              className="font-normal cursor-pointer"
            >
              Select clients
            </Label>
          </div>
        </RadioGroup>
      </div>

      {value.scope === "selected" && (
        <div>
          <Label className="text-sm font-medium">Clients</Label>
          <MultiSelect
            options={options}
            values={value.tenant_ids.map(String)}
            onChange={(ids) =>
              onChange({
                scope: "selected",
                tenant_ids: ids.map((s) => Number(s)),
              })
            }
            placeholder={
              isLoading ? "Loading clients…" : "Select one or more clients…"
            }
            searchPlaceholder="Search clients…"
            emptyText="No active clients."
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Chips show SharePoint provisioning. Amber = will be
            auto-provisioned during the run.
          </p>
        </div>
      )}
    </div>
  );
}
