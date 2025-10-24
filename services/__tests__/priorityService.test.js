/**
 * Unit tests for priorityService.js
 */

import {
  normalizeTimestamp,
  calculateLocalScore,
  shouldRunAI,
  calculateFinalScore,
  sanitizeAISignals,
  isUrgent,
} from '../priorityService';

describe('priorityService', () => {
  describe('normalizeTimestamp', () => {
    it('should handle number timestamps', () => {
      const now = Date.now();
      expect(normalizeTimestamp(now)).toBe(now);
    });

    it('should handle Firestore Timestamp objects', () => {
      const mockTimestamp = {
        toMillis: () => 1234567890000,
      };
      expect(normalizeTimestamp(mockTimestamp)).toBe(1234567890000);
    });

    it('should handle Date objects', () => {
      const date = new Date('2025-01-01');
      expect(normalizeTimestamp(date)).toBe(date.getTime());
    });

    it('should handle ISO string timestamps', () => {
      const isoString = '2025-01-01T00:00:00.000Z';
      expect(normalizeTimestamp(isoString)).toBe(Date.parse(isoString));
    });

    it('should handle null/undefined', () => {
      const result = normalizeTimestamp(null);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('calculateLocalScore', () => {
    it('should return 0 for null chat', () => {
      expect(calculateLocalScore(null)).toBe(0);
    });

    it('should score unread messages', () => {
      const chat = { unreadCount: 5 };
      const score = calculateLocalScore(chat);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should boost score for mentions', () => {
      const chatWithoutMention = { unreadCount: 5, hasMentions: false };
      const chatWithMention = { unreadCount: 5, hasMentions: true };
      
      const score1 = calculateLocalScore(chatWithoutMention);
      const score2 = calculateLocalScore(chatWithMention);
      
      expect(score2).toBeGreaterThan(score1);
    });

    it('should score recent messages higher', () => {
      const recentChat = {
        unreadCount: 5,
        lastMessageTimestamp: Date.now(),
      };
      const oldChat = {
        unreadCount: 5,
        lastMessageTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
      };
      
      const recentScore = calculateLocalScore(recentChat);
      const oldScore = calculateLocalScore(oldChat);
      
      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should boost group chats', () => {
      const oneOnOne = { unreadCount: 5, type: '1:1' };
      const group = { unreadCount: 5, type: 'group' };
      
      const score1 = calculateLocalScore(oneOnOne);
      const score2 = calculateLocalScore(group);
      
      expect(score2).toBeGreaterThan(score1);
    });

    it('should clamp score to -0.2 to 1.0 range', () => {
      const highValueChat = {
        unreadCount: 100,
        lastMessageTimestamp: Date.now(),
        type: 'group',
        lastMessageSenderID: 'other-user',
        lastMessageText: 'This is a question?',
      };

      const score = calculateLocalScore(highValueChat);
      expect(score).toBeLessThanOrEqual(1.0);
      expect(score).toBeGreaterThanOrEqual(-0.2);
    });

    it('should penalize chats where user sent last message', () => {
      const currentUserId = 'user-123';
      const chatWhereUserSentLast = {
        unreadCount: 0,
        lastMessageTimestamp: Date.now(),
        lastMessageSenderID: currentUserId,
      };
      const chatWhereSomeoneElseSentLast = {
        unreadCount: 0,
        lastMessageTimestamp: Date.now(),
        lastMessageSenderID: 'other-user',
      };

      const score1 = calculateLocalScore(chatWhereUserSentLast, currentUserId);
      const score2 = calculateLocalScore(chatWhereSomeoneElseSentLast, currentUserId);

      expect(score1).toBeLessThan(score2); // User's last message should be lower priority
    });

    it('should boost chats with unanswered questions from others', () => {
      const currentUserId = 'user-123';
      const chatWithQuestionFromOther = {
        unreadCount: 0,
        lastMessageTimestamp: Date.now(),
        lastMessageSenderID: 'other-user',
        lastMessageText: 'Can you help me with this?',
      };
      const chatWithQuestionFromUser = {
        unreadCount: 0,
        lastMessageTimestamp: Date.now(),
        lastMessageSenderID: currentUserId,
        lastMessageText: 'Can you help me with this?',
      };

      const score1 = calculateLocalScore(chatWithQuestionFromOther, currentUserId);
      const score2 = calculateLocalScore(chatWithQuestionFromUser, currentUserId);

      expect(score1).toBeGreaterThan(score2); // Question from other should get bonus
    });
  });

  describe('shouldRunAI', () => {
    it('should require unread messages', () => {
      expect(shouldRunAI({
        localScore: 50,
        unreadCount: 0,
        lastPriorityRunAt: null,
      })).toBe(false);
    });

    it('should require minimum local score', () => {
      expect(shouldRunAI({
        localScore: 30, // Below threshold of 40
        unreadCount: 5,
        lastPriorityRunAt: null,
      })).toBe(false);
    });

    it('should throttle frequent runs', () => {
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
      
      expect(shouldRunAI({
        localScore: 50,
        unreadCount: 5,
        lastPriorityRunAt: twoMinutesAgo,
        throttleMinutes: 5,
      })).toBe(false);
    });

    it('should allow AI when all conditions met', () => {
      const longAgo = Date.now() - (10 * 60 * 1000); // 10 minutes
      
      expect(shouldRunAI({
        localScore: 50,
        unreadCount: 5,
        lastPriorityRunAt: longAgo,
        throttleMinutes: 5,
      })).toBe(true);
    });

    it('should allow first run (null lastPriorityRunAt)', () => {
      expect(shouldRunAI({
        localScore: 50,
        unreadCount: 5,
        lastPriorityRunAt: null,
      })).toBe(true);
    });
  });

  describe('calculateFinalScore', () => {
    it('should return local score when no AI signals', () => {
      expect(calculateFinalScore(0.6, null)).toBe(0.6);
    });

    it('should combine local and AI scores', () => {
      const localScore = 0.5;
      const aiSignals = {
        hasUrgent: true,
        urgentCount: 1,
      };

      const finalScore = calculateFinalScore(localScore, aiSignals);
      expect(finalScore).toBeGreaterThan(localScore);
      expect(finalScore).toBeLessThanOrEqual(2.0);
    });

    it('should boost score with all AI signals', () => {
      const localScore = 0.5;
      const allSignals = {
        hasUrgent: true,
        urgentCount: 3,
      };

      const finalScore = calculateFinalScore(localScore, allSignals);
      expect(finalScore).toBeGreaterThan(1.0); // Should be quite high
      expect(finalScore).toBeLessThanOrEqual(2.0);
    });

    it('should clamp final score to 0-2.0 range', () => {
      const highLocal = 1.5;
      const allSignals = {
        highImportance: true,
        unansweredQuestion: true,
        mentionsDeadline: true,
        requiresAction: true,
        hasBlocker: true,
      };

      const finalScore = calculateFinalScore(highLocal, allSignals);
      expect(finalScore).toBeLessThanOrEqual(2.0);
      expect(finalScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sanitizeAISignals', () => {
    it('should return default values for null', () => {
      expect(sanitizeAISignals(null)).toEqual({hasUrgent: false, urgentCount: 0, totalAnalyzed: 0});
    });

    it('should filter out undefined values', () => {
      const signals = {
        highImportance: true,
        unansweredQuestion: undefined,
        mentionsDeadline: false,
        summary: 'Test',
      };
      
      const sanitized = sanitizeAISignals(signals);
      expect(sanitized).toHaveProperty('highImportance', true);
      expect(sanitized).toHaveProperty('mentionsDeadline', false);
      expect(sanitized).toHaveProperty('summary', 'Test');
      expect(sanitized).not.toHaveProperty('unansweredQuestion');
    });

    it('should include summary if present', () => {
      const signals = {
        highImportance: true,
        summary: 'Important chat',
      };
      
      const sanitized = sanitizeAISignals(signals);
      expect(sanitized.summary).toBe('Important chat');
    });
  });

  describe('isUrgent', () => {
    it('should return true for urgent AI signals', () => {
      expect(isUrgent({ hasUrgent: true })).toBe(true);
      expect(isUrgent({ hasUrgent: false })).toBe(false);
      expect(isUrgent(null)).toBe(false);
      expect(isUrgent({})).toBe(false);
    });
  });
});

