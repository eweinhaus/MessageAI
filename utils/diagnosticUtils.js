// Diagnostic and Logging Utilities
// Centralized logging for better debugging and monitoring

/**
 * Log levels for filtering
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Tagged logging utility
 * Only logs in development mode
 * @param {string} tag - Log tag (e.g., 'LIFECYCLE', 'QUEUE', 'SYNC')
 * @param {string} message - Log message
 * @param {any} extra - Additional data to log
 * @param {string} level - Log level
 */
export function log(tag, message, extra = null, level = LogLevel.INFO) {
  if (!__DEV__) return;

  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `[${timestamp}] [${tag}]`;

  switch (level) {
    case LogLevel.DEBUG:
      console.log(prefix, message, extra || '');
      break;
    case LogLevel.INFO:
      console.log(prefix, message, extra || '');
      break;
    case LogLevel.WARN:
      console.warn(prefix, message, extra || '');
      break;
    case LogLevel.ERROR:
      console.error(prefix, message, extra || '');
      break;
    default:
      console.log(prefix, message, extra || '');
  }
}

/**
 * Lifecycle-specific logger
 */
export const lifecycleLog = (message, extra) => log('LIFECYCLE', message, extra, LogLevel.INFO);

/**
 * Queue-specific logger
 */
export const queueLog = (message, extra) => log('QUEUE', message, extra, LogLevel.INFO);

/**
 * Sync-specific logger
 */
export const syncLog = (message, extra) => log('SYNC', message, extra, LogLevel.INFO);

/**
 * Listener-specific logger
 */
export const listenerLog = (message, extra) => log('LISTENER', message, extra, LogLevel.INFO);

/**
 * Database-specific logger
 */
export const dbLog = (message, extra) => log('DB', message, extra, LogLevel.INFO);

/**
 * Presence-specific logger
 */
export const presenceLog = (message, extra) => log('PRESENCE', message, extra, LogLevel.INFO);

/**
 * Notification-specific logger
 */
export const notificationLog = (message, extra) => log('NOTIFICATION', message, extra, LogLevel.INFO);

/**
 * Performance timing utility
 * Returns a function to end the timer
 * @param {string} tag - Timer tag
 * @param {string} operation - Operation name
 * @returns {Function} Function to call when operation completes
 */
export function startTimer(tag, operation) {
  const startTime = Date.now();
  log(tag, `${operation} started`, null, LogLevel.DEBUG);
  
  return () => {
    const duration = Date.now() - startTime;
    log(tag, `${operation} completed in ${duration}ms`, null, LogLevel.DEBUG);
    return duration;
  };
}

/**
 * Format error for logging
 * @param {Error} error - Error object
 * @returns {Object} Formatted error
 */
export function formatError(error) {
  if (!error) return null;
    
    return {
    message: error.message,
    code: error.code || null,
    stack: __DEV__ ? error.stack : null,
  };
}

/**
 * Safe JSON stringify that handles circular references
 * @param {any} obj - Object to stringify
 * @returns {string} JSON string
 */
export function safeStringify(obj) {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

/**
 * Log app state change
 * @param {string} prevState - Previous state
 * @param {string} nextState - Next state
 */
export function logAppStateChange(prevState, nextState) {
  lifecycleLog(`App state: ${prevState} → ${nextState}`);
}

/**
 * Log network state change
 * @param {Object} networkState - Network state object
 */
export function logNetworkStateChange(networkState) {
  log('NETWORK', `Network state changed`, {
    isOnline: networkState.isOnline,
    type: networkState.type,
  }, LogLevel.INFO);
}

/**
 * Log listener activity
 * @param {string} collection - Firestore collection
 * @param {string} action - Action (subscribe/unsubscribe/update)
 * @param {Object} details - Additional details
 */
export function logListenerActivity(collection, action, details = {}) {
  listenerLog(`${action} ${collection}`, details);
}

/**
 * Measure async operation performance
 * @param {string} tag - Log tag
 * @param {string} operation - Operation name
 * @param {Function} asyncFn - Async function to measure
 * @returns {Promise<any>} Result of async function
 */
export async function measureAsync(tag, operation, asyncFn) {
  const endTimer = startTimer(tag, operation);
  
  try {
    const result = await asyncFn();
    endTimer();
    return result;
  } catch (error) {
    endTimer();
    log(tag, `${operation} failed`, formatError(error), LogLevel.ERROR);
    throw error;
  }
}
