import { format, isValid, parseISO } from "date-fns";

/** Formats an `academy_courses.delivery_date` value as "d MMMM yyyy", or null if missing/invalid. */
export function formatDeliveryDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  try {
    const raw = dateString.includes("T") ? dateString : `${dateString}T00:00:00`;
    const date = parseISO(raw);
    if (!isValid(date)) return null;
    return format(date, "d MMMM yyyy");
  } catch {
    return null;
  }
}
