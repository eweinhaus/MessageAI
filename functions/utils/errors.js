/**
 * Centralized Error Handling Framework
 *
 * Provides:
 * - Custom error classes for different failure types
 * - Error mapping for user-friendly responses
 * - Error logging with context
 *
 * @module functions/utils/errors
 */

const admin = require("firebase-admin");

/**
 * Custom error class for AI service errors
 * @extends Error
 */
class AIServiceError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code="UNKNOWN"] - Error code
   */
  constructor(message, statusCode = 500, code = "UNKNOWN") {
    super(message);
    this.name = "AIServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Custom error class for validation errors
 * @extends Error
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   */
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.code = "VALIDATION_ERROR";
  }
}

/**
 * Custom error class for cache operation errors
 * @extends Error
 */
class CacheError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [code="CACHE_ERROR"] - Error code
   */
  constructor(message, code = "CACHE_ERROR") {
    super(message);
    this.name = "CacheError";
    this.statusCode = 500;
    this.code = code;
  }
}

/**
 * Custom error class for rate limiting errors
 * @extends Error
 */
class RateLimitError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [retryAfter=60] - Seconds until retry allowed
   */
  constructor(message, retryAfter = 60) {
    super(message);
    this.name = "RateLimitError";
    this.statusCode = 429;
    this.code = "RATE_LIMIT_EXCEEDED";
    this.retryAfter = retryAfter;
  }
}

/**
 * Centralized error handler for AI operations
 * Maps various error types to user-friendly responses
 *
 * @param {Error} error - Error object to handle
 * @param {string} context - Context string for logging
 * @return {Object} Error response object
 * @return {string} return.error - Error code
 * @return {string} return.message - User-friendly message
 * @return {number} [return.retryAfter] - Seconds to wait before retry
 * @return {boolean} [return.fallback] - Whether fallback is available
 *
 * @example
 * try {
 *   await openai.chat.completions.create({...});
 * } catch (error) {
 *   const errorResponse = handleAIError(error, "summarization");
 *   return errorResponse;
 * }
 */
function handleAIError(error, context) {
  console.error(`[AI Error] ${context}:`, error);

  // Rate limit errors (429)
  if (error instanceof RateLimitError) {
    return {
      error: "RATE_LIMIT",
      message: error.message,
      retryAfter: error.retryAfter,
    };
  }

  if (error.response?.status === 429 || error.status === 429) {
    return {
      error: "RATE_LIMIT",
      message: "AI service is busy. Please try again in a moment.",
      retryAfter: 30,
    };
  }

  // Authentication errors (401)
  if (error.response?.status === 401 || error.status === 401) {
    return {
      error: "AUTHENTICATION_ERROR",
      message: "AI service authentication failed. Please contact support.",
    };
  }

  // Server errors (500, 502, 503, 504)
  if (error.response?.status >= 500 || error.status >= 500) {
    return {
      error: "SERVICE_ERROR",
      message: "AI service temporarily unavailable.",
      fallback: true,
    };
  }

  // Timeout errors
  if (error.code === "ETIMEDOUT" || error.message?.includes("timeout")) {
    return {
      error: "TIMEOUT",
      message: "AI request timed out. Please try again.",
      retryAfter: 10,
    };
  }

  // Validation errors (our custom errors)
  if (error instanceof ValidationError) {
    return {
      error: "VALIDATION_ERROR",
      message: error.message,
    };
  }

  // Cache errors
  if (error instanceof CacheError) {
    return {
      error: "CACHE_ERROR",
      message: "Cache operation failed.",
      fallback: true,
    };
  }

  // Generic AIServiceError
  if (error instanceof AIServiceError) {
    return {
      error: error.code,
      message: error.message,
    };
  }

  // Generic error
  return {
    error: "UNKNOWN",
    message: "Something went wrong. Please try again.",
    details: process.env.NODE_ENV === "development" ? error.message : undefined,
  };
}

/**
 * Log error to Firestore for monitoring and debugging
 * Only logs in production to avoid clutter
 *
 * @param {Error} error - Error to log
 * @param {string} context - Context where error occurred
 * @param {Object} [extra] - Additional metadata
 * @param {string} [extra.uid] - User ID
 * @param {string} [extra.chatId] - Chat ID
 * @param {string} [extra.functionName] - Cloud Function name
 * @return {Promise<void>}
 *
 * @example
 * await logError(error, "summarization", {
 *   uid: userId,
 *   chatId: chatId,
 *   functionName: "summarizeThread"
 * });
 */
async function logError(error, context, extra = {}) {
  // Only log in production
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  try {
    await admin.firestore()
        .collection("meta")
        .doc("errorLogs")
        .collection("errors")
        .add({
          context: context,
          error: {
            name: error.name,
            message: error.message,
            code: error.code || "UNKNOWN",
            statusCode: error.statusCode,
            stack: process.env.NODE_ENV === "development" ?
              error.stack :
              undefined,
          },
          metadata: extra,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
  } catch (logError) {
    // Don't throw - logging is best effort
    console.error("[Error] Failed to log error:", logError);
  }
}

// Export all error classes and handlers
module.exports = {
  AIServiceError,
  ValidationError,
  CacheError,
  RateLimitError,
  handleAIError,
  logError,
};

