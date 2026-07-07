import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "../MultiSelect";
import { useTemplatedDocuments } from "../useTemplatedDocuments";

interface Props {
  stageIds: number[];
  documentIds: number[];
  onChangeStages: (v: number[]) => void;
  onChangeDocuments: (v: number[]) => void;
}

export function StageDocFilterStep({
  stageIds,
  documentIds,
  onChangeStages,
  onChangeDocuments,
}: Props) {
  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["bulk-generate", "stages"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stages")
        .select("id, name, shortname")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: number;
        name: string | null;
        shortname: string | null;
      }[];
    },
  });

  // Document picker: always template-only, narrowed by selected stages when any.
  const { data: documents = [], isLoading: docsLoading } =
    useTemplatedDocuments(stageIds);

  const stageOptions = useMemo(
    () =>
      stages.map((s) => ({
        value: String(s.id),
        label: s.name ?? s.shortname ?? `Stage #${s.id}`,
        description: s.shortname && s.shortname !== s.name ? s.shortname : undefined,
      })),
    [stages],
  );

  const docOptions = useMemo(
    () =>
      documents.map((d) => ({
        value: String(d.id),
        label: d.title,
      })),
    [documents],
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Stages (optional)</Label>
        <MultiSelect
          options={stageOptions}
          values={stageIds.map(String)}
          onChange={(v) => onChangeStages(v.map(Number))}
          placeholder={
            stagesLoading ? "Loading stages…" : "Any stage (leave empty for all)"
          }
          searchPlaceholder="Search stages…"
          emptyText="No stages."
          disabled={stagesLoading}
        />
      </div>
      <div>
        <Label className="text-sm font-medium">Documents (optional)</Label>
        <MultiSelect
          options={docOptions}
          values={documentIds.map(String)}
          onChange={(v) => onChangeDocuments(v.map(Number))}
          placeholder={
            docsLoading
              ? "Loading documents…"
              : "Any templated document (leave empty for all)"
          }
          searchPlaceholder="Search documents…"
          emptyText={
            stageIds.length > 0
              ? "No templated documents for the selected stage(s)."
              : "No templated documents."
          }
          disabled={docsLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Only documents with a configured template are listed
          {stageIds.length > 0 && ", narrowed to the selected stage(s)"}.
        </p>
      </div>
    </div>
  );
}
