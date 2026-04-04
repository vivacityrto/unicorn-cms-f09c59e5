import { cn } from "@/lib/utils";

interface AcademyStatusBadgeProps {
  status: "draft" | "published" | "archived";
}

const config: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-600", label: "Draft" },
  published: { bg: "bg-green-100", text: "text-green-700", label: "Published" },
  archived: { bg: "bg-red-100", text: "text-red-500", label: "Archived" },
};

export default function AcademyStatusBadge({ status }: AcademyStatusBadgeProps) {
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", c.bg, c.text)}>
      {c.label}
    </span>
  );
}
