import type { BadgeProps } from "@/components/ui/badge";

/**
 * Maps tenant_conversations.topic → display badge in the Team Communications UI.
 *
 * general + bot_escalation → "General" (outline)
 * support + document_request → "Topic" (info / aqua)
 * csc → "Direct" (default / primary purple)
 *
 * Anything unknown falls back to General/outline.
 */
export function topicToBadge(topic: string | null | undefined): {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
} {
  switch (topic) {
    case "csc":
      return { label: "Direct", variant: "default" };
    case "support":
    case "document_request":
      return { label: "Topic", variant: "info" };
    case "general":
    case "bot_escalation":
    default:
      return { label: "General", variant: "outline" };
  }
}
