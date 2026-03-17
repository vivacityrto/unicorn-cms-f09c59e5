import type { LifecycleTemplate } from "@/hooks/useLifecycleChecklists";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ExternalLink, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  groupedTemplates: [string, LifecycleTemplate[]][];
  categoryLabels: Record<string, string>;
  roleLabels: Record<string, string>;
  loading: boolean;
  onEdit: (t: LifecycleTemplate) => void;
  onDelete: (t: LifecycleTemplate) => void;
}

export function LifecycleTemplateGrid({
  groupedTemplates,
  categoryLabels,
  roleLabels,
  loading,
  onEdit,
  onDelete,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (groupedTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No checklist steps configured for this lifecycle type yet.</p>
        <p className="text-xs mt-1">Click "Add Step" to create the first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {groupedTemplates.map(([category, steps]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {categoryLabels[category] || category}
              <Badge variant="secondary" className="ml-2 text-xs">
                {steps.length} step{steps.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground font-mono w-6 text-right shrink-0">
                      {step.sort_order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{step.step_title}</span>
                        {step.is_default && (
                          <Star className="h-3 w-3 text-primary fill-primary shrink-0" />
                        )}
                        {!step.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {step.responsible_role && (
                      <Badge variant="outline" className="text-xs">
                        {roleLabels[step.responsible_role] || step.responsible_role}
                      </Badge>
                    )}
                    {step.external_link && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => window.open(step.external_link!, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(step)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(step)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
