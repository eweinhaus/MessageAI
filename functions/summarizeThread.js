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
const admin = require("firebase-admin");
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
 * @param {Object} data - Request data
 * @param {string} data.chatId - Chat ID to summarize
 * @param {number} [data.messageCount=50] - Number of recent messages to analyze
 * @param {boolean} [data.forceRefresh=false] - Skip cache and generate new summary
 * @param {Object} context - Firebase function context
 * @returns {Promise<Object>} Summary with keyPoints, decisions, actionItems, etc.
 */
exports.summarizeThread = onCall(async (data, context) => {
  console.log("[summarizeThread] Function invoked", {
    chatId: data.chatId,
    messageCount: data.messageCount,
    forceRefresh: data.forceRefresh,
    userId: context.auth?.uid,
  });

  // 1. Authentication check
  if (!context.auth) {
    console.warn("[summarizeThread] Unauthenticated request");
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to use AI features",
    );
  }

  const {chatId, messageCount = 50, forceRefresh = false} = data;
  const userId = context.auth.uid;

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

  const startTime = Date.now();

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

      if (cached) {
        const elapsedTime = Date.now() - startTime;
        console.log(`[summarizeThread] Cache hit (${elapsedTime}ms)`);
        return {
          success: true,
          cached: true,
          ...cached,
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

    console.log(`[summarizeThread] Retrieved ${messages.length} messages`);

    // 6. Build context (RAG - Augmentation step)
    console.log("[summarizeThread] Building message context");
    const messageContext = buildMessageContext(messages, {format: "detailed"});

    // 7. Call OpenAI (RAG - Generation step)
    console.log("[summarizeThread] Calling OpenAI API");
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective model
      messages: [
        {role: "system", content: SUMMARIZATION_SYSTEM_PROMPT},
        {role: "user", content: messageContext},
      ],
      temperature: 0.3, // Lower temperature for more focused, consistent output
      max_tokens: 2000,
      response_format: {type: "json_object"}, // Enforce JSON response
    });

    console.log("[summarizeThread] OpenAI response received");

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

    // 10. Prepare cache data
    const cacheData = {
      type: "summary",
      chatId,
      keyPoints: summary.keyPoints,
      decisions: summary.decisions,
      actionItems: summary.actionItems,
      participants: summary.participants,
      summary: summary.summary,
      messageCount: messages.length,
      timeRange: {
        start: messages[0].timestamp.toMillis(),
        end: messages[messages.length - 1].timestamp.toMillis(),
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 11. Store in cache
    console.log("[summarizeThread] Storing result in cache");
    await setCacheResult(chatId, cacheData);

    // 12. Increment rate limit counter
    await incrementRateLimit(userId, "summarize");

    const elapsedTime = Date.now() - startTime;
    console.log(`[summarizeThread] Success (${elapsedTime}ms)`, {
      keyPointsCount: summary.keyPoints.length,
      decisionsCount: summary.decisions.length,
      actionItemsCount: summary.actionItems.length,
      participantsCount: summary.participants.length,
    });

    return {
      success: true,
      cached: false,
      ...cacheData,
      processingTime: elapsedTime,
    };
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[summarizeThread] Error (${elapsedTime}ms)`, {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Handle specific error types
    if (error.code && error.code.startsWith("functions/")) {
      // Already a Firebase HttpsError, rethrow
      throw error;
    }

    // Convert to user-friendly error
    const errorResponse = handleAIError(error, "summarizeThread");
    throw new functions.https.HttpsError(
        "internal",
        errorResponse.message,
        errorResponse,
    );
  }
});

