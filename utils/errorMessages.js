// Error Messages - User-friendly error message mapping
// Maps Firebase and system error codes to friendly messages

/**
 * Firebase Authentication error codes
 */
const AUTH_ERRORS = {
  // Email/Password errors
  'auth/invalid-email': 'Invalid email address',
  'auth/user-disabled': 'This account has been disabled',
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/email-already-in-use': 'Email already in use',
  'auth/weak-password': 'Password must be at least 8 characters',
  'auth/operation-not-allowed': 'This sign-in method is not enabled',
  'auth/invalid-credential': 'Invalid email or password',
  'auth/account-exists-with-different-credential': 'Account exists with different sign-in method',
  
  // Network errors
  'auth/network-request-failed': 'Network error. Check your connection and try again',
  'auth/too-many-requests': 'Too many attempts. Please try again later',
  'auth/timeout': 'Request timed out. Please try again',
  
  // Token errors
  'auth/invalid-custom-token': 'Invalid authentication token',
  'auth/custom-token-mismatch': 'Authentication token is invalid',
  'auth/expired-action-code': 'This link has expired',
  'auth/invalid-action-code': 'Invalid or expired link',
  
  // Other
  'auth/popup-blocked': 'Pop-up was blocked by your browser',
  'auth/popup-closed-by-user': 'Sign-in window was closed',
  'auth/unauthorized-domain': 'This domain is not authorized',
  'auth/requires-recent-login': 'Please sign in again to continue',
};

/**
 * Firestore error codes
 */
const FIRESTORE_ERRORS = {
  'permission-denied': 'You do not have permission to access this data',
  'not-found': 'The requested data was not found',
  'already-exists': 'This data already exists',
  'resource-exhausted': 'Too many requests. Please try again later',
  'failed-precondition': 'Operation cannot be performed in current state',
  'aborted': 'Operation was aborted. Please try again',
  'out-of-range': 'Operation is out of valid range',
  'unimplemented': 'This operation is not available',
  'internal': 'An internal error occurred. Please try again',
  'unavailable': 'Service temporarily unavailable. Please try again',
  'data-loss': 'Data may have been lost or corrupted',
  'unauthenticated': 'You must be signed in to continue',
  'deadline-exceeded': 'Operation timed out. Please try again',
  'cancelled': 'Operation was cancelled',
};

/**
 * Network error messages
 */
const NETWORK_ERRORS = {
  'network-error': "Can't reach server. Check your internet connection",
  'offline': 'No internet connection. Check your connection and try again',
  'timeout': 'Request timed out. Please try again',
};

/**
 * Message sending errors
 */
const MESSAGE_ERRORS = {
  'send-failed': 'Message failed to send. Tap to retry',
  'sync-failed': 'Failed to sync messages. Pull to refresh',
  'invalid-message': 'Message text is required',
  'message-too-long': 'Message is too long (max 2000 characters)',
};

/**
 * Generic errors
 */
const GENERIC_ERRORS = {
  'unknown': 'Something went wrong. Please try again',
  'validation-error': 'Please check your input and try again',
  'server-error': 'Server error. Please try again later',
};

/**
 * Get user-friendly error message from error object or code
 * @param {Error|string} error - Error object or error code
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  if (!error) return GENERIC_ERRORS.unknown;
  
  // If it's already a string message
  if (typeof error === 'string') {
    return error;
  }
  
  // Extract error code
  const errorCode = error.code || error.message || '';
  
  // Check all error maps
  const allErrors = {
    ...AUTH_ERRORS,
    ...FIRESTORE_ERRORS,
    ...NETWORK_ERRORS,
    ...MESSAGE_ERRORS,
    ...GENERIC_ERRORS,
  };
  
  // Return mapped message or original message
  return allErrors[errorCode] || error.message || GENERIC_ERRORS.unknown;
}

/**
 * Check if error is a network error
 * @param {Error} error - Error object
 * @returns {boolean} True if network error
 */
export function isNetworkError(error) {
  if (!error) return false;
  
  const errorCode = error.code || error.message || '';
  
  return (
    errorCode.includes('network') ||
    errorCode.includes('offline') ||
    errorCode.includes('timeout') ||
    errorCode === 'auth/network-request-failed' ||
    errorCode === 'unavailable'
  );
}

/**
 * Check if error is an authentication error
 * @param {Error} error - Error object
 * @returns {boolean} True if auth error
 */
export function isAuthError(error) {
  if (!error) return false;
  
  const errorCode = error.code || '';
  
  return errorCode.startsWith('auth/') || errorCode === 'unauthenticated';
}

/**
 * Check if error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
  if (!error) return false;
  
  const errorCode = error.code || '';
  
  const retryableCodes = [
    'network-request-failed',
    'timeout',
    'unavailable',
    'deadline-exceeded',
    'resource-exhausted',
    'internal',
  ];
  
  return retryableCodes.some(code => errorCode.includes(code));
}

/**
 * Format validation errors for forms
 * @param {Object} errors - Validation errors object { field: message }
 * @returns {string} Formatted error message
 */
export function formatValidationErrors(errors) {
  if (!errors || Object.keys(errors).length === 0) {
    return '';
  }
  
  const messages = Object.values(errors);
  
  if (messages.length === 1) {
    return messages[0];
  }
  
  return messages.join('\n');
}

/**
 * Create error with code (for throwing custom errors)
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {Error} Error object with code
 */
export function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

