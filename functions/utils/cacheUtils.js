/**
 * Caching Utilities for AI Results
 *
 * Provides Firestore-based caching for AI operations to:
 * - Reduce API calls and costs
 * - Improve response times for repeated queries
 * - Track cache performance metrics
 *
 * Cache structure: /chats/{chatId}/aiInsights/{docId}
 * Each insight has: type, result, createdAt, metadata
 *
 * @module functions/utils/cacheUtils
 */

const admin = require("firebase-admin");
const {AIServiceError} = require("./aiUtils");

/**
 * Get cached AI result if available and not expired
 *
 * @param {string} chatId - Chat ID to get cache for
 * @param {string} type - Type of insight (e.g., "summary", "priorities")
 * @param {Object} [options] - Cache options
 * @param {number} [options.maxAge=86400000] - Max age in ms (default 24h)
 * @return {Promise<Object|null>} Cached data or null if miss/expired
 *
 * @example
 * const cached = await getCachedResult(chatId, "summary");
 * if (cached) {
 *   return cached.result;
 * }
 */
async function getCachedResult(chatId, type, options = {}) {
  const {maxAge = 86400000} = options; // Default 24 hours

  if (!chatId || typeof chatId !== "string") {
    throw new AIServiceError(
        "chatId must be a non-empty string",
        400,
        "INVALID_CHAT_ID",
    );
  }

  if (!type || typeof type !== "string") {
    throw new AIServiceError(
        "type must be a non-empty string",
        400,
        "INVALID_TYPE",
    );
  }

  try {
    // Query for most recent cache entry of this type
    const snapshot = await admin.firestore()
        .collection("chats").doc(chatId)
        .collection("aiInsights")
        .where("type", "==", type)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) {
      // Cache miss - no entry found
      await incrementCacheStats({hit: false, type});
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    const age = Date.now() - data.createdAt.toMillis();

    if (age > maxAge) {
      // Cache expired
      await incrementCacheStats({hit: false, type});
      return null;
    }

    // Cache hit
    await incrementCacheStats({hit: true, type});

    return {
      id: doc.id,
      ...data,
      age: age, // Include age in ms for debugging
    };
  } catch (error) {
    console.error("[Cache] Error reading cache:", error);
    throw new AIServiceError(
        `Failed to get cached result: ${error.message}`,
        500,
        "CACHE_READ_ERROR",
    );
  }
}

/**
 * Set cached AI result in Firestore
 *
 * @param {string} chatId - Chat ID to cache for
 * @param {Object} data - Data to cache
 * @param {string} data.type - Type of insight
 * @param {*} data.result - Result data to cache
 * @param {Object} [data.metadata] - Additional metadata
 * @return {Promise<string>} Document ID of cached entry
 *
 * @example
 * await setCacheResult(chatId, {
 *   type: "summary",
 *   result: {text: "...", keyPoints: [...]},
 *   metadata: {model: "gpt-4", tokenCount: 1234}
 * });
 */
async function setCacheResult(chatId, data) {
  if (!chatId || typeof chatId !== "string") {
    throw new AIServiceError(
        "chatId must be a non-empty string",
        400,
        "INVALID_CHAT_ID",
    );
  }

  if (!data || typeof data !== "object") {
    throw new AIServiceError(
        "data must be an object",
        400,
        "INVALID_DATA",
    );
  }

  if (!data.type || typeof data.type !== "string") {
    throw new AIServiceError(
        "data.type must be a non-empty string",
        400,
        "INVALID_TYPE",
    );
  }

  if (!data.result) {
    throw new AIServiceError(
        "data.result is required",
        400,
        "MISSING_RESULT",
    );
  }

  try {
    // Create new cache document (don't overwrite - keep history)
    const docRef = await admin.firestore()
        .collection("chats").doc(chatId)
        .collection("aiInsights")
        .add({
          type: data.type,
          result: data.result,
          metadata: data.metadata || {},
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

    if (process.env.NODE_ENV === "development") {
      console.log(`[Cache] Cached ${data.type} for chat ${chatId}`);
    }

    return docRef.id;
  } catch (error) {
    console.error("[Cache] Error writing cache:", error);
    throw new AIServiceError(
        `Failed to set cache result: ${error.message}`,
        500,
        "CACHE_WRITE_ERROR",
    );
  }
}

/**
 * Invalidate (delete) cached results of a specific type
 *
 * @param {string} chatId - Chat ID to invalidate cache for
 * @param {string} [type] - Type to invalidate (all types if not specified)
 * @param {Object} [options] - Invalidation options
 * @param {number} [options.olderThan=2592000000] - Delete older than ms
 * @return {Promise<number>} Number of documents deleted
 *
 * @example
 * // Delete all summaries older than 30 days
 * await invalidateCache(chatId, "summary", {olderThan: 30*24*60*60*1000});
 *
 * // Delete all cache entries for chat
 * await invalidateCache(chatId);
 */
async function invalidateCache(chatId, type, options = {}) {
  const {olderThan = 2592000000} = options; // Default 30 days

  if (!chatId || typeof chatId !== "string") {
    throw new AIServiceError(
        "chatId must be a non-empty string",
        400,
        "INVALID_CHAT_ID",
    );
  }

  try {
    const cutoffTime = admin.firestore.Timestamp.fromMillis(
        Date.now() - olderThan,
    );

    // Build query
    let query = admin.firestore()
        .collection("chats").doc(chatId)
        .collection("aiInsights")
        .where("createdAt", "<", cutoffTime);

    if (type) {
      query = query.where("type", "==", type);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return 0;
    }

    // Batch delete
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    if (process.env.NODE_ENV === "development") {
      console.log(`[Cache] Invalidated ${snapshot.size} entries for ${chatId}`);
    }

    return snapshot.size;
  } catch (error) {
    console.error("[Cache] Error invalidating cache:", error);
    throw new AIServiceError(
        `Failed to invalidate cache: ${error.message}`,
        500,
        "CACHE_INVALIDATE_ERROR",
    );
  }
}

/**
 * Increment cache statistics for monitoring
 *
 * @param {Object} stats - Stats to record
 * @param {boolean} stats.hit - Whether cache hit or miss
 * @param {string} stats.type - Type of insight
 * @return {Promise<void>}
 *
 * @example
 * await incrementCacheStats({hit: true, type: "summary"});
 */
async function incrementCacheStats(stats) {
  if (!stats || typeof stats !== "object") {
    return; // Don't throw - stats are optional
  }

  const {hit, type} = stats;

  try {
    const docRef = admin.firestore()
        .collection("meta")
        .doc("cacheStats");

    await docRef.set({
      [`${type}.hits`]: admin.firestore.FieldValue.increment(hit ? 1 : 0),
      [`${type}.misses`]: admin.firestore.FieldValue.increment(hit ? 0 : 1),
      [`${type}.total`]: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    // Don't throw - stats are best effort
    console.warn("[Cache] Failed to update stats:", error.message);
  }
}

/**
 * Get cache statistics for monitoring
 *
 * @return {Promise<Object>} Cache statistics by type
 *
 * @example
 * const stats = await getCacheStats();
 * console.log(`Hit rate: ${stats.summary.hits / stats.summary.total}`);
 */
async function getCacheStats() {
  try {
    const doc = await admin.firestore()
        .collection("meta")
        .doc("cacheStats")
        .get();

    if (!doc.exists) {
      return {};
    }

    return doc.data();
  } catch (error) {
    console.error("[Cache] Error getting stats:", error);
    return {};
  }
}

// Export all utilities
module.exports = {
  getCachedResult,
  setCacheResult,
  invalidateCache,
  incrementCacheStats,
  getCacheStats,
};

