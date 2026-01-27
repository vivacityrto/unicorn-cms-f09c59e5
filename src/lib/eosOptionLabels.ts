/**
 * EOS Option Labels - Display formatting for enum values
 * 
 * This module provides display-only formatting for enum values.
 * It converts database values to human-readable labels without changing stored values.
 */

/**
 * Format an enum value into a human-readable label.
 * Handles snake_case, PascalCase, and Title Case values.
 * 
 * @example
 * formatEnumLabel('in_review') // 'In Review'
 * formatEnumLabel('needs_attention') // 'Needs Attention'
 * formatEnumLabel('Open') // 'Open'
 * formatEnumLabel('At_Risk') // 'At Risk'
 */
export function formatEnumLabel(value: string): string {
  if (!value) return '';
  
  // Replace underscores with spaces
  let result = value.replace(/_/g, ' ');
  
  // Title case each word
  result = result
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return result;
}

/**
 * Format a quarter number to display label
 * @example formatQuarterLabel(1) // 'Q1'
 */
export function formatQuarterLabel(quarter: number): string {
  return `Q${quarter}`;
}

/**
 * Format a priority number to display label
 * Priority is stored as integer: 1=Low, 2=Medium, 3=High
 */
export function formatPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
  };
  return labels[priority] ?? 'Unknown';
}

/**
 * Get priority value from label
 */
export function getPriorityValue(label: string): number {
  const values: Record<string, number> = {
    'Low': 1,
    'Medium': 2,
    'High': 3,
  };
  return values[label] ?? 2;
}

/**
 * Format item type for display
 * @example formatTypeLabel('risk') // 'Risk'
 */
export function formatTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
