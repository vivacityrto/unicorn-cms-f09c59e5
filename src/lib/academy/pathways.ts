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
