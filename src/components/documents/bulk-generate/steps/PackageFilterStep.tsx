import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "../MultiSelect";

interface Props {
  values: number[];
  onChange: (values: number[]) => void;
}

export function PackageFilterStep({ values, onChange }: Props) {
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["bulk-generate", "packages"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: number; name: string | null }[];
    },
  });

  const options = useMemo(
    () =>
      packages.map((p) => ({
        value: String(p.id),
        label: p.name ?? `Package #${p.id}`,
      })),
    [packages],
  );

  return (
    <div>
      <Label className="text-sm font-medium">Packages (optional)</Label>
      <MultiSelect
        options={options}
        values={values.map(String)}
        onChange={(v) => onChange(v.map(Number))}
        placeholder={
          isLoading ? "Loading packages…" : "Any package (leave empty for all)"
        }
        searchPlaceholder="Search packages…"
        emptyText="No packages."
        disabled={isLoading}
      />
    </div>
  );
}
