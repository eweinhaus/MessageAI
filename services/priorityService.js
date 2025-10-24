/**
 * Priority Service - Local priority scoring for chats
 * 
 * Provides lightweight, instant scoring algorithms that determine
 * which chats should get AI-powered priority analysis.
 * 
 * Hybrid approach:
 * 1. Local scoring (instant, no network) - runs on all chats
 * 2. AI scoring (slower, costs tokens) - runs only on candidates
 * 3. Final score combines both for optimal ordering
 */

/**
 * Normalize timestamp from various formats to milliseconds
 * Handles: number (millis), Firestore Timestamp, Date, string
 * 
 * @param {*} value - Timestamp in any format
 * @return {number} Timestamp in milliseconds
 */
export function normalizeTimestamp(value) {
  if (!value) return Date.now();
  
  // Already a number (milliseconds)
  if (typeof value === 'number') return value;
  
  // Firestore Timestamp object
  if (value.toMillis && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  
  // Date object
  if (value instanceof Date) {
    return value.getTime();
  }
  
  // String (ISO format)
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? Date.now() : parsed;
  }
  
  // Fallback
  return Date.now();
}

/**
 * Calculate local priority score (0-100) without AI
 * Fast, instant scoring based on simple heuristics
 * 
 * Factors:
 * - Unread count (0-30 points)
 * - Has mentions (0-20 points)
 * - Days since last message (0-20 points, fresher = higher)
 * - Message frequency (0-15 points)
 * - Group vs 1:1 (0-15 points, groups often more urgent)
 * 
 * @param {Object} chat - Chat object from store
 * @return {number} Score from 0-100
 */
export function calculateLocalScore(chat) {
  if (!chat) return 0;
  
  let score = 0;
  
  // Factor 1: Unread count (0-30 points)
  const unreadCount = chat.unreadCount || 0;
  score += Math.min(unreadCount * 3, 30);
  
  // Factor 2: Has mentions (20 points boost)
  const hasMentions = chat.hasMentions || false;
  if (hasMentions) score += 20;
  
  // Factor 3: Days since last message (0-20 points, fresher = higher)
  const lastMessageTimestamp = normalizeTimestamp(chat.lastMessageTimestamp);
  const daysSinceLastMessage = (Date.now() - lastMessageTimestamp) / (1000 * 60 * 60 * 24);
  
  if (daysSinceLastMessage < 1) {
    score += 20; // Today
  } else if (daysSinceLastMessage < 3) {
    score += 15; // Past 3 days
  } else if (daysSinceLastMessage < 7) {
    score += 10; // Past week
  } else if (daysSinceLastMessage < 14) {
    score += 5; // Past 2 weeks
  }
  // Older than 2 weeks: 0 points
  
  // Factor 4: Message frequency (placeholder - would need message history)
  // For now, group chats get a slight boost as they're often work-related
  
  // Factor 5: Group vs 1:1 (groups often more urgent in work context)
  const isGroup = chat.type === 'group';
  if (isGroup) score += 15;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine if a chat should get AI-powered priority analysis
 * 
 * Criteria:
 * - Must have unread messages (no point analyzing read chats)
 * - Local score >= threshold (40) to be a candidate
 * - Enough time passed since last AI run (throttle)
 * 
 * @param {Object} params - Parameters
 * @param {number} params.localScore - Local priority score
 * @param {number} params.unreadCount - Unread message count
 * @param {number|null} params.lastPriorityRunAt - Last AI analysis timestamp (millis)
 * @param {number} [params.throttleMinutes=5] - Min minutes between AI runs
 * @return {boolean} True if should run AI analysis
 */
export function shouldRunAI({ 
  localScore, 
  unreadCount, 
  lastPriorityRunAt, 
  throttleMinutes = 5 
}) {
  // Must have unread messages
  if (!unreadCount || unreadCount <= 0) return false;
  
  // Must meet minimum local score threshold
  const threshold = 40;
  if (localScore < threshold) return false;
  
  // Throttle: don't run AI too frequently
  if (lastPriorityRunAt) {
    const minutesSinceLastRun = (Date.now() - lastPriorityRunAt) / (1000 * 60);
    if (minutesSinceLastRun < throttleMinutes) return false;
  }
  
  return true;
}

/**
 * Calculate final priority score combining local + AI signals
 * 
 * Weighting:
 * - Local score: 40% weight
 * - AI signals: 60% weight
 * 
 * AI Signal Weights:
 * - highImportance: +25 points
 * - unansweredQuestion: +15 points
 * - mentionsDeadline: +15 points
 * - requiresAction: +10 points
 * - hasBlocker: +20 points
 * 
 * @param {number} localScore - Local priority score (0-100)
 * @param {Object} aiSignals - AI analysis signals
 * @return {number} Final score (0-100)
 */
export function calculateFinalScore(localScore, aiSignals) {
  if (!aiSignals) {
    // No AI signals, use local score only
    return localScore;
  }
  
  // Start with weighted local score (40%)
  let score = localScore * 0.4;
  
  // Add AI signal points (will be weighted to 60% of total)
  let aiPoints = 0;
  
  if (aiSignals.highImportance) aiPoints += 25;
  if (aiSignals.unansweredQuestion) aiPoints += 15;
  if (aiSignals.mentionsDeadline) aiPoints += 15;
  if (aiSignals.requiresAction) aiPoints += 10;
  if (aiSignals.hasBlocker) aiPoints += 20;
  
  // AI signals can contribute up to 85 points max
  // Scale to 60% of final score: 85 points -> 60 points
  const aiContribution = (aiPoints / 85) * 60;
  score += aiContribution;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Merge AI signals from batch results and sanitize
 * Strips undefined values to prevent Firestore errors
 * 
 * @param {Object} aiSignals - Raw AI signals from Cloud Function
 * @return {Object} Sanitized signals object
 */
export function sanitizeAISignals(aiSignals) {
  if (!aiSignals) return {};
  
  const result = {};
  
  // Only include defined boolean values
  if (typeof aiSignals.highImportance === 'boolean') {
    result.highImportance = aiSignals.highImportance;
  }
  if (typeof aiSignals.unansweredQuestion === 'boolean') {
    result.unansweredQuestion = aiSignals.unansweredQuestion;
  }
  if (typeof aiSignals.mentionsDeadline === 'boolean') {
    result.mentionsDeadline = aiSignals.mentionsDeadline;
  }
  if (typeof aiSignals.requiresAction === 'boolean') {
    result.requiresAction = aiSignals.requiresAction;
  }
  if (typeof aiSignals.hasBlocker === 'boolean') {
    result.hasBlocker = aiSignals.hasBlocker;
  }
  
  // Include summary if present
  if (aiSignals.summary) {
    result.summary = aiSignals.summary;
  }
  
  return result;
}

/**
 * Determine if chat is urgent based on final priority score
 * Urgent chats get a red "!" badge
 * 
 * @param {number} priorityScore - Final priority score (0-100)
 * @return {boolean} True if chat is urgent
 */
export function isUrgent(priorityScore) {
  return priorityScore >= 80;
}

