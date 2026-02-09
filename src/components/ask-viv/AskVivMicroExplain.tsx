import { Info, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Reason codes for micro-explain
 */
export type MicroExplainReason =
  | "decision_request"
  | "out_of_scope"
  | "safety_fallback";

/**
 * Micro-explain payload from the backend
 */
export interface MicroExplainPayload {
  reason: MicroExplainReason;
  message: string;
  usage_rules_link: string;
}

interface AskVivMicroExplainProps {
  payload: MicroExplainPayload;
  className?: string;
}

/**
 * Internal Ask Viv Usage Rules content
 */
const USAGE_RULES_CONTENT = `
## Ask Viv Usage Rules

Ask Viv is an internal diagnostic tool for Vivacity Team members. It provides status visibility and gap analysis only.

### What Ask Viv CAN do
- Report current status of clients, packages, and phases
- Identify blockers, missing evidence, and overdue tasks
- Explain internal procedures and policies
- Summarise compliance gaps

### What Ask Viv CANNOT do
- Approve submissions or sign-offs
- Confirm regulatory compliance
- Make decisions about phase progression
- Provide advice to clients or regulators
- Guarantee audit outcomes

### Why are some requests blocked?
- **Decision requests**: Questions that imply approval, submission readiness, or compliance confirmation require human judgement.
- **Out of scope**: Personal questions, policy bypass attempts, or client-facing communications are outside Ask Viv's purpose.
- **Safety fallback**: Some responses cannot be returned safely within compliance controls and are replaced with a safe alternative.

### Safe alternatives
When a request is blocked, try rephrasing to focus on:
- "What gaps exist for this phase?"
- "List missing evidence types"
- "Summarise overdue mandatory tasks"
- "What is blocking this phase?"

### Escalation
For decisions or approvals, escalate to:
- CSC Lead (for compliance sign-off)
- Function Lead (for procedural interpretation)
`;

/**
 * AskVivMicroExplain - Inline explanation when Ask Viv blocks a response
 * 
 * Shows a short, plain-English explanation with a link to usage rules.
 * Non-dismissable, does not block user from re-asking.
 */
export function AskVivMicroExplain({
  payload,
  className,
}: AskVivMicroExplainProps) {
  const [rulesOpen, setRulesOpen] = useState(false);

  // Split message into title and explanation
  const lines = payload.message.split("\n").filter(Boolean);
  const title = lines[0] || "Why can't Ask Viv answer this?";
  const explanation = lines.slice(1).join(" ");

  return (
    <>
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/50 px-3 py-2.5",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {explanation && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {explanation}
              </p>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 mt-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setRulesOpen(true)}
            >
              View Ask Viv usage rules
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Usage Rules Modal */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ask Viv Usage Rules</DialogTitle>
            <DialogDescription>
              Internal guidelines for using the Ask Viv assistant
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert">
            {USAGE_RULES_CONTENT.split("\n").map((line, idx) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={idx} className="text-lg font-semibold mt-4 mb-2">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("### ")) {
                return (
                  <h3 key={idx} className="text-base font-medium mt-3 mb-1">
                    {line.replace("### ", "")}
                  </h3>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <li key={idx} className="ml-4 text-sm text-muted-foreground">
                    {line.replace("- ", "").replace(/\*\*(.*?)\*\*/g, "$1")}
                  </li>
                );
              }
              if (line.trim()) {
                return (
                  <p key={idx} className="text-sm text-muted-foreground">
                    {line}
                  </p>
                );
              }
              return null;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
