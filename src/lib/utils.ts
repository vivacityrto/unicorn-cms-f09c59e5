import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Tests whether `text` contains every whitespace/dash-separated word from
 * `query`, in order, with a wildcard between them — so a query of "policy
 * name" (or "policy-name") matches text like "Policy-Name-V2" or
 * "Policy Name Draft" regardless of which separator (or extra text) sits
 * between the words. Used for document/file name search where titles are
 * space-cased but file names are dash-cased, or vice versa.
 */
export function matchesWordWildcard(query: string, text: string | null | undefined): boolean {
  const words = query.trim().split(/[\s-]+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return true;
  return new RegExp(words.join('.*'), 'i').test(text || '');
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

/**
 * Format a date string to DD MMM YYYY HH:mm format (e.g., 12 May 2023 15:48)
 * @param dateString - ISO date string, Date object, or null/undefined
 * @param fallback - Value to return if date is invalid (default: "—")
 * @returns Formatted datetime string or fallback
 */
export function formatDateTimeLong(dateString: string | Date | null | undefined, fallback = "—"): string {
  if (!dateString) return fallback;

  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
    if (!isValid(date)) return fallback;
    return format(date, "dd MMM yyyy HH:mm");
  } catch {
    return fallback;
  }
}
