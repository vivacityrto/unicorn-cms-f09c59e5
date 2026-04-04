const audienceMap: Record<string, { label: string; color: string; bg: string }> = {
  trainer: { label: "Trainer", color: "#23c0dd", bg: "rgba(35,192,221,0.12)" },
  compliance_manager: { label: "Compliance Manager", color: "#ed1878", bg: "rgba(237,24,120,0.12)" },
  governance_person: { label: "Governance Person", color: "#7130A0", bg: "rgba(113,48,160,0.12)" },
};

interface AudienceTagsProps {
  targetAudience: string;
}

export default function AudienceTags({ targetAudience }: AudienceTagsProps) {
  const keys = targetAudience.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => {
        const cfg = audienceMap[key];
        if (!cfg) return null;
        return (
          <span
            key={key}
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: cfg.bg, color: cfg.color }}
          >
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}
