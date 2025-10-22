/**
 * AI Utilities Module
 *
 * Provides common utilities for AI-powered Cloud Functions including:
 * - OpenAI client initialization with retry logic
 * - Message context building for GPT-4
 * - Timestamp formatting
 * - Chat access validation
 * - Error handling
 *
 * @module functions/utils/aiUtils
 */

const {OpenAI} = require("openai");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Singleton OpenAI client instance
let openaiClient = null;

/**
 * Sleep utility for retry logic
 * @param {number} ms - Milliseconds to sleep
 * @return {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rough token count estimator (¾ character heuristic)
 * @param {string} text - Text to estimate
 * @return {number} Estimated token count
 */
function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length * 0.75);
}

/**
 * Custom error class for AI service errors
 * @extends Error
 */
class AIServiceError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode] - HTTP status code
   * @param {string} [code] - Error code
   */
  constructor(message, statusCode, code) {
    super(message);
    this.name = "AIServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Custom error class for validation errors
 * @extends Error
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   */
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Get initialized OpenAI client with retry logic and defaults
 * Returns cached singleton to avoid multiple initializations
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.model='gpt-4o-mini'] - Default model
 * @param {number} [options.temperature=0.3] - Default temperature
 * @param {number} [options.maxTokens=2000] - Default max tokens
 * @return {OpenAI} Configured OpenAI client instance
 * @throws {AIServiceError} If API key is not configured
 *
 * @example
 * const client = getOpenAIClient();
 * const response = await client.chat.completions.create({...});
 */
function getOpenAIClient(options = {}) {
  // Return cached instance if exists
  if (openaiClient) {
    return openaiClient;
  }

  // Try to get API key from environment variables (Cloud Functions v2)
  // or legacy functions.config() (deprecated but still supported)
  let apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    try {
      apiKey = functions.config().openai?.api_key;
    } catch (error) {
      // functions.config() not available in local environment
      // This is expected when running locally with .env
    }
  }

  if (!apiKey) {
    throw new AIServiceError(
        "OpenAI API key not configured. " +
        "Set OPENAI_API_KEY in /functions/.env for local development, " +
        "or use firebase functions:config:set " +
        "openai.api_key=\"...\" for deployment.",
        500,
        "MISSING_API_KEY",
    );
  }

  // Initialize client with defaults
  openaiClient = new OpenAI({
    apiKey: apiKey,
    maxRetries: 3, // Automatic retry with exponential backoff
    timeout: 60000, // 60 second timeout
  });

  // Store default options for reference
  openaiClient.defaultOptions = {
    model: options.model || "gpt-4o-mini",
    temperature: options.temperature !== undefined ? options.temperature : 0.3,
    maxTokens: options.maxTokens || 2000,
  };

  // Log initialization in development
  if (process.env.NODE_ENV === "development") {
    console.log("[AI] OpenAI client initialized with defaults:",
        openaiClient.defaultOptions);
  }

  return openaiClient;
}

/**
 * Build conversation context string from messages for GPT-4
 *
 * @param {Array<Object>} messages - Array of message objects
 * @param {string} messages[].text - Message text content
 * @param {number|Date|Object} messages[].timestamp - Message timestamp
 * @param {string} messages[].senderName - Name of sender
 * @param {Object} [options] - Formatting options
 * @param {number} [options.maxMessages=50] - Maximum messages to include
 * @param {'detailed'|'simple'} [options.format='detailed'] - Format style
 * @return {Object} Context object with text and metadata
 * @return {string} return.text - Formatted context string
 * @return {number} return.messageCount - Number of messages included
 * @return {number} return.estimatedTokens - Estimated token count
 * @throws {ValidationError} If messages array is invalid
 *
 * @example
 * const context = buildMessageContext(messages, {
 *   maxMessages: 30,
 *   format: 'detailed'
 * });
 * console.log(context.text); // "[14:30] Alice: Hello\n[14:31] Bob: Hi"
 */
function buildMessageContext(messages, options = {}) {
  // Validate input
  if (!Array.isArray(messages)) {
    throw new ValidationError("messages must be an array");
  }

  if (messages.length === 0) {
    return {
      text: "",
      messageCount: 0,
      estimatedTokens: 0,
    };
  }

  // Extract options with defaults
  const {maxMessages = 50, format = "detailed"} = options;

  // Get recent messages (last N)
  const recentMessages = messages.slice(-maxMessages);

  // Validate message structure and format each message
  const formattedLines = recentMessages.map((msg, index) => {
    // Validate required fields
    if (!msg.text || msg.text.trim() === "") {
      throw new ValidationError(
          `Message at index ${index} missing required field: text`,
      );
    }
    if (!msg.senderName) {
      throw new ValidationError(
          `Message at index ${index} missing required field: senderName`,
      );
    }

    // Format based on style
    if (format === "detailed") {
      const timeStr = formatTimestamp(msg.timestamp);
      return `[${timeStr}] ${msg.senderName}: ${msg.text}`;
    } else {
      // Simple format
      return `${msg.senderName}: ${msg.text}`;
    }
  });

  const text = formattedLines.join("\n");
  const estimatedTokens = estimateTokenCount(text);

  return {
    text,
    messageCount: recentMessages.length,
    estimatedTokens,
  };
}

/**
 * Format timestamp to human-readable 24-hour time string (HH:mm)
 * Handles various timestamp formats (Date, number, Firestore Timestamp)
 *
 * @param {Date|number|Object} timestamp - Timestamp to format
 * @return {string} Formatted time string (e.g., "14:30")
 *
 * @example
 * formatTimestamp(new Date()); // "14:30"
 * formatTimestamp(1634567890000); // "08:45"
 * formatTimestamp(firestoreTimestamp); // "16:20"
 */
function formatTimestamp(timestamp) {
  let date;

  // Handle different timestamp formats
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate && typeof timestamp.toDate === "function") {
    // Firestore Timestamp
    date = timestamp.toDate();
  } else if (timestamp?.toMillis &&
             typeof timestamp.toMillis === "function") {
    // Firestore Timestamp with toMillis
    date = new Date(timestamp.toMillis());
  } else {
    // Fallback to current time if invalid
    date = new Date();
  }

  // Format to HH:mm 24-hour time
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date);
}

/**
 * Validate that a user has access to a chat
 * Reads chat document from Firestore and checks participantIDs
 *
 * @param {string} userId - User ID to validate
 * @param {string} chatId - Chat ID to check
 * @return {Promise<Object>} Chat document data if valid
 * @throws {ValidationError} If user doesn't have access or chat not found
 *
 * @example
 * const chatData = await validateChatAccess(userId, chatId);
 * console.log(chatData.participantIDs); // ['user1', 'user2']
 */
async function validateChatAccess(userId, chatId) {
  if (!userId || typeof userId !== "string") {
    throw new ValidationError("userId must be a non-empty string");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new ValidationError("chatId must be a non-empty string");
  }

  try {
    // Read chat document from Firestore
    const chatDoc = await admin.firestore()
        .collection("chats")
        .doc(chatId)
        .get();

    if (!chatDoc.exists) {
      throw new ValidationError(`Chat ${chatId} not found`);
    }

    const chatData = chatDoc.data();

    // Check if user is a participant
    if (!chatData.participantIDs ||
        !Array.isArray(chatData.participantIDs)) {
      throw new ValidationError(`Chat ${chatId} has invalid participant data`);
    }

    if (!chatData.participantIDs.includes(userId)) {
      throw new ValidationError(
          `User ${userId} does not have access to chat ${chatId}`,
      );
    }

    return chatData;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    // Wrap Firestore errors
    throw new AIServiceError(
        `Failed to validate chat access: ${error.message}`,
        500,
        "FIRESTORE_ERROR",
    );
  }
}

/**
 * Centralized error handler for AI operations
 * Maps OpenAI errors to user-friendly responses
 *
 * @param {Error} error - Error object from OpenAI or other source
 * @param {string} context - Context string for logging
 * @return {Object} Error response object
 * @return {string} return.error - Error code
 * @return {string} return.message - User-friendly message
 * @return {number} [return.retryAfter] - Seconds to wait before retry
 * @return {boolean} [return.fallback] - Whether fallback is available
 *
 * @example
 * try {
 *   await openai.chat.completions.create({...});
 * } catch (error) {
 *   const errorResponse = handleAIError(error, 'summarization');
 *   return errorResponse;
 * }
 */
function handleAIError(error, context) {
  console.error(`[AI Error] ${context}:`, error);

  // Rate limit errors (429)
  if (error.response?.status === 429 || error.status === 429) {
    return {
      error: "RATE_LIMIT",
      message: "AI service is busy. Please try again in a moment.",
      retryAfter: 30,
    };
  }

  // Authentication errors (401)
  if (error.response?.status === 401 || error.status === 401) {
    return {
      error: "AUTHENTICATION_ERROR",
      message: "AI service authentication failed. Please contact support.",
    };
  }

  // Server errors (500, 502, 503, 504)
  if (error.response?.status >= 500 || error.status >= 500) {
    return {
      error: "SERVICE_ERROR",
      message: "AI service temporarily unavailable.",
      fallback: true,
    };
  }

  // Timeout errors
  if (error.code === "ETIMEDOUT" || error.message?.includes("timeout")) {
    return {
      error: "TIMEOUT",
      message: "AI request timed out. Please try again.",
      retryAfter: 10,
    };
  }

  // Validation errors (our custom errors)
  if (error instanceof ValidationError) {
    return {
      error: "VALIDATION_ERROR",
      message: error.message,
    };
  }

  // Generic error
  return {
    error: "UNKNOWN",
    message: "Something went wrong. Please try again.",
    details: process.env.NODE_ENV === "development" ? error.message : undefined,
  };
}

/**
 * Fetch last N messages from a chat
 * @param {string} chatId - Chat ID to fetch from
 * @param {number} messageCount - Number of messages to fetch
 * @return {Promise<Array<Object>>} Array of message objects
 * @throws {ValidationError} If parameters invalid or chat not found
 *
 * @example
 * const messages = await getLastNMessages(chatId, 50);
 */
async function getLastNMessages(chatId, messageCount = 50) {
  if (!chatId || typeof chatId !== "string") {
    throw new ValidationError("chatId must be a non-empty string");
  }

  if (!messageCount || typeof messageCount !== "number" || messageCount < 1) {
    throw new ValidationError("messageCount must be a positive number");
  }

  try {
    const snapshot = await admin.firestore()
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .orderBy("timestamp", "desc")
        .limit(messageCount)
        .get();

    if (snapshot.empty) {
      return [];
    }

    // Reverse to get chronological order (oldest first)
    const messages = snapshot.docs
        .map((doc) => ({
          messageID: doc.id,
          ...doc.data(),
        }))
        .reverse();

    return messages;
  } catch (error) {
    throw new AIServiceError(
        `Failed to fetch messages: ${error.message}`,
        500,
        "FIRESTORE_ERROR",
    );
  }
}

// Export all utilities
module.exports = {
  getOpenAIClient,
  buildMessageContext,
  formatTimestamp,
  validateChatAccess,
  handleAIError,
  estimateTokenCount,
  getLastNMessages,
  sleep, // Available for future use in retry logic
  AIServiceError,
  ValidationError,
};

