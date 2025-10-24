/**
 * Action Item Extraction Cloud Function
 *
 * Analyzes chat messages to identify tasks, commitments, questions, and
 * deadlines using GPT-4 with function calling for structured output.
 *
 * Callable function: extractActionItems({chatId, messageCount})
 * Returns: {actionItems: [...], totalFound, messageCount}
 *
 * @module functions/extractActionItems
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
  buildActionItemPrompt,
} = require("./prompts/actionItemExtraction");

/**
 * Extract action items from chat messages
 *
 * @param {Object} data - Request data
 * @param {string} data.chatId - Chat ID to analyze
 * @param {number} [data.messageCount=50] - Number of messages to analyze
 * @param {boolean} [data.forceRefresh=false] - Skip cache
 * @param {Object} context - Function context with auth
 * @return {Promise<Object>} Action items results
 */
exports.extractActionItems = onCall(async (request) => {
  const startTime = Date.now();

  try {
    // Extract data and context
    const {chatId, messageCount = 50, forceRefresh = false} = request.data;
    const userId = request.auth?.uid;

    // 1. Authentication check
    if (!userId) {
      throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to extract action items",
      );
    }

    logger.info(`[ActionItems] User ${userId} analyzing chat ${chatId}`);

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
      await checkRateLimit(userId, "actionItems");
    } catch (error) {
      logger.warn(`[ActionItems] Rate limit exceeded for user ${userId}`);
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
          `[ActionItems] Access denied: user ${userId}, chat ${chatId}`,
      );
      throw new HttpsError(
          "permission-denied",
          "You don't have access to this chat",
      );
    }

    // 5. Check cache (24 hour TTL) - skip if forceRefresh is true
    if (!forceRefresh) {
      const cached = await getCachedResult(chatId, "actionItems", {
        maxAge: 24 * 60 * 60 * 1000,
      });

      if (cached && cached.result) {
        logger.info(`[ActionItems] Cache hit for chat ${chatId}`);
        const duration = Date.now() - startTime;
        logger.info(`[ActionItems] Completed in ${duration}ms (cached)`);

        return {
          ...cached.result,
          cached: true,
          cacheAge: cached.age,
        };
      }
    } else {
      logger.info("[ActionItems] Force refresh requested, skipping cache");
    }

    logger.info(`[ActionItems] Cache miss, analyzing chat ${chatId}`);

    // 6. Fetch messages from Firestore
    const messages = await getLastNMessages(chatId, messageCount);

    if (messages.length === 0) {
      logger.info(`[ActionItems] No messages found in chat ${chatId}`);
      return {
        actionItems: [],
        totalFound: 0,
        messageCount: 0,
        cached: false,
      };
    }

    logger.info(`[ActionItems] Fetched ${messages.length} messages`);

    // 7. Build context for OpenAI with message IDs
    const contextData = buildMessageContext(messages, {
      format: "detailed",
      maxMessages: messageCount,
    });

    // Create indexed message list for AI with message IDs
    const indexedMessages = messages.map((msg, index) => {
      return `${index}. [${msg.messageID}] [${msg.senderName}]: ${msg.text}`;
    }).join("\n");

    // 8. Build complete prompt
    const prompt = buildActionItemPrompt(indexedMessages, false);

    logger.info(
        `[ActionItems] Prompt: ${contextData.estimatedTokens} tokens`,
    );

    // 9. Call OpenAI API with function calling for structured output
    let aiResponse;
    try {
      const openai = getOpenAIClient();

      // Use function calling for structured JSON output
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {role: "system", content: prompt},
          {
            role: "user",
            content: "Analyze the conversation and extract all action items " +
              "in the specified JSON format.",
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: {type: "json_object"},
      });

      aiResponse = completion.choices[0].message.content;
      logger.info("[ActionItems] OpenAI response received");
    } catch (error) {
      logger.error("[ActionItems] OpenAI API error:", error);
      const errorResponse = handleAIError(error, "action item extraction");
      throw new HttpsError(
          "internal",
          errorResponse.message,
      );
    }

    // 10. Parse JSON response
    let actionItemData;
    try {
      actionItemData = parseJSONResponse(aiResponse);

      if (!actionItemData.actionItems ||
          !Array.isArray(actionItemData.actionItems)) {
        throw new Error("Invalid response structure");
      }

      // Validate schema for each action item
      actionItemData.actionItems.forEach((item, index) => {
        if (!item.task || typeof item.task !== "string") {
          throw new Error(`Action item ${index}: task is required`);
        }
        if (!item.type || !["commitment", "question", "task", "decision"]
            .includes(item.type)) {
          throw new Error(`Action item ${index}: invalid type`);
        }
        if (!item.priority || !["high", "medium", "low"]
            .includes(item.priority)) {
          throw new Error(`Action item ${index}: invalid priority`);
        }
        if (!item.sourceMessageId) {
          throw new Error(`Action item ${index}: sourceMessageId required`);
        }
        // isDecision is optional but must be boolean if present
        if (item.isDecision !== undefined &&
            typeof item.isDecision !== "boolean") {
          throw new Error(`Action item ${index}: isDecision must be boolean`);
        }
      });
    } catch (error) {
      logger.error("[ActionItems] Parse/validation error:", error);
      throw new HttpsError(
          "internal",
          "Failed to parse AI response. Please try again.",
      );
    }

    logger.info(
        `[ActionItems] Found ${actionItemData.actionItems.length} items`,
    );

    // 11. Store action items in Firestore
    const actionItemsCollection = admin.firestore()
        .collection("chats")
        .doc(chatId)
        .collection("actionItems");

    // Process in batches (Firestore batch limit: 500 operations)
    const batchSize = 450; // Conservative batch size
    const batches = [];

    for (let i = 0; i < actionItemData.actionItems.length; i += batchSize) {
      const batch = admin.firestore().batch();
      const itemsInBatch = actionItemData.actionItems
          .slice(i, i + batchSize);

      itemsInBatch.forEach((item) => {
        const docRef = actionItemsCollection.doc();
        // Build data object, filtering out undefined values
        // (Firestore requirement)
        const dataToWrite = {
          task: item.task,
          type: item.type,
          priority: item.priority,
          sourceMessageId: item.sourceMessageId,
          context: item.context || "",
          status: "pending",
          // Required for global collection queries
          userId: userId,
          chatId: chatId,
          // Decision tracking
          isDecision: item.isDecision || false,
          // Timestamps
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: null,
        };

        // Only add optional fields if they exist (avoid undefined)
        if (item.assignee) dataToWrite.assignee = item.assignee;
        if (item.deadline) dataToWrite.deadline = item.deadline;

        batch.set(docRef, dataToWrite);
      });

      batches.push(batch.commit());
    }

    await Promise.all(batches);
    logger.info(
        `[ActionItems] Stored ${actionItemData.actionItems.length} ` +
        "items in Firestore",
    );

    // 12. Cache the result
    const resultToCache = {
      actionItems: actionItemData.actionItems,
      totalFound: actionItemData.actionItems.length,
      messageCount: messages.length,
      analyzedAt: Date.now(),
    };

    await setCacheResult(chatId, {
      type: "actionItems",
      result: resultToCache,
      metadata: {
        messageCount: messages.length,
        totalItems: actionItemData.actionItems.length,
        highPriority: actionItemData.actionItems
            .filter((i) => i.priority === "high").length,
        model: "gpt-4o-mini",
        tokenCount: contextData.estimatedTokens,
      },
    });

    // 13. Increment rate limit counter
    await incrementRateLimit(userId, "actionItems");

    // 14. Return results
    const duration = Date.now() - startTime;
    logger.info(`[ActionItems] Completed in ${duration}ms`);

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
    logger.error("[ActionItems] Unexpected error:", error);
    throw new HttpsError(
        "internal",
        "An unexpected error occurred. Please try again.",
    );
  }
});

