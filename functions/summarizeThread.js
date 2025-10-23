/**
 * Thread Summarization Cloud Function
 *
 * Implements RAG (Retrieval-Augmented Generation) pipeline.
 * 1. Retrieval: Fetch last N messages from Firestore
 * 2. Augmentation: Build context with message formatting
 * 3. Generation: Call OpenAI to generate structured summary
 */

/* eslint-disable max-len */
const functions = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
const {
  checkRateLimit,
  incrementRateLimit,
} = require("./utils/rateLimiter");
const {validateChatAccess} = require("./utils/aiUtils");
const {getCachedResult, setCacheResult} = require("./utils/cacheUtils");
const {
  getLastNMessages,
  buildMessageContext,
  getOpenAIClient,
} = require("./utils/aiUtils");
const {handleAIError} = require("./utils/errors");
const {SUMMARIZATION_SYSTEM_PROMPT} = require("./prompts/threadSummarization");

/**
 * Summarize a conversation thread with key points, decisions, and action items
 *
 * @param {Object} request - Firebase Functions v2 request object
 * @param {Object} request.data - Request data
 * @param {string} request.data.chatId - Chat ID to summarize
 * @param {number} [request.data.messageCount=50] - Number of recent messages to analyze
 * @param {boolean} [request.data.forceRefresh=false] - Skip cache and generate new summary
 * @param {Object} request.auth - Firebase auth context
 * @returns {Promise<Object>} Summary with keyPoints, decisions, actionItems, etc.
 */
exports.summarizeThread = onCall(async (request) => {
  const startTime = Date.now();

  // Extract data and auth from request object (Functions v2 pattern)
  const {chatId, messageCount = 50, forceRefresh = false} = request.data || {};
  const userId = request.auth?.uid;

  console.log("[summarizeThread] Function invoked", {
    chatId,
    messageCount,
    forceRefresh,
    userId,
    hasAuth: !!request.auth,
  });

  // 1. Authentication check
  if (!userId) {
    console.warn("[summarizeThread] Unauthenticated request - no userId");
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to use AI features",
    );
  }

  // Validate inputs
  if (!chatId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "chatId is required",
    );
  }

  if (messageCount < 1 || messageCount > 100) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "messageCount must be between 1 and 100",
    );
  }

  try {
    // 2. Rate limiting (10 operations per hour per user)
    console.log(`[summarizeThread] Checking rate limit for user ${userId}`);
    await checkRateLimit(userId, "summarize");

    // 3. Validate user has access to this chat
    console.log(`[summarizeThread] Validating chat access for ${chatId}`);
    await validateChatAccess(userId, chatId);

    // 4. Check cache (skip if forceRefresh is true)
    if (!forceRefresh) {
      console.log("[summarizeThread] Checking cache");
      const cached = await getCachedResult(chatId, "summary", {
        maxAge: 86400000, // 24 hours
      });

      if (cached && cached.result) {
        const elapsedTime = Date.now() - startTime;
        console.log(`[summarizeThread] Cache hit (${elapsedTime}ms)`, {
          cacheAge: cached.age,
          hasResult: !!cached.result,
        });
        return {
          success: true,
          cached: true,
          ...cached.result,
          cacheAge: cached.age,
        };
      }
      console.log("[summarizeThread] Cache miss");
    } else {
      console.log("[summarizeThread] Skipping cache (forceRefresh=true)");
    }

    // 5. Fetch messages (RAG - Retrieval step)
    console.log(`[summarizeThread] Fetching last ${messageCount} messages`);
    const messages = await getLastNMessages(chatId, messageCount);

    if (messages.length === 0) {
      console.warn(`[summarizeThread] No messages found in chat ${chatId}`);
      throw new functions.https.HttpsError(
          "failed-precondition",
          "No messages to summarize yet. Start a conversation first!",
      );
    }

    console.log(`[summarizeThread] Retrieved ${messages.length} messages`, {
      firstMessageId: messages[0]?.messageID,
      lastMessageId: messages[messages.length - 1]?.messageID,
    });

    messages.slice(0, 3).forEach((msg, index) => {
      console.log(`[summarizeThread] Message sample ${index + 1}`, {
        messageID: msg.messageID,
        senderName: msg.senderName,
        timestampType: typeof msg.timestamp,
        hasTimestampToMillis: typeof msg.timestamp?.toMillis === "function",
        hasText: typeof msg.text === "string" && msg.text.length > 0,
        textPreview: msg.text?.slice(0, 120) || "<empty>",
      });
    });

    // 6. Build context (RAG - Augmentation step)
    console.log("[summarizeThread] Building message context");
    const contextData = buildMessageContext(messages, {format: "detailed"});

    console.log("[summarizeThread] Context built", {
      contextMessageCount: contextData.messageCount,
      estimatedTokens: contextData.estimatedTokens,
      contextPreview: contextData.text?.slice(0, 200),
    });

    // 7. Call OpenAI (RAG - Generation step)
    console.log("[summarizeThread] Calling OpenAI API");
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective model
      messages: [
        {role: "system", content: SUMMARIZATION_SYSTEM_PROMPT},
        {role: "user", content: contextData.text},
      ],
      temperature: 0.3, // Lower temperature for more focused, consistent output
      max_tokens: 2000,
      response_format: {type: "json_object"}, // Enforce JSON response
    });

    console.log("[summarizeThread] OpenAI response received", {
      finishReason: completion.choices?.[0]?.finish_reason,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });

    // 8. Parse and validate response
    const summaryText = completion.choices[0].message.content;
    let summary;

    try {
      summary = JSON.parse(summaryText);
    } catch (parseError) {
      console.error("[summarizeThread] Failed to parse OpenAI response", {
        error: parseError.message,
        response: summaryText,
      });
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate required fields
    if (!summary.keyPoints || !Array.isArray(summary.keyPoints)) {
      console.warn("[summarizeThread] Missing or invalid keyPoints");
      summary.keyPoints = [];
    }

    if (!summary.decisions || !Array.isArray(summary.decisions)) {
      console.warn("[summarizeThread] Missing or invalid decisions");
      summary.decisions = [];
    }

    if (!summary.actionItems || !Array.isArray(summary.actionItems)) {
      console.warn("[summarizeThread] Missing or invalid actionItems");
      summary.actionItems = [];
    }

    if (!summary.summary || typeof summary.summary !== "string") {
      console.warn("[summarizeThread] Missing or invalid summary text");
      summary.summary = "No summary available.";
    }

    // 9. Calculate participant stats from actual messages
    console.log("[summarizeThread] Calculating participant statistics");
    const participantCounts = {};
    messages.forEach((msg) => {
      const name = msg.senderName || "Unknown";
      participantCounts[name] = (participantCounts[name] || 0) + 1;
    });

    summary.participants = Object.entries(participantCounts)
        .map(([name, count]) => ({name, messageCount: count}))
        .sort((a, b) => b.messageCount - a.messageCount);

    console.log(`[summarizeThread] Found ${summary.participants.length} participants`);

    // 10. Prepare result data (what gets returned to client)
    const summaryResult = {
      keyPoints: summary.keyPoints,
      decisions: summary.decisions,
      actionItems: summary.actionItems,
      participants: summary.participants,
      summary: summary.summary,
      messageCount: messages.length,
      timeRange: {
        start: typeof messages[0].timestamp?.toMillis === "function" ?
          messages[0].timestamp.toMillis() :
          Number(messages[0].timestamp) || Date.now(),
        end: typeof messages[messages.length - 1].timestamp?.toMillis === "function" ?
          messages[messages.length - 1].timestamp.toMillis() :
          Number(messages[messages.length - 1].timestamp) || Date.now(),
      },
    };

    // 11. Store in cache (matching analyzePriorities pattern)
    console.log("[summarizeThread] Storing result in cache");
    await setCacheResult(chatId, {
      type: "summary",
      result: summaryResult,
      metadata: {
        chatId,
        messageCount: messages.length,
        keyPointsCount: summary.keyPoints.length,
        decisionsCount: summary.decisions.length,
        actionItemsCount: summary.actionItems.length,
        participantsCount: summary.participants.length,
        model: "gpt-4o-mini",
        tokenCount: contextData.estimatedTokens,
      },
    });

    // 12. Increment rate limit counter
    await incrementRateLimit(userId, "summarize");

    const elapsedTime = Date.now() - startTime;
    console.log(`[summarizeThread] Success (${elapsedTime}ms)`, {
      keyPointsCount: summary.keyPoints.length,
      decisionsCount: summary.decisions.length,
      actionItemsCount: summary.actionItems.length,
      participantsCount: summary.participants.length,
      cached: false,
    });

    return {
      success: true,
      cached: false,
      ...summaryResult,
      processingTime: elapsedTime,
    };
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[summarizeThread] Error (${elapsedTime}ms)`, {
      error: error.message,
      code: error.code,
      status: error.status,
      name: error.name,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack,
    });

    // Handle specific error types
    if (error.code && error.code.startsWith("functions/")) {
      // Already a Firebase HttpsError, rethrow
      throw error;
    }

    // Convert to user-friendly error
    const errorResponse = handleAIError(error, "summarizeThread");
    console.log("[summarizeThread] Returning handled error", errorResponse);
    throw new functions.https.HttpsError(
        "internal",
        errorResponse.message,
        errorResponse,
    );
  }
});

