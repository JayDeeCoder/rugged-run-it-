// src/utils/logger.ts
/**
 * Simple logger utility for consistent logging across the application
 * Helps with debugging and can be configured for different environments
 */

export const logger = {
    debug: (message: string, ...args: any[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[DEBUG] ${message}`, ...args);
      }
    },
    
    info: (message: string, ...args: any[]) => {
      console.info(`[INFO] ${message}`, ...args);
    },
    
    warn: (message: string, ...args: any[]) => {
      console.warn(`[WARN] ${message}`, ...args);
    },
    
    error: (message: string, ...args: any[]) => {
      console.error(`[ERROR] ${message}`, ...args);
    }
  };
  
  export default logger;