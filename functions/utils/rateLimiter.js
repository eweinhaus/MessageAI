/**
 * Rate Limiting Utilities
 *
 * Provides user-based rate limiting for AI operations:
 * - Per-user, per-operation tracking
 * - Rolling window rate limits
 * - Automatic expiration
 * - Admin bypass
 *
 * Firestore structure: /rateLimits/{userId}/{operation}
 *
 * @module functions/utils/rateLimiter
 */

const admin = require("firebase-admin");
const {RateLimitError} = require("./errors");

/**
 * Default rate limit configuration
 */
const DEFAULT_LIMITS = {
  priority: 10, // 10 calls per hour
  summary: 5, // 5 calls per hour
  search: 20, // 20 calls per hour
  actions: 10, // 10 calls per hour
  decisions: 5, // 5 calls per hour
  default: 10, // Default for any operation
};

/**
 * Check if user is within rate limit for an operation
 *
 * @param {string} userId - User ID to check
 * @param {string} operation - Operation name (e.g., "summary", "priority")
 * @param {Object} [options] - Rate limit options
 * @param {number} [options.maxPerHour] - Max calls per hour
 * @return {Promise<boolean>} True if within limit
 * @throws {RateLimitError} If rate limit exceeded
 *
 * @example
 * await checkRateLimit(userId, "summary");
 * // Throws if limit exceeded
 */
async function checkRateLimit(userId, operation, options = {}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a non-empty string");
  }

  if (!operation || typeof operation !== "string") {
    throw new Error("operation must be a non-empty string");
  }

  // Check if user has admin bypass
  const isAdmin = await checkAdminBypass(userId);
  if (isAdmin) {
    return true; // Admins bypass rate limits
  }

  const maxPerHour = options.maxPerHour ||
    DEFAULT_LIMITS[operation] ||
    DEFAULT_LIMITS.default;

  try {
    const docRef = admin.firestore()
        .collection("rateLimits")
        .doc(userId)
        .collection("operations")
        .doc(operation);

    const doc = await docRef.get();

    if (!doc.exists) {
      return true; // No limit record yet, allow
    }

    const data = doc.data();
    const {count, resetAt} = data;

    // Check if window has expired
    const now = Date.now();
    const resetTime = resetAt?.toMillis() || 0;

    if (now > resetTime) {
      // Window expired, allow (will be reset on increment)
      return true;
    }

    // Check if within limit
    if (count >= maxPerHour) {
      const secondsUntilReset = Math.ceil((resetTime - now) / 1000);
      throw new RateLimitError(
          `Rate limit exceeded for ${operation}. ` +
          `Try again in ${secondsUntilReset} seconds.`,
          secondsUntilReset,
      );
    }

    return true;
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    // On Firestore error, fail open (allow) for better UX
    console.error("[RateLimit] Error checking limit:", error);
    return true;
  }
}

/**
 * Increment rate limit counter for a user and operation
 *
 * @param {string} userId - User ID
 * @param {string} operation - Operation name
 * @return {Promise<void>}
 *
 * @example
 * await incrementRateLimit(userId, "summary");
 */
async function incrementRateLimit(userId, operation) {
  if (!userId || typeof userId !== "string") {
    return; // Fail silently for tracking
  }

  if (!operation || typeof operation !== "string") {
    return; // Fail silently for tracking
  }

  // Check admin bypass
  const isAdmin = await checkAdminBypass(userId);
  if (isAdmin) {
    return; // Don't track admin usage
  }

  try {
    const docRef = admin.firestore()
        .collection("rateLimits")
        .doc(userId)
        .collection("operations")
        .doc(operation);

    await admin.firestore().runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const now = Date.now();
      const oneHourFromNow = now + (60 * 60 * 1000);

      if (!doc.exists) {
        // First call in this window
        transaction.set(docRef, {
          count: 1,
          resetAt: admin.firestore.Timestamp.fromMillis(oneHourFromNow),
          lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const data = doc.data();
        const resetTime = data.resetAt?.toMillis() || 0;

        if (now > resetTime) {
          // Window expired, reset
          transaction.set(docRef, {
            count: 1,
            resetAt: admin.firestore.Timestamp.fromMillis(oneHourFromNow),
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // Increment in current window
          transaction.update(docRef, {
            count: admin.firestore.FieldValue.increment(1),
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
  } catch (error) {
    // Don't throw - increment is best effort
    console.error("[RateLimit] Error incrementing:", error);
  }
}

/**
 * Get current rate limit status for a user and operation
 *
 * @param {string} userId - User ID
 * @param {string} operation - Operation name
 * @return {Promise<Object>} Rate limit status
 * @return {number} return.count - Current count
 * @return {number} return.limit - Max limit
 * @return {number} return.resetAt - Reset timestamp (ms)
 * @return {number} return.remaining - Calls remaining
 *
 * @example
 * const status = await getRateLimitStatus(userId, "summary");
 * console.log(`${status.remaining} calls remaining`);
 */
async function getRateLimitStatus(userId, operation) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a non-empty string");
  }

  if (!operation || typeof operation !== "string") {
    throw new Error("operation must be a non-empty string");
  }

  const limit = DEFAULT_LIMITS[operation] || DEFAULT_LIMITS.default;

  try {
    const docRef = admin.firestore()
        .collection("rateLimits")
        .doc(userId)
        .collection("operations")
        .doc(operation);

    const doc = await docRef.get();

    if (!doc.exists) {
      return {
        count: 0,
        limit: limit,
        resetAt: Date.now() + (60 * 60 * 1000),
        remaining: limit,
      };
    }

    const data = doc.data();
    const {count = 0, resetAt} = data;
    const resetTime = resetAt?.toMillis() || Date.now();

    // Check if expired
    if (Date.now() > resetTime) {
      return {
        count: 0,
        limit: limit,
        resetAt: Date.now() + (60 * 60 * 1000),
        remaining: limit,
      };
    }

    return {
      count: count,
      limit: limit,
      resetAt: resetTime,
      remaining: Math.max(0, limit - count),
    };
  } catch (error) {
    console.error("[RateLimit] Error getting status:", error);
    return {
      count: 0,
      limit: limit,
      resetAt: Date.now() + (60 * 60 * 1000),
      remaining: limit,
    };
  }
}

/**
 * Reset rate limits for a user (admin function)
 *
 * @param {string} userId - User ID
 * @param {string} [operation] - Specific operation or all if not specified
 * @return {Promise<number>} Number of limits reset
 *
 * @example
 * await resetRateLimit(userId, "summary");
 * await resetRateLimit(userId); // Reset all
 */
async function resetRateLimit(userId, operation) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a non-empty string");
  }

  try {
    if (operation) {
      // Reset specific operation
      const docRef = admin.firestore()
          .collection("rateLimits")
          .doc(userId)
          .collection("operations")
          .doc(operation);

      await docRef.delete();
      return 1;
    } else {
      // Reset all operations for user
      const snapshot = await admin.firestore()
          .collection("rateLimits")
          .doc(userId)
          .collection("operations")
          .get();

      if (snapshot.empty) {
        return 0;
      }

      const batch = admin.firestore().batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      return snapshot.size;
    }
  } catch (error) {
    console.error("[RateLimit] Error resetting:", error);
    throw error;
  }
}

/**
 * Check if user has admin bypass (via custom claims)
 *
 * @param {string} userId - User ID to check
 * @return {Promise<boolean>} True if user is admin
 */
async function checkAdminBypass(userId) {
  try {
    const userRecord = await admin.auth().getUser(userId);
    return userRecord.customClaims?.isAdmin === true;
  } catch (error) {
    // If user doesn't exist or error, assume not admin
    return false;
  }
}

// Export all utilities
module.exports = {
  checkRateLimit,
  incrementRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  DEFAULT_LIMITS,
};

