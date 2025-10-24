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

    it('should clamp score to 0-100', () => {
      const highValueChat = {
        unreadCount: 100,
        hasMentions: true,
        lastMessageTimestamp: Date.now(),
        type: 'group',
      };
      
      const score = calculateLocalScore(highValueChat);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
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
      expect(calculateFinalScore(60, null)).toBe(60);
    });

    it('should combine local and AI scores', () => {
      const localScore = 50;
      const aiSignals = {
        highImportance: true,
        unansweredQuestion: false,
        mentionsDeadline: false,
        requiresAction: false,
        hasBlocker: false,
      };
      
      const finalScore = calculateFinalScore(localScore, aiSignals);
      expect(finalScore).toBeGreaterThan(localScore);
      expect(finalScore).toBeLessThanOrEqual(100);
    });

    it('should boost score with all AI signals', () => {
      const localScore = 50;
      const allSignals = {
        highImportance: true,
        unansweredQuestion: true,
        mentionsDeadline: true,
        requiresAction: true,
        hasBlocker: true,
      };
      
      const finalScore = calculateFinalScore(localScore, allSignals);
      expect(finalScore).toBeGreaterThan(80); // Should be quite high
      expect(finalScore).toBeLessThanOrEqual(100);
    });

    it('should clamp final score to 0-100', () => {
      const highLocal = 90;
      const allSignals = {
        highImportance: true,
        unansweredQuestion: true,
        mentionsDeadline: true,
        requiresAction: true,
        hasBlocker: true,
      };
      
      const finalScore = calculateFinalScore(highLocal, allSignals);
      expect(finalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('sanitizeAISignals', () => {
    it('should return empty object for null', () => {
      expect(sanitizeAISignals(null)).toEqual({});
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
    it('should return true for scores >= 80', () => {
      expect(isUrgent(80)).toBe(true);
      expect(isUrgent(90)).toBe(true);
      expect(isUrgent(100)).toBe(true);
    });

    it('should return false for scores < 80', () => {
      expect(isUrgent(79)).toBe(false);
      expect(isUrgent(50)).toBe(false);
      expect(isUrgent(0)).toBe(false);
    });
  });
});

