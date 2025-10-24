/**
 * Priority Service - Chat priority scoring and ordering
 *
 * Implements hybrid local + AI priority scoring:
 * - Local scoring for instant responsiveness (unread count, recency, affinity)
 * - AI urgency signals for high-priority chats (selective)
 * - Combined scoring for chat list ordering
 */

import {analyzePriorities} from "./aiService";

/**
 * Normalize timestamp to milliseconds
 * @param {any} timestamp - Timestamp in various formats
 * @return {number} Milliseconds
 */
export function normalizeTimestamp(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === "number") return timestamp;
  if (timestamp.toMillis) return timestamp.toMillis();
  if (timestamp instanceof Date) return timestamp.getTime();
  return 0;
}

/**
 * Sanitize AI signals object
 * @param {Object} signals - Raw AI signals
 * @return {Object} Sanitized signals
 */
export function sanitizeAISignals(signals) {
  if (!signals || typeof signals !== "object") {
    return {hasUrgent: false, urgentCount: 0, totalAnalyzed: 0};
  }
  return {
    hasUrgent: signals.hasUrgent || false,
    urgentCount: signals.urgentCount || 0,
    totalAnalyzed: signals.totalAnalyzed || 0,
  };
}

/**
 * Check if a chat is urgent based on AI signals
 * @param {Object} signals - AI urgency signals
 * @return {boolean} True if urgent
 */
export function isUrgent(signals) {
  if (!signals) return false;
  return signals.hasUrgent === true;
}

/**
 * Determine if AI analysis should run for a chat
 * @param {Object} params - Parameters
 * @param {number} params.localScore - Local priority score
 * @param {number} params.unreadCount - Unread message count
 * @param {number} params.lastPriorityRunAt - Last run timestamp
 * @param {number} params.throttleMinutes - Throttle duration in minutes
 * @return {boolean} True if should run AI
 */
export function shouldRunAI({localScore, unreadCount, lastPriorityRunAt, throttleMinutes = 5}) {
  // Throttle check: Don't run if recently executed
  if (lastPriorityRunAt) {
    const minutesSinceLastRun = (Date.now() - lastPriorityRunAt) / (1000 * 60);
    if (minutesSinceLastRun < throttleMinutes) {
      return false;
    }
  }

  // Run AI if local score indicates potential importance
  if (localScore > 0.5) return true;

  // Run AI if many unread messages
  if (unreadCount > 5) return true;

  return false;
}

/**
 * Calculate final score (alias for calculateCombinedScore for backwards compatibility)
 * @param {number} localScore - Local score
 * @param {Object|null} aiSignals - AI urgency signals
 * @return {number} Final score
 */
export function calculateFinalScore(localScore, aiSignals = null) {
  let finalScore = localScore;

  if (aiSignals && aiSignals.hasUrgent) {
    finalScore += 0.4;
    if (aiSignals.urgentCount > 1) {
      finalScore += 0.2;
    }
  }

  return Math.min(finalScore, 2.0);
}

/**
 * Calculate local priority score (instant, no AI)
 * @param {Object} chat - Chat object
 * @param {number} chat.unreadCount - Number of unread messages
 * @param {number} chat.lastMessageTimestamp - Last message timestamp
 * @param {string} chat.lastMessageSenderID - Sender of last message
 * @param {string} currentUserId - Current user ID (optional)
 * @return {number} Local score (0-1)
 */
export function calculateLocalScore(chat, currentUserId = null) {
  let score = 0;

  // Unread count (30% weight, normalized to 0-1)
  const unreadCount = chat.unreadCount || 0;
  const unreadScore = Math.min(unreadCount / 10, 1.0); // Max at 10+ unread
  score += unreadScore * 0.3;

  // Recency (20% weight)
  const timestamp = chat.lastMessageTimestamp?.toMillis?.() ||
    (typeof chat.lastMessageTimestamp === "number" ? chat.lastMessageTimestamp : 0);
  if (timestamp > 0) {
    const hoursSince = (Date.now() - timestamp) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - (hoursSince / 24)); // Decay over 24 hours
    score += recencyScore * 0.2;
  }

  // Affinity (10% weight) - prioritize chats you engage with
  // Simple heuristic: if last message was from you, boost slightly
  if (currentUserId && chat.lastMessageSenderID === currentUserId) {
    score += 0.1;
  }

  // Unanswered question bonus (0.5 bonus if last message has "?")
  if (chat.lastMessageText?.includes("?") &&
      (!currentUserId || chat.lastMessageSenderID !== currentUserId)) {
    score += 0.5;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

/**
 * Get AI urgency signals for a chat (cached)
 * @param {string} chatId - Chat ID
 * @param {number} messageCount - Number of messages to analyze
 * @return {Promise<Object|null>} AI signals or null if error
 */
export async function getAIUrgencySignals(chatId, messageCount = 30) {
  try {
    const result = await analyzePriorities(chatId, {
      messageCount,
      forceRefresh: false, // Use cache (6hr TTL)
    });

    if (!result.success) {
      console.warn(`[Priority Service] AI analysis failed for ${chatId}:`, result.message);
      return null;
    }

    // Extract urgency signals from priorities
    const priorities = result.data?.priorities || [];
    const urgentCount = priorities.filter((p) => p.priority === "urgent").length;
    const hasUrgent = urgentCount > 0;

    return {
      hasUrgent,
      urgentCount,
      totalAnalyzed: priorities.length,
    };
  } catch (error) {
    console.error(`[Priority Service] Error getting AI signals for ${chatId}:`, error);
    return null;
  }
}

/**
 * Calculate combined priority score (local + AI)
 * @param {Object} chat - Chat object
 * @param {string} currentUserId - Current user ID
 * @param {Object|null} aiSignals - AI urgency signals (optional)
 * @return {number} Final score
 */
export function calculateCombinedScore(chat, currentUserId, aiSignals = null) {
  let finalScore = calculateLocalScore(chat, currentUserId);

  // If AI signals available, boost for urgency
  if (aiSignals && aiSignals.hasUrgent) {
    // Urgency boost: 0.4 for any urgent message
    finalScore += 0.4;

    // Additional boost for multiple urgent messages
    if (aiSignals.urgentCount > 1) {
      finalScore += 0.2;
    }
  }

  return Math.min(finalScore, 2.0); // Cap at 2.0
}

/**
 * Sort chats by priority (high to low)
 * @param {Array} chats - Array of chat objects
 * @param {string} currentUserId - Current user ID
 * @param {Object} aiSignalsMap - Map of chatId → AI signals (optional)
 * @return {Array} Sorted chats with priority scores
 */
export function sortChatsByPriority(chats, currentUserId, aiSignalsMap = {}) {
  // Calculate scores for all chats
  const chatsWithScores = chats.map((chat) => {
    const chatId = chat.chatID;
    const aiSignals = aiSignalsMap[chatId] || null;
    const score = calculateCombinedScore(chat, currentUserId, aiSignals);

    return {
      ...chat,
      priorityScore: score,
      hasUrgent: aiSignals?.hasUrgent || false,
    };
  });

  // Sort by score (descending)
  chatsWithScores.sort((a, b) => b.priorityScore - a.priorityScore);

  return chatsWithScores;
}

/**
 * Recalculate chat order with AI signals (selective)
 * Only analyzes chats that meet threshold (localScore > 0.5 or unreadCount > 5)
 * @param {Array} chats - Array of chat objects
 * @param {string} currentUserId - Current user ID
 * @return {Promise<Array>} Sorted chats with AI signals
 */
export async function recalculateChatOrder(chats, currentUserId) {
  // Step 1: Calculate local scores and identify candidates for AI analysis
  const candidates = chats.filter((chat) => {
    const localScore = calculateLocalScore(chat, currentUserId);
    const unreadCount = chat.unreadCount || 0;
    return localScore > 0.5 || unreadCount > 5;
  });

  console.log(`[Priority Service] Analyzing ${candidates.length} of ${chats.length} chats with AI`);

  // Step 2: Fetch AI signals for candidates (in parallel)
  const aiSignalsMap = {};

  if (candidates.length > 0) {
    const aiPromises = candidates.map(async (chat) => {
      const signals = await getAIUrgencySignals(chat.chatID);
      if (signals) {
        aiSignalsMap[chat.chatID] = signals;
      }
    });

    await Promise.all(aiPromises);
  }

  // Step 3: Sort all chats with combined scoring
  return sortChatsByPriority(chats, currentUserId, aiSignalsMap);
}
