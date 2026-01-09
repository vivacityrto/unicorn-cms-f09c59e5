import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to DD/MM/YYYY format (Australian standard)
 * @param dateString - ISO date string, Date object, or null/undefined
 * @param fallback - Value to return if date is invalid (default: "—")
 * @returns Formatted date string or fallback
 */
export function formatDate(dateString: string | Date | null | undefined, fallback = "—"): string {
  if (!dateString) return fallback;
  
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
    if (!isValid(date)) return fallback;
    return format(date, "dd/MM/yyyy");
  } catch {
    return fallback;
  }
}

/**
 * Format a date string to DD/MM/YYYY HH:mm format (Australian standard with time)
 * @param dateString - ISO date string, Date object, or null/undefined
 * @param fallback - Value to return if date is invalid (default: "—")
 * @returns Formatted datetime string or fallback
 */
export function formatDateTime(dateString: string | Date | null | undefined, fallback = "—"): string {
  if (!dateString) return fallback;
  
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
    if (!isValid(date)) return fallback;
    return format(date, "dd/MM/yyyy HH:mm");
  } catch {
    return fallback;
  }
}

/**
 * Format a date string to DD MMM YYYY format (e.g., 12 May 2023)
 * @param dateString - ISO date string, Date object, or null/undefined
 * @param fallback - Value to return if date is invalid (default: "—")
 * @returns Formatted date string or fallback
 */
export function formatDateLong(dateString: string | Date | null | undefined, fallback = "—"): string {
  if (!dateString) return fallback;
  
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
    if (!isValid(date)) return fallback;
    return format(date, "dd MMM yyyy");
  } catch {
    return fallback;
  }
}
