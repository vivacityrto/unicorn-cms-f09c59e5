import { subDays, differenceInDays, format, parseISO, isValid } from "date-fns";

export type ReRegistrationUrgency = "red" | "amber" | "green";

/**
 * Compute the re-registration due date (90 days before registration end date).
 */
export function getReRegistrationDueDate(registrationEndDate: string | null | undefined): Date | null {
  if (!registrationEndDate) return null;
  const end = parseISO(registrationEndDate);
  if (!isValid(end)) return null;
  return subDays(end, 90);
}

/**
 * Determine urgency based on days until the re-registration due date.
 * - Red: < 30 days (or overdue)
 * - Amber: 30–90 days
 * - Green: > 90 days
 */
export function getReRegistrationUrgency(dueDate: Date): ReRegistrationUrgency {
  const daysRemaining = differenceInDays(dueDate, new Date());
  if (daysRemaining < 30) return "red";
  if (daysRemaining <= 90) return "amber";
  return "green";
}

/**
 * Format the due date as "DDD DD-MMM-YYYY", e.g. "Tue 15-Jul-2026".
 */
export function formatReRegistrationLabel(dueDate: Date): string {
  return format(dueDate, "EEE dd-MMM-yyyy");
}
