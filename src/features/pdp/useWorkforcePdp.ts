import { useQuery } from "@tanstack/react-query";
import { fetchWorkforcePdp, type WorkforcePdpRow } from "./workforce";

export function useWorkforcePdp() {
  return useQuery<WorkforcePdpRow[]>({
    queryKey: ["pdp", "workforce"],
    queryFn: () => fetchWorkforcePdp(),
    staleTime: 60_000,
  });
}
