/**
 * Centralised Logging Utility for Unicorn 2.0
 * 
 * Provides structured logging with:
 * - Log levels (debug, info, warn, error)
 * - Context prefixing for component/module identification
 * - Production mode filtering (no debug logs in prod)
 * - Optional audit integration for critical errors
 * 
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/logger';
 * 
 * // Basic usage
 * logger.info('User logged in', { userId: '123' });
 * 
 * // With context
 * const log = logger.withContext('AuthService');
 * log.debug('Checking token validity');
 * log.error('Token expired', { tokenId: 'abc' });
 * ```
 */

import { supabase } from '@/integrations/supabase/client';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface LoggerOptions {
  context?: string;
  enableAudit?: boolean;
}

const isDev = import.meta.env.DEV;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only show warn and error
const MIN_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function formatMessage(entry: LogEntry): string {
  const prefix = entry.context ? `[${entry.context}]` : '';
  const timestamp = isDev ? `[${entry.timestamp}]` : '';
  return `${timestamp}${prefix} ${entry.message}`.trim();
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  try {
    return JSON.stringify(data, null, isDev ? 2 : 0);
  } catch {
    return '[Unserializable data]';
  }
}

async function logToAudit(entry: LogEntry): Promise<void> {
  // Only log errors to audit in production
  if (isDev || entry.level !== 'error') return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('audit_events') as any).insert({
      entity: 'client_error',
      action: entry.context || 'unknown',
      entity_id: crypto.randomUUID(),
      user_id: user?.id || null,
      details: {
        message: entry.message,
        data: entry.data,
        timestamp: entry.timestamp,
        url: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
    });
  } catch {
    // Silently fail - we don't want logging to break the app
  }
}

function createLogFunction(level: LogLevel, options: LoggerOptions = {}) {
  return (message: string, data?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      context: options.context,
      data,
      timestamp: new Date().toISOString(),
    };

    const formattedMessage = formatMessage(entry);
    const formattedData = formatData(data);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, formattedData || '');
        break;
      case 'info':
        console.info(formattedMessage, formattedData || '');
        break;
      case 'warn':
        console.warn(formattedMessage, formattedData || '');
        break;
      case 'error':
        console.error(formattedMessage, formattedData || '');
        if (options.enableAudit !== false) {
          logToAudit(entry);
        }
        break;
    }
  };
}

interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  withContext: (context: string, options?: Omit<LoggerOptions, 'context'>) => Logger;
}

function createLogger(options: LoggerOptions = {}): Logger {
  return {
    debug: createLogFunction('debug', options),
    info: createLogFunction('info', options),
    warn: createLogFunction('warn', options),
    error: createLogFunction('error', options),
    withContext: (context: string, additionalOptions?: Omit<LoggerOptions, 'context'>) =>
      createLogger({ ...options, ...additionalOptions, context }),
  };
}

/**
 * Default logger instance.
 * Use `logger.withContext('ComponentName')` for component-specific logging.
 */
export const logger = createLogger();

/**
 * Create a logger with audit logging disabled.
 * Useful for high-frequency logging where audit overhead is undesirable.
 */
export const silentLogger = createLogger({ enableAudit: false });

export type { Logger, LogLevel, LogEntry, LoggerOptions };
