/**
 * Search Utilities Module
 *
 * Provides semantic search functionality for messages using OpenAI GPT-4.
 * Supports Approach A (prompt-based semantic matching) with future
 * extensibility for Approach B (vector embeddings + cosine similarity).
 *
 * @module functions/utils/searchUtils
 */

const {getOpenAIClient, getLastNMessages} = require("./aiUtils");

/**
 * System prompt for semantic search
 */
// eslint-disable-next-line max-len
const SEARCH_SYSTEM_PROMPT = `You are an expert at semantic search in workplace conversations.

Your task: Find the most relevant messages for a given search query.

Rules:
1. Match by MEANING, not just keywords
2. Consider synonyms, related concepts, and context
3. Rank by relevance (most relevant first)
4. Provide a brief reason for each match

Input format:
- Query: The user's search query
- Messages: Numbered list of messages with sender and content

Output format (JSON only, no explanation):
{
  "results": [
    {
      "index": 0,
      "relevance": 0.95,
      "reason": "Direct discussion of deployment timeline"
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
 * Build numbered context string for search prompt
 * @param {Array} messages - Array of message objects
 * @return {string} Formatted context string
 */
function buildSearchContext(messages) {
  if (!messages || messages.length === 0) {
    return "No messages found.";
  }

  return messages.map((msg, index) => {
    const sender = msg.senderName || msg.senderEmail || "Unknown";
    const text = msg.text || msg.message || "";
    const tsDate = msg.timestamp ?
      (msg.timestamp.toDate ? msg.timestamp.toDate() : msg.timestamp) :
      null;
    const timestamp = tsDate ? new Date(tsDate).toLocaleString() : "";

    const tsStr = timestamp ? ` at ${timestamp}` : "";
    return `${index}. [${sender}${tsStr}]: ${text}`;
  }).join("\n");
}

/**
 * Parse JSON response from OpenAI, with fallback for malformed responses
 * @param {string} content - Raw response content
 * @return {Object} Parsed results object
 */
function parseSearchResponse(content) {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(content);
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed;
    }
  } catch (e) {
    // Fallback: try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.results && Array.isArray(parsed.results)) {
          return parsed;
        }
      } catch (e2) {
        // Continue to fallback
      }
    }
  }

  // If all parsing fails, return empty results
  console.warn("[Search Utils] Failed to parse search response:", content);
  return {results: []};
}

/**
 * Validate and sanitize search query
 * @param {string} query - User's search query
 * @return {string} Sanitized query
 * @throws {Error} If query is invalid
 */
function validateQuery(query) {
  if (!query || typeof query !== "string") {
    throw new Error("Search query must be a non-empty string");
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    throw new Error("Search query cannot be empty");
  }

  if (trimmed.length > 500) {
    throw new Error("Search query too long (max 500 characters)");
  }

  return trimmed;
}

/**
 * Perform semantic search using GPT-4 (Approach A)
 *
 * Fetches recent messages, sends to GPT-4 with search query,
 * returns ranked results with relevance scores and reasons.
 *
 * @param {string} chatId - Chat ID to search
 * @param {string} query - Search query (natural language)
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Max results to return
 * @param {number} [options.messageCount=100] - Max messages to search
 * @return {Promise<Array>} Array of result objects with message data
 *   + relevance
 */
async function semanticSearchSimple(chatId, query, options = {}) {
  const {limit = 10, messageCount = 100} = options;

  // Validate inputs
  const sanitizedQuery = validateQuery(query);

  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }

  if (limit < 1 || limit > 50) {
    throw new Error("Limit must be between 1 and 50");
  }

  if (messageCount < 10 || messageCount > 500) {
    throw new Error("Message count must be between 10 and 500");
  }

  // Fetch messages
  const logMsg = `[Search Utils] Fetching last ${messageCount} messages`;
  console.log(`${logMsg} from chat ${chatId}`);
  const messages = await getLastNMessages(chatId, messageCount);

  if (messages.length === 0) {
    console.log("[Search Utils] No messages found in chat");
    return [];
  }

  const searchLog = `[Search Utils] Searching ${messages.length} messages`;
  console.log(`${searchLog} for: "${sanitizedQuery}"`);

  // Build context
  const context = buildSearchContext(messages);

  // Check token estimate (rough check to prevent overflow)
  const estimatedTokens = Math.ceil(context.length / 4);
  if (estimatedTokens > 15000) {
    const warnMsg = "[Search Utils] Context is large " +
      `(${estimatedTokens} est. tokens), truncating...`;
    console.warn(warnMsg);
    // Truncate to last N messages that fit in budget
    const avgMsgLen = context.length / messages.length;
    const truncatedCount = Math.floor((15000 * 4) / avgMsgLen);

    return semanticSearchSimple(chatId, query, {
      limit,
      messageCount: truncatedCount,
    });
  }

  // Call OpenAI
  const openai = getOpenAIClient();

  const startTime = Date.now();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {role: "system", content: SEARCH_SYSTEM_PROMPT},
      {
        role: "user",
        content: `Query: "${sanitizedQuery}"\n\nMessages:\n${context}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const latency = Date.now() - startTime;
  console.log(`[Search Utils] OpenAI response in ${latency}ms`);

  // Parse response
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    console.error("[Search Utils] Empty response from OpenAI");
    return [];
  }

  const parsed = parseSearchResponse(content);

  // Map indices back to full message objects
  const results = parsed.results
      .filter((r) => {
        // Validate result structure
        const invalidIndex = typeof r.index !== "number" ||
          r.index < 0 ||
          r.index >= messages.length;
        if (invalidIndex) {
          console.warn(`[Search Utils] Invalid index ${r.index}`);
          return false;
        }
        const invalidRel = typeof r.relevance !== "number" ||
          r.relevance < 0 ||
          r.relevance > 1;
        if (invalidRel) {
          console.warn(`[Search Utils] Invalid relevance ${r.relevance}`);
          return false;
        }
        return true;
      })
      .slice(0, limit) // Enforce limit
      .map((r) => ({
        ...messages[r.index],
        relevance: r.relevance,
        reason: r.reason || "Relevant to your search",
      }));

  console.log(`[Search Utils] Returning ${results.length} results`);

  return results;
}

/**
 * Stub for vector embedding approach (Approach B - future)
 * @param {string} chatId - Chat ID
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @return {Promise<Array>} Results
 */
async function semanticSearchVector(chatId, query, options = {}) {
  const msg = "Vector search not yet implemented. " +
    "Use semanticSearchSimple for now.";
  throw new Error(msg);
}

module.exports = {
  semanticSearchSimple,
  semanticSearchVector,
  buildSearchContext,
  parseSearchResponse,
  validateQuery,
  SEARCH_SYSTEM_PROMPT,
};

