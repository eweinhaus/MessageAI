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
const pLimit = require("p-limit");
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
const {
  UNREAD_SUMMARIZATION_SYSTEM_PROMPT,
} = require("./prompts/threadSummarization");

/**
 * Build message context with [UNREAD], [READ], [SELF] markers
 * @param {Array} contextMessages - All messages (with context)
 * @param {Set} unreadIds - Set of unread message IDs
 * @param {string} currentUserId - Current user ID
 * @return {string} Formatted context with markers
 */
function buildUnreadMarkedContext(contextMessages, unreadIds, currentUserId) {
  return contextMessages.map((m) => {
    const ts = m.timestamp?.toMillis ? m.timestamp.toMillis() :
      (typeof m.timestamp === "number" ? m.timestamp : null);
    const timeStr = ts ?
      new Date(ts).toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit"}) :
      "--:--";
    const isSelf = m.senderID === currentUserId;
    const isUnread = unreadIds.has(m.messageID);
    const marker = isUnread ? "[UNREAD]" : "[READ]";
    const selfTag = isSelf ? " [SELF]" : "";
    const sender = m.senderName || m.senderEmail || "Unknown";
    const text = m.text || m.message || "";
    return `${marker}${selfTag} [${timeStr}] ${sender}: ${text}`;
  }).join("\n");
}

/**
 * Generate summary for a single chat with hybrid context approach
 * @param {string} chatId - Chat ID
 * @param {Array} unreadMessages - Array of unread message objects
 * @param {string} chatName - Chat display name
 * @param {string} currentUserId - Current user ID
 * @param {string} currentUserName - Current user name for context
 * @param {string} mode - "fast" (unread only) or "rich" (context included)
 * @return {Promise<Object>} Summary with keyPoints, decisions, actionItems, etc.
 */
async function generateSummaryForChat(chatId, unreadMessages, chatName, currentUserId, currentUserName, mode = "rich") {
  console.log(`[summarizeUnread] Generating ${mode} summary for chat ${chatId} (${unreadMessages.length} unread messages)`);

  const unreadIds = new Set(unreadMessages.map((m) => m.messageID).filter(Boolean));

  // Normalize entry helper
  const normalizeEntry = (entry, fallbackKey) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return {...entry};
    }
    if (entry === undefined || entry === null) {
      return {[fallbackKey]: ""};
    }
    return {[fallbackKey]: String(entry)};
  };

  // Ensure at least one key point fallback
  const ensureKeyPoint = (summary) => {
    if (!Array.isArray(summary.keyPoints) || summary.keyPoints.length === 0) {
      const lastUnread = unreadMessages[unreadMessages.length - 1];
      const fallback = lastUnread?.text ?
        `${lastUnread.senderName || "Someone"}: ${lastUnread.text.slice(0, 140)}` :
        "New activity in this chat";
      summary.keyPoints = [{text: fallback, chatName}];
    }
  };

  let contextText;
  let systemPrompt;

  // FAST MODE: Unread only with enhanced prompt
  if (mode === "fast") {
    const contextData = buildMessageContext(unreadMessages, {format: "detailed", maxMessages: 30});
    contextText = contextData.text;
    systemPrompt = UNREAD_SUMMARIZATION_SYSTEM_PROMPT;
  } else {
    // RICH MODE: Unread + up to 6 preceding messages for context
    try {
      // Get first unread message's timestamp (safety check for empty array)
      if (unreadMessages.length === 0) {
        console.log(`[summarizeUnread] No unread messages for ${chatId}, skipping`);
        return null;
      }

      const firstUnreadTimestamp = unreadMessages[0].timestamp;
      console.log(`[summarizeUnread] First unread at ${firstUnreadTimestamp?.toMillis?.() || firstUnreadTimestamp}`);

      // Fetch up to 6 messages that came BEFORE the first unread
      const db = admin.firestore();
      const messagesRef = db.collection("chats").doc(chatId).collection("messages");

      const previousMessagesQuery = messagesRef
          .where("timestamp", "<", firstUnreadTimestamp)
          .orderBy("timestamp", "desc")
          .limit(6);

      const previousSnap = await previousMessagesQuery.get();

      // Reverse to get chronological order (oldest first)
      const previousMessages = previousSnap.docs
          .map((doc) => ({messageID: doc.id, ...doc.data()}))
          .reverse();

      console.log(`[summarizeUnread] Fetched ${previousMessages.length} previous messages for context`);

      // Combine: previous (read) + unread (chronological order)
      const contextMessages = [...previousMessages, ...unreadMessages];

      // Build marked context
      contextText = buildUnreadMarkedContext(contextMessages, unreadIds, currentUserId);
      systemPrompt = UNREAD_SUMMARIZATION_SYSTEM_PROMPT;
    } catch (error) {
      console.warn(`[summarizeUnread] Failed to fetch context for ${chatId}, falling back to unread only:`, error.message);
      // Fallback to fast mode
      const contextData = buildMessageContext(unreadMessages, {format: "detailed", maxMessages: 30});
      contextText = contextData.text;
      systemPrompt = UNREAD_SUMMARIZATION_SYSTEM_PROMPT;
    }
  }

  console.log(`[summarizeUnread] Context ready for ${chatId}, estimated tokens: ${Math.ceil(contextText.length / 4)}`);

  // Call OpenAI
  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {role: "system", content: systemPrompt},
      {role: "user", content: contextText},
    ],
    temperature: 0.2, // Lower for more consistency
    max_tokens: mode === "fast" ? 1200 : 1500,
    response_format: {type: "json_object"},
  });

  console.log(`[summarizeUnread] OpenAI response for ${chatId}:`, {
    finishReason: completion.choices?.[0]?.finish_reason,
    totalTokens: completion.usage?.total_tokens,
  });

  // Parse response
  let summary = {};
  try {
    summary = JSON.parse(completion.choices[0].message.content || "{}");
  } catch (parseError) {
    console.error(`[summarizeUnread] Parse error for ${chatId}:`, parseError.message);
    summary = {keyPoints: [], decisions: [], actionItems: [], summary: `New updates in ${chatName}`};
  }

  // Ensure at least one key point
  ensureKeyPoint(summary);

  // Validate and normalize structure
  const keyPoints = (summary.keyPoints || []).map((p) => ({
    ...normalizeEntry(p, "text"),
    chatId,
    chatName,
  }));
  const decisions = (summary.decisions || []).map((d) => ({
    ...normalizeEntry(d, "text"),
    chatId,
    chatName,
  }));
  const actionItems = (summary.actionItems || []).map((a) => ({
    ...normalizeEntry(a, "task"),
    chatId,
    chatName,
  }));

  return {
    chatId,
    chatName,
    summary: typeof summary.summary === "string" ? summary.summary : `New updates in ${chatName}`,
    keyPoints,
    decisions,
    actionItems,
    messageCount: unreadMessages.length,
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

  const {forceRefresh = false, mode = "rich"} = request.data || {};
  const userId = request.auth?.uid;

  console.log("[summarizeUnread] Function invoked", {
    forceRefresh,
    mode,
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

    // 8. Summarize each chat with unread messages (parallelized)
    console.log("[summarizeUnread] Generating summaries for each chat");
    const limit = pLimit(8); // Process up to 8 chats in parallel
    const chatSummaries = [];

    const summaryPromises = allChats
        .filter((chat) => unreadByChat[chat.chatID])
        .map((chat) => limit(async () => {
          const chatId = chat.chatID;
          const chatName = getChatName(chat);
          try {
            const summary = await generateSummaryForChat(
                chatId,
                unreadByChat[chatId],
                chatName,
                userId,
                currentUserName,
                mode,
            );
            return summary;
          } catch (error) {
            console.error(`[summarizeUnread] Error summarizing ${chatId}:`, error.message);
            return null;
          }
        }));

    const results = await Promise.all(summaryPromises);

    // Filter out null results
    chatSummaries.push(...results.filter((s) => s !== null));

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

