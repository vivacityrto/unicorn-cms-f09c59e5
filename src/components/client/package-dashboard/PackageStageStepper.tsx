import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ClientPackageStageRow } from "@/hooks/use-client-package-stages";
import { htmlToText } from "@/lib/sanitize";

interface Props {
  stages: ClientPackageStageRow[];
  isLoading: boolean;
  isError: boolean;
}

const SectionHeading = () => (
  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    Your journey
  </h4>
);

export function PackageStageStepper({ stages, isLoading, isError }: Props) {
  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        <SectionHeading />
        <div className="flex items-center gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-6 space-y-3">
        <SectionHeading />
        <Alert variant="destructive">
          <AlertDescription>Couldn't load journey.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="mt-6 space-y-2">
        <SectionHeading />
        <p className="text-sm text-muted-foreground">
          No stages configured for this package yet.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-6 space-y-3">
        <SectionHeading />

        {/* Desktop: horizontal stepper */}
        <div className="hidden md:flex items-start">
          {stages.map((stage, idx) => {
            const isLast = idx === stages.length - 1;
            const next = stages[idx + 1];
            const connectorComplete =
              stage.node_state === "complete" && next?.node_state === "complete";

            return (
              <div key={stage.stage_instance_id} className="flex-1 flex flex-col items-center min-w-0">
                <div className="flex items-center w-full">
                  {/* spacer left half (transparent for first node) */}
                  <div
                    className={`h-0.5 flex-1 ${
                      idx === 0
                        ? "bg-transparent"
                        : stages[idx - 1].node_state === "complete" && stage.node_state === "complete"
                        ? "bg-emerald-500"
                        : "bg-muted"
                    }`}
                  />
                  <StageNode stage={stage} />
                  {/* connector right half */}
                  <div
                    className={`h-0.5 flex-1 ${
                      isLast
                        ? "bg-transparent"
                        : connectorComplete
                        ? "bg-emerald-500"
                        : "bg-muted"
                    }`}
                  />
                </div>
                <span className="text-xs text-muted-foreground mt-2 truncate w-full text-center px-1">
                  {stage.stage_shortname}
                </span>
              </div>
            );
          })}
        </div>

        {/* Mobile: vertical rail */}
        <div className="md:hidden relative pl-8">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-muted" aria-hidden />
          <ul className="space-y-3">
            {stages.map((stage) => (
              <li key={stage.stage_instance_id} className="relative flex items-center gap-3">
                <span className="absolute -left-[1.25rem] flex">
                  <StageNode stage={stage} />
                </span>
                <span className="text-sm text-foreground truncate">{stage.stage_shortname}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TooltipProvider>
  );
}

function StageNode({ stage }: { stage: ClientPackageStageRow }) {
  const base = "h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  let variant = "border border-muted-foreground/30 bg-transparent";
  if (stage.node_state === "complete") variant = "bg-emerald-500 text-white border border-emerald-500";
  else if (stage.node_state === "current") variant = "border-2 border-emerald-500 bg-transparent";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={stage.stage_name}
          className={`${base} ${variant}`}
        >
          {stage.node_state === "complete" ? <Check size={12} strokeWidth={3} /> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs font-medium">{stage.stage_name}</div>
        {stage.stage_description ? (
          <div className="text-xs text-muted-foreground mt-0.5 max-w-[16rem]">
            {htmlToText(stage.stage_description, 220)}
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
