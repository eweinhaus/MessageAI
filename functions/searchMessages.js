/**
 * Two-Stage Global Smart Search Cloud Function
 *
 * Stage 1: Fast search (last 500 messages, GPT-4o-mini)
 * Stage 2: Deep search (last 5000 messages, GPT-4o-mini)
 *
 * Semantic search using GPT-4 to find messages by meaning, not just keywords.
 */

/* eslint-disable max-len */
const functions = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {checkRateLimit, incrementRateLimit} = require("./utils/rateLimiter");
const {getCachedResult, setCacheResult} = require("./utils/cacheUtils");
const {getOpenAIClient} = require("./utils/aiUtils");
const {handleAIError} = require("./utils/errors");

/**
 * Search system prompt
 */
const SEARCH_SYSTEM_PROMPT = `You are an expert at semantic search in workplace conversations.

Your task: Find the most relevant messages for a given search query.

Rules:
1. Match by MEANING, not just keywords
2. Consider synonyms, related concepts, and context
3. Rank by relevance (most relevant first)
4. Provide a brief reason for each match

Input format:
- Query: The user's search query
- Messages: Numbered list of messages with sender, chat, and content

Output format (JSON only):
{
  "results": [
    {
      "index": 0,
      "relevance": 0.95,
      "reason": "Direct discussion of deployment timeline",
      "chatName": "Engineering Team"
    }
  ]
}

Relevance scoring:
- 0.9-1.0: Directly answers query or is central topic
- 0.7-0.8: Related discussion or supporting context
- 0.5-0.6: Tangentially related
- Below 0.5: Don't include

Return top 10 results maximum, sorted by relevance (highest first).`;

/**
 * Build numbered context for search
 * @param {Array} messages - Array of message objects
 * @return {string} Formatted context
 */
function buildSearchContext(messages) {
  return messages.map((msg, index) => {
    const sender = msg.senderName || "Unknown";
    const chat = msg.chatName || "Unknown Chat";
    const text = msg.text || "";
    const timestamp = msg.timestamp?.toDate?.() || new Date(msg.timestamp || Date.now());
    const timeStr = timestamp.toLocaleString();

    return `${index}. [${chat}] ${sender} at ${timeStr}: ${text}`;
  }).join("\n");
}

/**
 * Fetch messages across all user's chats
 * @param {string} userId - User ID
 * @param {number} limit - Max messages per chat
 * @param {number} chatLimit - Max chats to search
 * @return {Promise<Array>} Array of messages with chat info
 */
async function fetchMessagesAcrossChats(userId, limit, chatLimit) {
  const db = admin.firestore();

  // Get user's chats
  const chatsRef = db.collection("chats");
  const oneOnOneQuery = chatsRef.where("participantIDs", "array-contains", userId).limit(chatLimit);
  const groupQuery = chatsRef.where("memberIDs", "array-contains", userId).limit(chatLimit);

  const [oneOnOneSnap, groupSnap] = await Promise.all([
    oneOnOneQuery.get(),
    groupQuery.get(),
  ]);

  const allChats = [];
  oneOnOneSnap.forEach((doc) => allChats.push(doc.data()));
  groupSnap.forEach((doc) => allChats.push(doc.data()));

  console.log(`[searchMessages] Found ${allChats.length} chats for user`);

  // Fetch recent messages from each chat
  const messagePromises = allChats.map(async (chat) => {
    const chatId = chat.chatID;
    const chatName = chat.type === "group" ?
      chat.groupName :
      chat.participantNames?.[chat.participantIDs.indexOf(userId) === 0 ? 1 : 0] || "Unknown";

    const messagesSnap = await db.collection("chats").doc(chatId).collection("messages")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

    const messages = [];
    messagesSnap.forEach((doc) => {
      const data = doc.data();
      messages.push({
        messageID: doc.id,
        chatID: chatId,
        chatName,
        ...data,
      });
    });

    return messages;
  });

  const chatMessages = await Promise.all(messagePromises);
  const allMessages = chatMessages.flat();

  console.log(`[searchMessages] Fetched ${allMessages.length} total messages`);

  return allMessages;
}

/**
 * Perform semantic search with OpenAI
 * @param {string} query - Search query
 * @param {Array} messages - Messages to search
 * @param {string} stage - "stage1" or "stage2"
 * @return {Promise<Array>} Search results
 */
async function performSearch(query, messages, stage) {
  const context = buildSearchContext(messages);
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {role: "system", content: SEARCH_SYSTEM_PROMPT},
      {role: "user", content: `Query: "${query}"\n\nMessages:\n${context}`},
    ],
    temperature: 0.3,
    max_tokens: stage === "stage1" ? 1000 : 2000,
    response_format: {type: "json_object"},
  });

  const parsed = JSON.parse(completion.choices[0].message.content || "{}");
  const results = parsed.results || [];

  // Map indices to actual messages
  return results.map((r) => {
    const message = messages[r.index];
    if (!message) return null;

    return {
      messageID: message.messageID,
      chatID: message.chatID,
      chatName: message.chatName,
      text: message.text,
      senderName: message.senderName,
      timestamp: message.timestamp?.toMillis?.() || message.timestamp || Date.now(),
      relevance: r.relevance || 0.5,
      reason: r.reason || "Relevant to query",
    };
  }).filter((r) => r !== null);
}

/**
 * Global Smart Search Cloud Function
 * @param {Object} request - Request object
 * @param {string} request.data.query - Search query
 * @param {string} request.data.stage - "stage1" (fast) or "stage2" (deep)
 * @return {Promise<Object>} Search results
 */
exports.searchMessages = onCall(async (request) => {
  const startTime = Date.now();
  const {query, stage = "stage1"} = request.data || {};
  const userId = request.auth?.uid;

  console.log("[searchMessages] Function invoked", {query, stage, userId});

  // Authentication
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // Validation
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    throw new functions.https.HttpsError("invalid-argument", "Query must be at least 2 characters");
  }

  if (!["stage1", "stage2"].includes(stage)) {
    throw new functions.https.HttpsError("invalid-argument", "Stage must be 'stage1' or 'stage2'");
  }

  try {
    // Rate limiting
    await checkRateLimit(userId, "search");

    // Check cache (short TTL for search)
    const cacheKey = `${query}-${stage}`;
    const cached = await getCachedResult(userId, `search-${cacheKey}`, {
      maxAge: 300000, // 5 minutes
    });

    if (cached && cached.result) {
      console.log(`[searchMessages] Cache hit for ${stage}`);
      return {
        success: true,
        cached: true,
        stage,
        ...cached.result,
      };
    }

    // Fetch messages based on stage
    const messagesPerChat = stage === "stage1" ? 10 : 100; // Stage1: 10 msgs/chat, Stage2: 100 msgs/chat
    const chatLimit = stage === "stage1" ? 50 : 50; // Max 50 chats

    const messages = await fetchMessagesAcrossChats(userId, messagesPerChat, chatLimit);

    if (messages.length === 0) {
      return {
        success: true,
        stage,
        results: [],
        totalMessages: 0,
      };
    }

    // Perform search
    const results = await performSearch(query, messages, stage);

    // Cache result
    await setCacheResult(userId, {
      type: `search-${cacheKey}`,
      result: {
        query,
        results,
        totalMessages: messages.length,
      },
      metadata: {
        userId,
        stage,
        model: "gpt-4o-mini",
      },
    });

    // Increment rate limit
    await incrementRateLimit(userId, "search");

    const elapsedTime = Date.now() - startTime;
    console.log(`[searchMessages] Success (${elapsedTime}ms), ${results.length} results`);

    return {
      success: true,
      cached: false,
      stage,
      query,
      results,
      totalMessages: messages.length,
      processingTime: elapsedTime,
    };
  } catch (error) {
    console.error("[searchMessages] Error:", error);
    const errorResponse = handleAIError(error, "searchMessages");
    throw new functions.https.HttpsError("internal", errorResponse.message, errorResponse);
  }
});

