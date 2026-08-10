import { useQuery } from "@tanstack/react-query";
import { fetchWorkforcePdp, type WorkforcePdpRow } from "./workforce";

export function useWorkforcePdp(tenantId?: number | null) {
  return useQuery<WorkforcePdpRow[]>({
    queryKey: ["pdp", "workforce", tenantId ?? null],
    queryFn: () => fetchWorkforcePdp(tenantId),
    staleTime: 60_000,
    enabled: tenantId === undefined || tenantId != null,
  });
}
