/**
 * Global Unread Summarization Cloud Function
 *
 * Provides delta-based summarization across all chats:
 * 1. Fetch watermarks (last processed message per chat)
 * 2. Query only new messages since watermark
 * 3. Summarize each chat with unread messages
 * 4. Merge all summaries into global view
 * 5. Update watermarks and cache result
 */

/* eslint-disable max-len */
const functions = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  checkRateLimit,
  incrementRateLimit,
} = require("./utils/rateLimiter");
const {getCachedResult, setCacheResult} = require("./utils/cacheUtils");
const {
  buildMessageContext,
  getOpenAIClient,
} = require("./utils/aiUtils");
const {handleAIError} = require("./utils/errors");
const {SUMMARIZATION_SYSTEM_PROMPT} = require("./prompts/threadSummarization");

/**
 * Generate summary for a single chat (extracted from summarizeThread logic)
 * @param {string} chatId - Chat ID
 * @param {Array} messages - Array of message objects
 * @param {string} chatName - Chat display name
 * @param {string} currentUserId - Current user ID to filter out their messages
 * @param {string} currentUserName - Current user name for context
 * @return {Promise<Object>} Summary with keyPoints, decisions, actionItems, etc.
 */
async function generateSummaryForChat(chatId, messages, chatName, currentUserId, currentUserName) {
  console.log(`[summarizeUnread] Generating summary for chat ${chatId} (${messages.length} messages)`);

  // Filter out messages sent by current user (don't summarize what they sent)
  const incomingMessages = messages.filter((msg) => msg.senderID !== currentUserId);

  console.log(`[summarizeUnread] Filtered to ${incomingMessages.length} incoming messages (excluding ${currentUserName}'s sent messages)`);

  // If no incoming messages, return empty summary
  if (incomingMessages.length === 0) {
    console.log(`[summarizeUnread] No incoming messages in ${chatId}, skipping summary`);
    return null;
  }

  // Build context (reuse from summarizeThread)
  const contextData = buildMessageContext(incomingMessages, {format: "detailed"});

  console.log(`[summarizeUnread] Context built for ${chatId}:`, {
    messageCount: contextData.messageCount,
    estimatedTokens: contextData.estimatedTokens,
  });

  // Call OpenAI
  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {role: "system", content: SUMMARIZATION_SYSTEM_PROMPT},
      {role: "user", content: contextData.text},
    ],
    temperature: 0.3,
    max_tokens: 1500, // Slightly lower for individual chat summaries
    response_format: {type: "json_object"},
  });

  console.log(`[summarizeUnread] OpenAI response received for ${chatId}:`, {
    finishReason: completion.choices?.[0]?.finish_reason,
    totalTokens: completion.usage?.total_tokens,
  });

  // Parse response
  const summaryText = completion.choices[0].message.content;
  let summary;

  try {
    summary = JSON.parse(summaryText);
  } catch (parseError) {
    console.error(`[summarizeUnread] Failed to parse response for ${chatId}:`, parseError.message);
    throw new Error("Failed to parse AI response as JSON");
  }

  // Validate and set defaults
  if (!summary.keyPoints || !Array.isArray(summary.keyPoints)) {
    summary.keyPoints = [];
  }
  if (!summary.decisions || !Array.isArray(summary.decisions)) {
    summary.decisions = [];
  }
  if (!summary.actionItems || !Array.isArray(summary.actionItems)) {
    summary.actionItems = [];
  }
  if (!summary.summary || typeof summary.summary !== "string") {
    summary.summary = "No summary available.";
  }

  const normalizeEntry = (entry, fallbackKey) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return {...entry};
    }

    if (entry === undefined || entry === null) {
      return {[fallbackKey]: ""};
    }

    return {[fallbackKey]: String(entry)};
  };

  // Add chat context to each item and normalize structure
  summary.keyPoints = summary.keyPoints.map((point) => ({
    ...normalizeEntry(point, "text"),
    chatId,
    chatName,
  }));
  summary.decisions = summary.decisions.map((decision) => ({
    ...normalizeEntry(decision, "text"),
    chatId,
    chatName,
  }));
  summary.actionItems = summary.actionItems.map((item) => ({
    ...normalizeEntry(item, "task"),
    chatId,
    chatName,
  }));

  return {
    chatId,
    chatName,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    decisions: summary.decisions,
    actionItems: summary.actionItems,
    messageCount: messages.length,
  };
}

/**
 * Merge multiple chat summaries into one global summary
 * @param {Array} chatSummaries - Array of individual chat summaries
 * @return {Object} Merged summary
 */
function mergeSummaries(chatSummaries) {
  console.log(`[summarizeUnread] Merging ${chatSummaries.length} chat summaries`);

  const merged = {
    summary: "",
    keyPoints: [],
    decisions: [],
    actionItems: [],
    chatCount: chatSummaries.length,
    totalMessageCount: 0,
    chats: [],
  };

  // Build high-level summary text
  const chatNames = chatSummaries.map((s) => s.chatName).join(", ");
  merged.summary = `You have unread messages in ${chatSummaries.length} chat(s): ${chatNames}. `;

  chatSummaries.forEach((chatSummary) => {
    // Aggregate counts
    merged.totalMessageCount += chatSummary.messageCount;

    // Collect all items (already have chatId/chatName attached)
    merged.keyPoints.push(...chatSummary.keyPoints);
    merged.decisions.push(...chatSummary.decisions);
    merged.actionItems.push(...chatSummary.actionItems);

    // Store chat summaries
    merged.chats.push({
      chatId: chatSummary.chatId,
      chatName: chatSummary.chatName,
      summary: chatSummary.summary,
      messageCount: chatSummary.messageCount,
    });
  });

  console.log("[summarizeUnread] Merged result:", {
    chatCount: merged.chatCount,
    totalMessages: merged.totalMessageCount,
    keyPoints: merged.keyPoints.length,
    decisions: merged.decisions.length,
    actionItems: merged.actionItems.length,
  });

  return merged;
}

/**
 * Summarize all unread messages across user's chats
 *
 * @param {Object} request - Firebase Functions v2 request object
 * @param {Object} request.data - Request data
 * @param {boolean} [request.data.forceRefresh=false] - Skip cache and regenerate
 * @param {Object} request.auth - Firebase auth context
 * @returns {Promise<Object>} Global summary or {hasUnread: false}
 */
exports.summarizeUnread = onCall(async (request) => {
  const startTime = Date.now();

  const {forceRefresh = false} = request.data || {};
  const userId = request.auth?.uid;

  console.log("[summarizeUnread] Function invoked", {
    forceRefresh,
    userId,
    hasAuth: !!request.auth,
  });

  // 1. Authentication check
  if (!userId) {
    console.warn("[summarizeUnread] Unauthenticated request");
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to use AI features",
    );
  }

  try {
    // 2. Rate limiting (5 operations per hour for global features)
    console.log(`[summarizeUnread] Checking rate limit for user ${userId}`);
    await checkRateLimit(userId, "summarizeGlobal");

    // 3. Check cache (skip if forceRefresh)
    if (!forceRefresh) {
      console.log("[summarizeUnread] Checking cache");
      const cached = await getCachedResult(userId, "summaryGlobal", {
        maxAge: 900000, // 15 minutes (shorter for global to keep fresh)
      });

      if (cached && cached.result) {
        const elapsedTime = Date.now() - startTime;
        console.log(`[summarizeUnread] Cache hit (${elapsedTime}ms)`);
        return {
          success: true,
          cached: true,
          ...cached.result,
          cacheAge: cached.age,
        };
      }
      console.log("[summarizeUnread] Cache miss");
    } else {
      console.log("[summarizeUnread] Skipping cache (forceRefresh=true)");
    }

    // 4. Fetch watermarks
    console.log("[summarizeUnread] Fetching watermarks");
    const db = admin.firestore();
    const watermarkRef = db.collection("users").doc(userId).collection("aiCache").doc("watermarks");
    const watermarkSnap = await watermarkRef.get();

    let watermarks = {};
    if (watermarkSnap.exists) {
      const data = watermarkSnap.data();
      // eslint-disable-next-line no-unused-vars
      const {updatedAt, ...marks} = data;
      watermarks = marks;
      console.log(`[summarizeUnread] Found watermarks for ${Object.keys(watermarks).length} chats`);
    } else {
      console.log("[summarizeUnread] No watermarks found (first run)");
    }

    // 5. Fetch current user's name
    console.log("[summarizeUnread] Fetching current user profile");
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const currentUserName = userSnap.exists ? userSnap.data().displayName : "You";
    console.log(`[summarizeUnread] Current user name: ${currentUserName}`);

    // 6. Fetch user's chats
    console.log("[summarizeUnread] Fetching user chats");
    const chatsRef = db.collection("chats");

    // Query for 1:1 chats
    const oneOnOneQuery = chatsRef.where("participantIDs", "array-contains", userId);
    // Query for group chats
    const groupQuery = chatsRef.where("memberIDs", "array-contains", userId);

    const [oneOnOneSnap, groupSnap] = await Promise.all([
      oneOnOneQuery.get(),
      groupQuery.get(),
    ]);

    const allChats = [];
    oneOnOneSnap.forEach((doc) => allChats.push(doc.data()));
    groupSnap.forEach((doc) => allChats.push(doc.data()));

    console.log(`[summarizeUnread] Found ${allChats.length} chats for user`);

    if (allChats.length === 0) {
      console.log("[summarizeUnread] No chats found");
      return {success: true, hasUnread: false};
    }

    // 7. Fetch truly unread messages per chat (using readBy array)
    console.log("[summarizeUnread] Fetching unread messages (checking readBy status)");
    const unreadByChat = {};
    const newWatermarks = {};

    // Process in batches of 5 to avoid overwhelming Firestore
    const BATCH_SIZE = 5;
    for (let i = 0; i < allChats.length; i += BATCH_SIZE) {
      const batch = allChats.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (chat) => {
        const chatId = chat.chatID;
        const watermark = watermarks[chatId] || 0;

        try {
          const messagesRef = db.collection("chats").doc(chatId).collection("messages");

          // Query for messages that:
          // 1. Are newer than last summary (watermark) OR recent (last 7 days)
          // 2. User hasn't read yet (userId not in readBy array)
          // 3. Not sent by the user themselves

          // First, get recent messages since watermark
          const recentTimestamp = Math.max(
              watermark,
              Date.now() - (7 * 24 * 60 * 60 * 1000), // Last 7 days as fallback
          );

          const messagesQuery = messagesRef
              .where("timestamp", ">", admin.firestore.Timestamp.fromMillis(recentTimestamp))
              .orderBy("timestamp", "asc")
              .limit(50); // Fetch more, filter client-side

          const messagesSnap = await messagesQuery.get();

          if (!messagesSnap.empty) {
            // Filter to messages not read by current user
            const allMessages = messagesSnap.docs.map((doc) => doc.data());
            const unreadMessages = allMessages.filter((msg) => {
              const readBy = msg.readBy || [];
              return !readBy.includes(userId) && msg.senderID !== userId;
            });

            if (unreadMessages.length > 0) {
              unreadByChat[chatId] = unreadMessages;

              // DON'T update watermark when unread messages exist
              // We want to keep checking for these messages until they're read
              console.log(`[summarizeUnread] Found ${unreadMessages.length} unread (not in readBy) in chat ${chatId} - NOT updating watermark`);
            } else {
              // NO unread messages in this chat - update watermark so we don't reprocess
              const lastMessage = allMessages[allMessages.length - 1];
              const lastTimestamp = lastMessage?.timestamp?.toMillis ?
                lastMessage.timestamp.toMillis() :
                (typeof lastMessage?.timestamp === "number" ? lastMessage.timestamp : null);
              if (typeof lastTimestamp === "number" && !Number.isNaN(lastTimestamp)) {
                newWatermarks[chatId] = lastTimestamp;
                console.log(`[summarizeUnread] No unread messages in chat ${chatId} - updating watermark to ${lastTimestamp}`);
              }
            }
          }
        } catch (error) {
          console.warn(`[summarizeUnread] Error fetching messages for ${chatId}:`, error.message);
          // Continue with other chats
        }
      }));
    }

    const unreadChatCount = Object.keys(unreadByChat).length;
    console.log(`[summarizeUnread] Found unread messages in ${unreadChatCount} chat(s)`);

    if (unreadChatCount === 0) {
      console.log("[summarizeUnread] No unread messages");
      return {success: true, hasUnread: false};
    }

    // 7. Generate chat names
    const getChatName = (chat) => {
      if (chat.type === "group") {
        return chat.groupName || "Group Chat";
      }
      // For 1:1, get other participant's name
      const otherIndex = chat.participantIDs?.indexOf(userId) === 0 ? 1 : 0;
      return chat.participantNames?.[otherIndex] || "Unknown";
    };

    // 8. Summarize each chat with unread messages
    console.log("[summarizeUnread] Generating summaries for each chat");
    const chatSummaries = [];

    for (const chat of allChats) {
      const chatId = chat.chatID;
      if (unreadByChat[chatId]) {
        const chatName = getChatName(chat);
        const summary = await generateSummaryForChat(
            chatId,
            unreadByChat[chatId],
            chatName,
            userId,
            currentUserName,
        );
        // Only include non-null summaries (skip if all messages were from current user)
        if (summary) {
          chatSummaries.push(summary);
        }
      }
    }

    console.log(`[summarizeUnread] Generated ${chatSummaries.length} chat summaries`);

    // If no summaries after filtering, return no unread
    if (chatSummaries.length === 0) {
      console.log("[summarizeUnread] No incoming messages to summarize (all were from current user)");
      return {success: true, hasUnread: false};
    }

    // 9. Merge all summaries
    const mergedSummary = mergeSummaries(chatSummaries);

    // 10. Update watermarks
    console.log("[summarizeUnread] Updating watermarks");
    await watermarkRef.set({
      ...newWatermarks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    // 11. Cache result (note: must filter undefined values)
    console.log("[summarizeUnread] Caching result");
    const resultToCache = {
      hasUnread: true,
      summary: mergedSummary.summary,
      chatCount: mergedSummary.chatCount,
      totalMessageCount: mergedSummary.totalMessageCount,
      chats: mergedSummary.chats,
    };

    // Only add arrays if they have items (avoid empty arrays being undefined)
    if (mergedSummary.keyPoints.length > 0) {
      resultToCache.keyPoints = mergedSummary.keyPoints;
    }
    if (mergedSummary.decisions.length > 0) {
      resultToCache.decisions = mergedSummary.decisions;
    }
    if (mergedSummary.actionItems.length > 0) {
      resultToCache.actionItems = mergedSummary.actionItems;
    }

    await setCacheResult(userId, {
      type: "summaryGlobal",
      result: resultToCache,
      metadata: {
        userId,
        chatCount: mergedSummary.chatCount,
        totalMessageCount: mergedSummary.totalMessageCount,
        model: "gpt-4o-mini",
      },
    });

    // 12. Increment rate limit
    await incrementRateLimit(userId, "summarizeGlobal");

    const elapsedTime = Date.now() - startTime;
    console.log(`[summarizeUnread] Success (${elapsedTime}ms)`);

    return {
      success: true,
      cached: false,
      ...mergedSummary,
      hasUnread: true,
      processingTime: elapsedTime,
    };
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[summarizeUnread] Error (${elapsedTime}ms)`, {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });

    if (error.code && error.code.startsWith("functions/")) {
      throw error;
    }

    const errorResponse = handleAIError(error, "summarizeUnread");
    console.log("[summarizeUnread] Returning handled error", errorResponse);
    throw new functions.https.HttpsError(
        "internal",
        errorResponse.message,
        errorResponse,
    );
  }
});

