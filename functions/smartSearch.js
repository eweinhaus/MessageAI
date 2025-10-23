/**
 * Smart Search Cloud Function
 *
 * Performs semantic search on chat messages using GPT-4o-mini.
 * Finds relevant messages by meaning, not just keywords.
 *
 * Callable function: smartSearch({chatId, query, limit})
 * Returns: {results: [{message data + relevance + reason}],
 *   query, totalResults}
 *
 * @module functions/smartSearch
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Import utilities
const {
  validateChatAccess,
  handleAIError,
} = require("./utils/aiUtils");

const {
  getCachedResult,
  setCacheResult,
} = require("./utils/cacheUtils");

const {
  checkRateLimit,
  incrementRateLimit,
} = require("./utils/rateLimiter");

const {
  semanticSearchSimple,
  validateQuery,
} = require("./utils/searchUtils");

/**
 * Smart semantic search for chat messages
 *
 * @param {Object} data - Request data
 * @param {string} data.chatId - Chat ID to search
 * @param {string} data.query - Search query (natural language)
 * @param {number} [data.limit=10] - Max results to return
 * @param {number} [data.messageCount=100] - Max messages to search
 * @param {boolean} [data.forceRefresh=false] - Skip cache
 * @param {Object} context - Function context with auth
 * @return {Promise<Object>} Search results with relevance scores
 */
exports.smartSearch = onCall(async (request) => {
  const startTime = Date.now();

  try {
    // Extract data and context
    const {
      chatId,
      query,
      limit = 10,
      messageCount = 100,
      forceRefresh = false,
    } = request.data;
    const userId = request.auth?.uid;

    // 1. Authentication check
    if (!userId) {
      throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to search messages",
      );
    }

    const logMsg = `[Smart Search] User ${userId} searching`;
    logger.info(`${logMsg} chat ${chatId} for: "${query}"`);

    // 2. Validate input parameters
    if (!chatId || typeof chatId !== "string") {
      throw new HttpsError(
          "invalid-argument",
          "chatId must be a non-empty string",
      );
    }

    try {
      validateQuery(query);
    } catch (error) {
      throw new HttpsError(
          "invalid-argument",
          error.message,
      );
    }

    if (limit < 1 || limit > 50) {
      throw new HttpsError(
          "invalid-argument",
          "limit must be between 1 and 50",
      );
    }

    if (messageCount < 10 || messageCount > 500) {
      throw new HttpsError(
          "invalid-argument",
          "messageCount must be between 10 and 500",
      );
    }

    // 3. Rate limiting check (separate 'search' bucket)
    await checkRateLimit(userId, "search");

    // 4. Validate chat access
    await validateChatAccess(userId, chatId);

    // 5. Check cache (12 hour TTL, keyed by chatId + query)
    // Note: Cache key includes query hash to cache per-query results
    if (!forceRefresh) {
      const cached = await getCachedResult(
          chatId,
          "search",
          {maxAge: 43200000}, // 12 hours
      );

      // Check if cached result matches this query
      if (cached && cached.result && cached.result.query === query) {
        logger.info(`[Smart Search] Cache hit for query: "${query}"`);

        const responseTime = Date.now() - startTime;
        logger.info(`[Smart Search] Completed in ${responseTime}ms (cached)`);

        return {
          success: true,
          results: cached.result.results || [],
          query: cached.result.query,
          totalResults: cached.result.totalResults || 0,
          cached: true,
          timestamp: cached.createdAt,
        };
      }
    }

    // 6. Perform semantic search
    const searchLog = "[Smart Search] Performing search";
    logger.info(`${searchLog} (limit: ${limit}, messages: ${messageCount})`);

    const results = await semanticSearchSimple(chatId, query, {
      limit,
      messageCount,
    });

    logger.info(`[Smart Search] Found ${results.length} results`);

    // 7. Prepare response data
    // Note: Filter out undefined values for Firestore compatibility
    const responseData = {
      results: results.map((r) => {
        const result = {
          messageID: r.messageID || r.id,
          chatID: r.chatID,
          senderID: r.senderID,
          senderName: r.senderName,
          text: r.text || r.message,
          relevance: r.relevance,
          reason: r.reason,
        };
        // Only include optional fields if they exist
        if (r.senderEmail) result.senderEmail = r.senderEmail;
        if (r.timestamp) result.timestamp = r.timestamp;
        return result;
      }),
      query,
      totalResults: results.length,
      cached: false,
    };

    // 8. Cache result
    await setCacheResult(chatId, {
      type: "search",
      result: {
        query,
        results: responseData.results,
        totalResults: responseData.totalResults,
      },
      metadata: {
        messageCount,
        limit,
        userId,
        model: "gpt-4o-mini",
      },
    });
    logger.info(`[Smart Search] Cached results for query: "${query}"`);

    // 9. Increment rate limit counter
    await incrementRateLimit(userId, "search");

    // 10. Log performance
    const responseTime = Date.now() - startTime;
    logger.info(`[Smart Search] Completed in ${responseTime}ms`);

    return {
      success: true,
      ...responseData,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error(`[Smart Search] Error after ${responseTime}ms:`, error);

    // Handle Firebase function errors (pass through)
    if (error instanceof HttpsError) {
      throw error;
    }

    // Handle AI service errors
    const errorResponse = handleAIError(error, "smartSearch");

    const errorCode = errorResponse.error === "RATE_LIMIT" ?
      "resource-exhausted" :
      "internal";
    throw new HttpsError(
        errorCode,
        errorResponse.message,
        errorResponse,
    );
  }
});

