/**
 * AI Service - Client-side integration with AI Cloud Functions
 *
 * Provides methods to call AI features:
 * - Priority detection
 * - Thread summarization
 * - Action item extraction
 * - Smart search
 * - Decision tracking
 *
 * Handles loading states, errors, and result formatting.
 */

import {getFunctions, httpsCallable} from "firebase/functions";
import app, {auth} from "../config/firebaseConfig";

// Initialize Functions with the Firebase app instance
const functions = getFunctions(app);

/**
 * Get user-friendly error message from error code
 * @param {Error} error - Error object from Cloud Function
 * @return {string} User-friendly message
 */
function getErrorMessage(error) {
  const errorMap = {
    "unauthenticated": "Please sign in to use AI features",
    "permission-denied": "You don't have access to this chat",
    "resource-exhausted": "You've reached your usage limit. Please try again in an hour.",
    "invalid-argument": "Invalid request. Please try again.",
    "not-found": "Chat not found",
    "internal": "Something went wrong. Please try again.",
    "unavailable": "Service temporarily unavailable. Please try again.",
    "deadline-exceeded": "Request timed out. Please try again.",
  };

  const code = error.code?.replace("functions/", "");
  return errorMap[code] || error.message || "An error occurred. Please try again.";
}

/**
 * Analyze message priorities to detect urgent messages
 *
 * Single mode:
 * @param {string} chatId - Chat ID to analyze
 * @param {Object} [options] - Options
 * @param {number} [options.messageCount=30] - Number of messages to analyze
 * @param {boolean} [options.forceRefresh=false] - Skip cache and force fresh analysis
 *
 * Batch mode (for global priority ordering):
 * @param {null} chatId - Pass null for batch mode
 * @param {Object} options - Options
 * @param {Array} options.chats - Array of {chatId, messages} objects
 * @param {number} [options.messageCount=30] - Max messages per chat
 * @param {boolean} [options.forceRefresh=false] - Skip cache
 *
 * @return {Promise<Object>} Result with success status and data/error
 *
 * @example
 * // Single mode
 * const result = await analyzePriorities(chatId);
 * if (result.success) {
 *   console.log(result.data.priorities);
 * }
 *
 * @example
 * // Batch mode
 * const result = await analyzePriorities(null, {
 *   chats: [{chatId: "abc", messages: [...]}, ...]
 * });
 * if (result.success) {
 *   result.data.chats.forEach(chat => console.log(chat.signals));
 * }
 */
export async function analyzePriorities(chatId, options = {}) {
  try {
    // Check authentication first
    const user = auth.currentUser;
    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "analyzePriorities");

    // Batch mode: analyzing multiple chats
    if (!chatId && options.chats && Array.isArray(options.chats)) {
      console.log(`[AI Service] Batch analyzing ${options.chats.length} chats`);
      
      const result = await callable({
        chats: options.chats,
        messageCount: options.messageCount || 30,
        forceRefresh: options.forceRefresh || false,
      });

      return {
        success: true,
        data: result.data,
      };
    }

    // Single mode: analyzing one chat
    const result = await callable({
      chatId,
      messageCount: options.messageCount || 30,
      forceRefresh: options.forceRefresh || false,
    });

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Priority analysis failed:", error);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Summarize a thread with key points, decisions, and action items
 *
 * @param {string} chatId - Chat ID to summarize
 * @param {Object} [options] - Options
 * @param {number} [options.messageCount=50] - Number of messages to analyze
 * @param {boolean} [options.forceRefresh=false] - Skip cache and force fresh summary
 * @return {Promise<Object>} Result with summary data
 *
 * @example
 * const result = await summarizeThread(chatId, {messageCount: 100});
 * if (result.success) {
 *   console.log(result.data.keyPoints);
 * }
 */
export async function summarizeThread(chatId, options = {}) {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "summarizeThread");

    const result = await callable({
      chatId,
      messageCount: options.messageCount || 50,
      forceRefresh: options.forceRefresh || false,
    });

    console.log("[AI Service] summarizeThread success");

    return {
      success: true,
      cached: result.data.cached || false,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Summarization failed:", error.message);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Summarize all unread messages across all chats (global summary)
 *
 * @param {Object} options - Options
 * @param {boolean} [options.forceRefresh=false] - Skip cache and force fresh summary
 * @param {string} [options.mode="auto"] - Summary mode: "fast", "rich", or "auto" (progressive)
 * @return {Promise<Object>} Result with global summary data
 *
 * @example
 * // Auto mode (progressive fast → rich)
 * const result = await summarizeUnreadGlobal({mode: "auto"});
 * if (result.success && result.data.hasUnread) {
 *   console.log(result.data.summary);
 * }
 *
 * @example
 * // Direct rich mode
 * const result = await summarizeUnreadGlobal({mode: "rich"});
 */
export async function summarizeUnreadGlobal({forceRefresh = false, mode = "auto"} = {}) {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "summarizeUnread");

    // Auto mode: fast first, then rich in background
    if (mode === "auto") {
      // Fast pass - return immediately for instant UX
      const fastResult = await callable({
        forceRefresh,
        mode: "fast",
      });

      console.log("[AI Service] summarizeUnread fast mode success");

      // Kick off rich pass in background (don't await)
      callable({
        forceRefresh: false, // Don't force refresh on background call
        mode: "rich",
      }).then(() => {
        console.log("[AI Service] Background rich summary complete");
      }).catch((err) => {
        console.warn("[AI Service] Background rich summary failed:", err.message);
      });

      return {
        success: true,
        cached: fastResult.data.cached || false,
        data: fastResult.data,
        mode: "fast",
      };
    }

    // Direct mode (fast or rich)
    const result = await callable({
      forceRefresh,
      mode,
    });

    console.log(`[AI Service] summarizeUnread ${mode} mode success`);

    return {
      success: true,
      cached: result.data.cached || false,
      data: result.data,
      mode,
    };
  } catch (error) {
    console.error("[AI Service] Global summarization failed:", error.message);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Extract action items from conversation
 *
 * @param {string} chatId - Chat ID to analyze
 * @param {Object} [options] - Options
 * @param {number} [options.messageCount=50] - Number of messages to analyze
 * @param {boolean} [options.forceRefresh=false] - Skip cache and force fresh extraction
 * @return {Promise<Object>} Result with action items
 *
 * @example
 * const result = await extractActionItems(chatId);
 * if (result.success) {
 *   result.data.actionItems.forEach(item => console.log(item.task));
 * }
 */
export async function extractActionItems(chatId, options = {}) {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "extractActionItems");

    const result = await callable({
      chatId,
      messageCount: options.messageCount || 50,
      forceRefresh: options.forceRefresh || false,
    });

    console.log("[AI Service] extractActionItems success");

    return {
      success: true,
      cached: result.data.cached || false,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Action item extraction failed:", error);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Update action item status (mark complete, etc.)
 *
 * @param {string} chatId - Chat ID
 * @param {string} itemId - Action item document ID
 * @param {string} status - New status ("completed", "pending", etc.)
 * @return {Promise<Object>} Result
 */
export async function updateActionItemStatus(chatId, itemId, status) {
  try {
    const {getFirestore, updateDoc, doc} = await import("firebase/firestore");
    const db = getFirestore();

    await updateDoc(
        doc(db, "chats", chatId, "actionItems", itemId),
        {
          status,
          completedAt: status === "completed" ? new Date() : null,
        },
    );

    return {success: true};
  } catch (error) {
    console.error("[AI Service] Failed to update action item:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Smart semantic search through messages (per-chat)
 *
 * @param {string} chatId - Chat ID to search
 * @param {string} query - Search query
 * @param {Object} [options] - Options
 * @param {number} [options.limit=10] - Max results
 * @return {Promise<Object>} Result with matching messages
 *
 * @example
 * const result = await smartSearch(chatId, "deployment date");
 * if (result.success) {
 *   result.data.results.forEach(msg => console.log(msg.text));
 * }
 */
export async function smartSearch(chatId, query, options = {}) {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "smartSearch");

    const result = await callable({
      chatId,
      query,
      limit: options.limit || 10,
    });

    console.log("[AI Service] smartSearch success");

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Smart search failed:", error);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Global semantic search across all chats (two-stage)
 *
 * @param {string} query - Search query
 * @param {string} stage - "stage1" (fast) or "stage2" (deep)
 * @return {Promise<Object>} Result with matching messages
 *
 * @example
 * // Stage 1 (fast)
 * const fast = await searchMessagesGlobal("deployment date", "stage1");
 * // Stage 2 (deep)
 * const deep = await searchMessagesGlobal("deployment date", "stage2");
 */
export async function searchMessagesGlobal(query, stage = "stage1") {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("[AI Service] No authenticated user!");
      return {
        success: false,
        error: "unauthenticated",
        message: "Please sign in to use AI features",
      };
    }

    const callable = httpsCallable(functions, "searchMessages");

    const result = await callable({
      query,
      stage,
    });

    console.log(`[AI Service] searchMessages ${stage} success`);

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Global search failed:", error);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Track team decisions in conversation
 *
 * @param {string} chatId - Chat ID to analyze
 * @return {Promise<Object>} Result with decisions
 *
 * @example
 * const result = await trackDecisions(chatId);
 * if (result.success) {
 *   result.data.decisions.forEach(d => console.log(d.decision));
 * }
 */
export async function trackDecisions(chatId) {
  try {
    const callable = httpsCallable(functions, "trackDecisions");

    const result = await callable({chatId});

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error("[AI Service] Decision tracking failed:", error);

    return {
      success: false,
      error: error.code || "UNKNOWN",
      message: getErrorMessage(error),
    };
  }
}

/**
 * Get cached AI results for a chat (for offline access)
 *
 * @param {string} chatId - Chat ID
 * @param {string} type - Insight type ("priorities", "summary", etc.)
 * @return {Promise<Object|null>} Cached data or null
 */
export async function getCachedInsight(chatId, type) {
  try {
    const {getFirestore, collection, query, where, orderBy, limit, getDocs} =
      await import("firebase/firestore");
    const db = getFirestore();

    const q = query(
        collection(db, "chats", chatId, "aiInsights"),
        where("type", "==", type),
        orderBy("createdAt", "desc"),
        limit(1),
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check if cache is still valid (24 hours)
    const age = Date.now() - data.createdAt.toMillis();
    const maxAge = 24 * 60 * 60 * 1000;

    if (age > maxAge) {
      return null;
    }

    return {
      id: doc.id,
      ...data,
      age,
    };
  } catch (error) {
    console.error("[AI Service] Failed to get cached insight:", error);
    return null;
  }
}

