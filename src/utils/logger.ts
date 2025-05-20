// src/utils/logger.ts
/**
 * Simple logger utility
 * Extends console with formatted timestamps and log levels
 * In production, this could be replaced with a more robust logging solution
 */
class Logger {
  private isProduction: boolean;
  
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }
  
  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }
  
  /**
   * Log an informational message
   */
  info(message: string, ...args: any[]): void {
    console.log(this.formatMessage('info', message), ...args);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('warn', message), ...args);
  }
  
  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message), ...args);
  }
  
  /**
   * Log a debug message (suppressed in production)
   */
  debug(message: string, ...args: any[]): void {
    if (!this.isProduction) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }
  
  /**
   * Log a trace message (suppressed in production)
   */
  trace(message: string, ...args: any[]): void {
    if (!this.isProduction) {
      console.trace(this.formatMessage('trace', message), ...args);
    }
  }
}

const logger = new Logger();
export default logger;