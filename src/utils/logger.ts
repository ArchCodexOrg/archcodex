/**
 * @arch archcodex.infra.logging
 *
 * Structured logging infrastructure.
 */
import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Simple structured logger for ArchCodex CLI.
 */
class Logger {
  private level: LogLevel = 'info';
  private prefix: string = '';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    const formatted = this.formatMessage(message);
    console.log(chalk.gray(`[DEBUG] ${formatted}`));
    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const formatted = this.formatMessage(message);
    console.log(chalk.blue(`[INFO] ${formatted}`));
    if (data) {
      console.log(chalk.blue(JSON.stringify(data, null, 2)));
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    const formatted = this.formatMessage(message);
    console.warn(chalk.yellow(`[WARN] ${formatted}`));
    if (data) {
      console.warn(chalk.yellow(JSON.stringify(data, null, 2)));
    }
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const formatted = this.formatMessage(message);
    console.error(chalk.red(`[ERROR] ${formatted}`));
    if (error) {
      if (error instanceof Error) {
        console.error(chalk.red(error.stack || error.message));
      } else {
        console.error(chalk.red(JSON.stringify(error, null, 2)));
      }
    }
  }

  /**
   * Log a success message (always shown unless silent).
   */
  success(message: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green(`✓ ${message}`));
  }

  /**
   * Log a failure message (always shown unless silent).
   */
  fail(message: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.red(`✗ ${message}`));
  }

  /**
   * Create a child logger with a prefix.
   */
  child(prefix: string): Logger {
    const child = new Logger();
    child.level = this.level;
    child.prefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return child;
  }
}

// Singleton instance
export const logger = new Logger();

// Re-export for convenience
export { Logger };
