/**
 * Priority Detection Cloud Function
 *
 * Analyzes chat messages to detect urgent/priority messages using GPT-4.
 * Identifies time-sensitive keywords, direct questions, blocking issues,
 * and @mentions.
 *
 * Callable function: analyzePriorities({chatId, messageCount})
 * Returns: {priorities: [{messageId, priority, reason, confidence}]}
 *
 * @module functions/analyzePriorities
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Import utilities
const {
  getOpenAIClient,
  buildMessageContext,
  validateChatAccess,
  handleAIError,
  getLastNMessages,
} = require("./utils/aiUtils");

const {
  getCachedResult,
  setCacheResult,
} = require("./utils/cacheUtils");

const {
  checkRateLimit,
  incrementRateLimit,
} = require("./utils/rateLimiter");

const {parseJSONResponse} = require("./utils/langchainUtils");

const {
  buildPriorityPrompt,
} = require("./prompts/priorityDetection");

/**
 * Analyze priorities in chat messages
 * Supports both single-chat and batch modes
 *
 * Single mode:
 * @param {Object} data - Request data
 * @param {string} data.chatId - Chat ID to analyze
 * @param {number} [data.messageCount=30] - Number of messages to analyze
 *
 * Batch mode (for global priority ordering):
 * @param {Object} data - Request data
 * @param {Array} data.chats - Array of {chatId, messages}
 * @param {number} [data.messageCount=30] - Max messages per chat
 *
 * @param {Object} context - Function context with auth
 * @return {Promise<Object>} Priority analysis results
 */
exports.analyzePriorities = onCall(async (request) => {
  const startTime = Date.now();

  try {
    // Extract data and context
    const {chatId, chats, messageCount = 30, forceRefresh = false} =
      request.data;
    const userId = request.auth?.uid;

    // 1. Authentication check
    if (!userId) {
      throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to analyze priorities",
      );
    }

    // 2. Validate input parameters - must have either chatId OR chats
    if (!chatId && !chats) {
      throw new HttpsError(
          "invalid-argument",
          "Must provide either chatId or chats array",
      );
    }

    // BATCH MODE: Process multiple chats for global priority ordering
    if (chats && Array.isArray(chats)) {
      logger.info(
          `[Priority] User ${userId} batch analyzing ${chats.length} chats`,
      );
      return await processBatchPriorities(
          userId,
          chats,
          messageCount,
          forceRefresh,
          startTime,
      );
    }

    // SINGLE MODE: Original per-chat logic
    logger.info(`[Priority] User ${userId} analyzing chat ${chatId}`);

    if (!chatId || typeof chatId !== "string") {
      throw new HttpsError(
          "invalid-argument",
          "chatId must be a non-empty string",
      );
    }

    if (messageCount < 1 || messageCount > 100) {
      throw new HttpsError(
          "invalid-argument",
          "messageCount must be between 1 and 100",
      );
    }

    // 3. Rate limiting check
    try {
      await checkRateLimit(userId, "priority");
    } catch (error) {
      logger.warn(`[Priority] Rate limit exceeded for user ${userId}`);
      throw new HttpsError(
          "resource-exhausted",
          error.message || "Rate limit exceeded. Please try again later.",
      );
    }

    // 4. Validate user has access to this chat
    try {
      await validateChatAccess(userId, chatId);
    } catch (error) {
      logger.warn(
          `[Priority] Access denied: user ${userId}, chat ${chatId}`,
      );
      throw new HttpsError(
          "permission-denied",
          "You don't have access to this chat",
      );
    }

    // 5. Check cache (24 hour TTL) - skip if forceRefresh is true
    if (!forceRefresh) {
      const cached = await getCachedResult(chatId, "priorities", {
        maxAge: 24 * 60 * 60 * 1000,
      });

      if (cached && cached.result) {
        logger.info(`[Priority] Cache hit for chat ${chatId}`);
        const duration = Date.now() - startTime;
        logger.info(`[Priority] Completed in ${duration}ms (cached)`);

        return {
          ...cached.result,
          cached: true,
          cacheAge: cached.age,
        };
      }
    } else {
      logger.info("[Priority] Force refresh requested, skipping cache");
    }

    logger.info(`[Priority] Cache miss, analyzing chat ${chatId}`);

    // 6. Fetch messages from Firestore
    const messages = await getLastNMessages(chatId, messageCount);

    if (messages.length === 0) {
      logger.info(`[Priority] No messages found in chat ${chatId}`);
      return {
        priorities: [],
        messageCount: 0,
        cached: false,
      };
    }

    logger.info(`[Priority] Fetched ${messages.length} messages`);

    // 7. Build context for OpenAI with message IDs
    const contextData = buildMessageContext(messages, {
      format: "detailed",
      maxMessages: messageCount,
    });

    // Create numbered message list for AI
    const numberedMessages = messages.map((msg, index) => {
      return `${index}. [${msg.messageID}] ${msg.senderName}: ${msg.text}`;
    }).join("\n");

    // 8. Build complete prompt
    const prompt = buildPriorityPrompt(numberedMessages, false);

    logger.info(
        `[Priority] Prompt: ${contextData.estimatedTokens} tokens`,
    );

    // 9. Call OpenAI API
    let aiResponse;
    try {
      const openai = getOpenAIClient();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {role: "system", content: prompt},
          {
            role: "user",
            content: "Analyze the messages above and return the " +
              "priority assessment in JSON format.",
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: {type: "json_object"},
      });

      aiResponse = completion.choices[0].message.content;
      logger.info("[Priority] OpenAI response received");
    } catch (error) {
      logger.error("[Priority] OpenAI API error:", error);
      const errorResponse = handleAIError(error, "priority analysis");
      throw new HttpsError(
          "internal",
          errorResponse.message,
      );
    }

    // 10. Parse JSON response
    let priorityData;
    try {
      priorityData = parseJSONResponse(aiResponse);

      if (!priorityData.priorities || !Array.isArray(priorityData.priorities)) {
        throw new Error("Invalid response structure");
      }
    } catch (error) {
      logger.error("[Priority] Parse error:", error);
      throw new HttpsError(
          "internal",
          "Failed to parse AI response. Please try again.",
      );
    }

    logger.info(
        `[Priority] Found ${priorityData.priorities.length} priorities`,
    );

    // 11. Store priorities in Firestore
    const batch = admin.firestore().batch();
    const prioritiesCollection = admin.firestore()
        .collection("chats")
        .doc(chatId)
        .collection("priorities");

    // Clear old priorities for these messages
    const messageIds = messages.map((m) => m.messageID).slice(0, 10);
    const existingSnapshot = await prioritiesCollection
        .where("messageId", "in", messageIds)
        .get();

    existingSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Write new priorities
    priorityData.priorities.forEach((priority) => {
      // GPT returns the messageId directly, not an index
      // Try to find it in our messages array to validate
      const messageId = priority.messageId;
      const foundMessage = messages.find((m) => m.messageID === messageId);

      if (foundMessage) {
        const docRef = prioritiesCollection.doc(messageId);
        const dataToWrite = {
          messageId: messageId,
          priority: priority.priority,
          reason: priority.reason,
          confidence: priority.confidence || 0.5,
          analyzedAt:
            admin.firestore.FieldValue.serverTimestamp(),
          analyzedBy: userId,
        };
        logger.info(
            `[Priority] Writing ${messageId} ` +
            `with priority: ${priority.priority}`,
        );
        batch.set(docRef, dataToWrite);
      } else {
        logger.warn(
            `[Priority] Message ID ${messageId} not found in messages`,
        );
      }
    });

    await batch.commit();
    logger.info(
        "[Priority] Batch committed: " +
        `stored ${priorityData.priorities.length} in Firestore`,
    );

    // 12. Cache the result
    const resultToCache = {
      priorities: priorityData.priorities,
      messageCount: messages.length,
      analyzedAt: Date.now(),
    };

    await setCacheResult(chatId, {
      type: "priorities",
      result: resultToCache,
      metadata: {
        messageCount: messages.length,
        urgentCount: priorityData.priorities
            .filter((p) => p.priority === "urgent").length,
        model: "gpt-4o-mini",
        tokenCount: contextData.estimatedTokens,
      },
    });

    // 13. Increment rate limit counter
    await incrementRateLimit(userId, "priority");

    // 14. Return results
    const duration = Date.now() - startTime;
    logger.info(`[Priority] Completed in ${duration}ms`);

    return {
      ...resultToCache,
      cached: false,
      duration,
    };
  } catch (error) {
    // Log error and re-throw if it's already an HttpsError
    if (error instanceof HttpsError) {
      throw error;
    }

    // Handle unexpected errors
    logger.error("[Priority] Unexpected error:", error);
    throw new HttpsError(
        "internal",
        "An unexpected error occurred. Please try again.",
    );
  }
});

/**
 * Process batch priority analysis for multiple chats
 * Used for global chat list priority ordering
 *
 * @param {string} userId - User ID
 * @param {Array} chats - Array of {chatId, messages}
 * @param {number} messageCount - Max messages per chat
 * @param {boolean} forceRefresh - Skip cache
 * @param {number} startTime - Request start timestamp
 * @return {Promise<Object>} Batch results
 */
async function processBatchPriorities(
    userId,
    chats,
    messageCount,
    forceRefresh,
    startTime,
) {
  // Guard: Limit batch size to prevent token explosion
  const maxBatchSize = 10;
  const limitedChats = chats.slice(0, maxBatchSize);

  if (chats.length > maxBatchSize) {
    logger.warn(
        `[Priority] Batch size ${chats.length} exceeds max ` +
        `${maxBatchSize}, processing first ${maxBatchSize} chats`,
    );
  }

  // Validate each chat in batch
  if (!Array.isArray(limitedChats) || limitedChats.length === 0) {
    throw new HttpsError(
        "invalid-argument",
        "chats must be a non-empty array",
    );
  }

  // Process each chat in parallel
  const results = await Promise.all(
      limitedChats.map(async (chat) => {
        try {
          // Validate chat object
          if (!chat.chatId || !chat.messages) {
            logger.warn(
                "[Priority] Invalid chat object in batch, skipping",
            );
            return null;
          }

          // Validate user has access to this chat
          try {
            await validateChatAccess(userId, chat.chatId);
          } catch (error) {
            logger.warn(
                `[Priority] Access denied: user ${userId}, ` +
                `chat ${chat.chatId}`,
            );
            return null;
          }

          // Skip if no messages
          if (!Array.isArray(chat.messages) ||
              chat.messages.length === 0) {
            logger.info(
                `[Priority] No messages in chat ${chat.chatId}, skipping`,
            );
            return {
              chatId: chat.chatId,
              signals: {},
              messageCount: 0,
            };
          }

          // Truncate messages to limit
          const messages = chat.messages.slice(0, messageCount);

          // Build context for AI analysis
          const contextData = buildMessageContext(messages, {
            format: "detailed",
            maxMessages: messageCount,
          });

          // Create numbered message list
          const numberedMessages = messages.map((msg, index) => {
            const msgId = msg.messageID || `msg-${index}`;
            const sender = msg.senderName || "Unknown";
            const text = msg.text || "";
            return `${index}. [${msgId}] ${sender}: ${text}`;
          }).join("\n");

          // Build prompt for batch analysis (lightweight)
          const prompt = buildPriorityPrompt(numberedMessages, true);

          logger.info(
              `[Priority] Analyzing chat ${chat.chatId}: ` +
              `${messages.length} messages, ` +
              `~${contextData.estimatedTokens} tokens`,
          );

          // Call OpenAI for this chat
          const openai = getOpenAIClient();
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {role: "system", content: prompt},
              {
                role: "user",
                content: "Analyze the chat and return signals in JSON.",
              },
            ],
            temperature: 0.3,
            max_tokens: 200, // Smaller for batch (just signals, not details)
            response_format: {type: "json_object"},
          });

          const aiResponse = completion.choices[0].message.content;
          const parsed = parseJSONResponse(aiResponse);

          // Extract signals (boolean flags)
          const signals = {
            highImportance: parsed.highImportance === true,
            unansweredQuestion: parsed.unansweredQuestion === true,
            mentionsDeadline: parsed.mentionsDeadline === true,
            requiresAction: parsed.requiresAction === true,
            hasBlocker: parsed.hasBlocker === true,
            summary: parsed.summary || "",
          };

          return {
            chatId: chat.chatId,
            signals,
            messageCount: messages.length,
          };
        } catch (error) {
          logger.error(
              `[Priority] Error analyzing chat ${chat.chatId}:`,
              error,
          );
          // Return null for failed chats (don't fail entire batch)
          return null;
        }
      }),
  );

  // Filter out null results (failed chats)
  const successfulResults = results.filter((r) => r !== null);

  logger.info(
      `[Priority] Batch complete: ${successfulResults.length}` +
      `/${limitedChats.length} chats analyzed`,
  );

  // Cache the batch result (user-level cache)
  await setCacheResult(userId, {
    type: "priorityAnalysis",
    result: {
      mode: "batch",
      chats: successfulResults,
    },
    metadata: {
      chatCount: successfulResults.length,
      analyzedAt: Date.now(),
      model: "gpt-4o-mini",
    },
  });

  // Increment rate limit once for the batch
  await incrementRateLimit(userId, "priority");

  const duration = Date.now() - startTime;
  logger.info(`[Priority] Batch completed in ${duration}ms`);

  return {
    mode: "batch",
    chats: successfulResults,
    processedCount: successfulResults.length,
    requestedCount: chats.length,
    cached: false,
    duration,
  };
}

