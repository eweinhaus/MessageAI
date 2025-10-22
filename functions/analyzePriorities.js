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
 *
 * @param {Object} data - Request data
 * @param {string} data.chatId - Chat ID to analyze
 * @param {number} [data.messageCount=30] - Number of messages to analyze
 * @param {Object} context - Function context with auth
 * @return {Promise<Object>} Priority analysis results
 */
exports.analyzePriorities = onCall(async (request) => {
  const startTime = Date.now();

  try {
    // Extract data and context
    const {chatId, messageCount = 30} = request.data;
    const userId = request.auth?.uid;

    // 1. Authentication check
    if (!userId) {
      throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to analyze priorities",
      );
    }

    logger.info(`[Priority] User ${userId} analyzing chat ${chatId}`);

    // 2. Validate input parameters
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

    // 5. Check cache (24 hour TTL)
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
        model: "gpt-4-turbo-preview",
        messages: [
          {role: "system", content: prompt},
          {
            role: "user",
            content: "Analyze the messages above and return the " +
              "priority assessment in JSON format.",
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
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
      // Find the actual message ID from our numbered list
      const messageIndex = parseInt(priority.messageId);
      const actualMessageId = messages[messageIndex]?.messageID;

      if (actualMessageId) {
        const docRef = prioritiesCollection.doc(actualMessageId);
        batch.set(docRef, {
          messageId: actualMessageId,
          priority: priority.priority,
          reason: priority.reason,
          confidence: priority.confidence || 0.5,
          analyzedAt:
            admin.firestore.FieldValue.serverTimestamp(),
          analyzedBy: userId,
        });
      }
    });

    await batch.commit();
    logger.info(
        `[Priority] Stored ${priorityData.priorities.length} in Firestore`,
    );

    // 12. Cache the result
    const resultToCache = {
      priorities: priorityData.priorities.map((p, index) => {
        const msgId = messages[parseInt(p.messageId)]?.messageID;
        return {
          ...p,
          messageId: msgId || p.messageId,
        };
      }),
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
        model: "gpt-4-turbo-preview",
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

