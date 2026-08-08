export const ACADEMY_PATHWAYS = [
  { value: "trainer", label: "Trainer Hub", icon: "Users" },
  { value: "compliance_manager", label: "Compliance Manager", icon: "ShieldCheck" },
  { value: "governance_person", label: "Governance Person", icon: "Building2" },
  { value: "student_support_officer", label: "Student Support Officer", icon: "HeartHandshake" },
  { value: "administration_assistant", label: "Administration Assistant", icon: "ClipboardList" },
] as const;

export type PathwayValue = (typeof ACADEMY_PATHWAYS)[number]["value"];

const labelByValue: Record<string, string> = Object.fromEntries(
  ACADEMY_PATHWAYS.map((p) => [p.value, p.label])
);

export function pathwayLabel(value: string): string {
  return labelByValue[value] ?? value;
}

export function pathwayLabels(values: string[] | null | undefined): string[] {
  return (values ?? []).map(pathwayLabel);
}

/** Display labels for academy_courses.target_audience tags (broader than Pathways). */
export const TARGET_AUDIENCE_LABELS: Record<string, string> = {
  ceo: "CEO",
  compliance_manager: "Compliance Manager",
  trainer: "Trainer",
  administrator: "Administrator",
  governing_person: "Governing Person",
  marketing_person: "Marketing Person",
  student_support_officer: "Student Support Officer",
  administration_assistant: "Administration Assistant",
  rto_manager: "RTO Manager",
  assessor: "Assessor",
  quality_manager: "Quality Manager",
  resource_developer: "Resource Developer",
  operations_manager: "Operations Manager",
  training_manager: "Training Manager",
  rto_owner: "RTO Owner",
  senior_leader: "Senior Leader",
};

function titleCaseAudienceTag(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatTargetAudienceLabel(value: string): string {
  return TARGET_AUDIENCE_LABELS[value] ?? titleCaseAudienceTag(value);
}
