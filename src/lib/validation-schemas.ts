/**
 * Centralised Validation Schemas for Unicorn 2.0
 * 
 * Provides consistent validation patterns using Zod for:
 * - Common data types (email, phone, ABN)
 * - Australian-specific formats
 * - Pagination and date ranges
 * 
 * Usage:
 * ```typescript
 * import { emailSchema, validateEmail, formatABN } from '@/lib/validation-schemas';
 * 
 * // Quick validation
 * if (!validateEmail(input)) {
 *   toast.error('Invalid email');
 * }
 * 
 * // Zod parsing with detailed errors
 * const result = emailSchema.safeParse(input);
 * if (!result.success) {
 *   console.error(result.error.issues);
 * }
 * ```
 */

import { z } from 'zod';

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Email schema with standard format validation.
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .max(254, 'Email is too long');

/**
 * Quick email validation helper.
 */
export function validateEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

// ============================================================================
// Australian Business Number (ABN) Validation
// ============================================================================

/**
 * Validates an Australian Business Number using the official checksum algorithm.
 * @see https://abr.business.gov.au/Help/AbnFormat
 */
function validateABNChecksum(abn: string): boolean {
  // Remove spaces and validate length
  const digits = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return false;

  // ABN checksum weights
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  
  // Subtract 1 from first digit
  const nums = digits.split('').map((d, i) => {
    const n = parseInt(d, 10);
    return i === 0 ? n - 1 : n;
  });

  // Calculate weighted sum
  const sum = nums.reduce((acc, num, i) => acc + num * weights[i], 0);

  // Valid if divisible by 89
  return sum % 89 === 0;
}

/**
 * ABN schema with checksum validation.
 */
export const abnSchema = z
  .string()
  .transform((val) => val.replace(/\s/g, ''))
  .refine((val) => /^\d{11}$/.test(val), {
    message: 'ABN must be exactly 11 digits',
  })
  .refine(validateABNChecksum, {
    message: 'Invalid ABN checksum',
  });

/**
 * Quick ABN validation helper.
 */
export function validateABN(abn: string): boolean {
  return abnSchema.safeParse(abn).success;
}

/**
 * Format an ABN with standard spacing (XX XXX XXX XXX).
 */
export function formatABN(abn: string): string {
  const digits = abn.replace(/\s/g, '');
  if (digits.length !== 11) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

// ============================================================================
// Australian Phone Number Validation
// ============================================================================

/**
 * Australian phone number patterns:
 * - Mobile: 04XX XXX XXX
 * - Landline: (0X) XXXX XXXX
 * - International: +61 X XXXX XXXX
 */
const PHONE_PATTERNS = {
  mobile: /^04\d{8}$/,
  landline: /^0[2-9]\d{8}$/,
  international: /^\+61\d{9}$/,
};

/**
 * Phone schema supporting Australian formats.
 */
export const phoneSchema = z
  .string()
  .transform((val) => val.replace(/[\s\-()]/g, ''))
  .refine(
    (val) =>
      PHONE_PATTERNS.mobile.test(val) ||
      PHONE_PATTERNS.landline.test(val) ||
      PHONE_PATTERNS.international.test(val),
    {
      message: 'Invalid Australian phone number',
    }
  );

/**
 * Quick phone validation helper.
 */
export function validatePhone(phone: string): boolean {
  return phoneSchema.safeParse(phone).success;
}

/**
 * Normalise a phone number to E.164 format (+61...).
 */
export function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  
  // Already international
  if (cleaned.startsWith('+61')) {
    return cleaned;
  }
  
  // Remove leading 0 and add +61
  if (cleaned.startsWith('0')) {
    return '+61' + cleaned.slice(1);
  }
  
  return cleaned;
}

/**
 * Format a phone number for display.
 */
export function formatPhone(phone: string): string {
  const normalised = normalisePhone(phone);
  const digits = normalised.replace(/^\+61/, '');
  
  // Mobile: 0XXX XXX XXX
  if (digits.startsWith('4')) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  
  // Landline: (0X) XXXX XXXX
  return `(0${digits.slice(0, 1)}) ${digits.slice(1, 5)} ${digits.slice(5)}`;
}

// ============================================================================
// UUID Validation
// ============================================================================

/**
 * UUID v4 schema.
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Quick UUID validation helper.
 */
export function validateUUID(uuid: string): boolean {
  return uuidSchema.safeParse(uuid).success;
}

// ============================================================================
// RTO Code Validation
// ============================================================================

/**
 * RTO code schema (typically 4-5 digit number assigned by ASQA).
 */
export const rtoCodeSchema = z
  .string()
  .regex(/^\d{4,5}$/, 'RTO code must be 4-5 digits');

/**
 * Quick RTO code validation helper.
 */
export function validateRTOCode(code: string): boolean {
  return rtoCodeSchema.safeParse(code).success;
}

// ============================================================================
// Date Range Validation
// ============================================================================

/**
 * Date range schema with start/end validation.
 */
export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  });

/**
 * Quick date range validation helper.
 */
export function validateDateRange(startDate: Date, endDate: Date): boolean {
  return dateRangeSchema.safeParse({ startDate, endDate }).success;
}

// ============================================================================
// Pagination Validation
// ============================================================================

/**
 * Pagination schema with sensible defaults.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Parse pagination parameters with defaults.
 */
export function parsePagination(params: Partial<PaginationParams>): PaginationParams {
  return paginationSchema.parse(params);
}

// ============================================================================
// Common Form Schemas
// ============================================================================

/**
 * Name field schema (first name, last name, etc.).
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .regex(/^[a-zA-Z\s\-']+$/, 'Name contains invalid characters');

/**
 * URL schema.
 */
export const urlSchema = z.string().url('Invalid URL format');

/**
 * Positive integer schema.
 */
export const positiveIntSchema = z.coerce.number().int().positive();

/**
 * Non-negative number schema (for hours, amounts, etc.).
 */
export const nonNegativeSchema = z.coerce.number().min(0);

// ============================================================================
// Compliance-Specific Schemas
// ============================================================================

/**
 * CRICOS provider code (5 digits + letter, e.g., "01234A").
 */
export const cricosCodeSchema = z
  .string()
  .regex(/^\d{5}[A-Z]$/, 'CRICOS code must be 5 digits followed by a letter');

/**
 * Qualification code (e.g., "BSB50420").
 */
export const qualificationCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,4}\d{5}$/, 'Invalid qualification code format');

/**
 * Unit code (e.g., "BSBWHS411").
 */
export const unitCodeSchema = z
  .string()
  .regex(/^[A-Z]{3,7}\d{3,4}$/, 'Invalid unit code format');
