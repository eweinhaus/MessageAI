/**
 * Unit tests for Rate Limiting Utilities
 *
 * Tests cover:
 * - Rate limit checking
 * - Counter incrementing
 * - Status retrieval
 * - Reset functionality
 * - Admin bypass
 */

const {
  checkRateLimit,
  incrementRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  DEFAULT_LIMITS,
} = require("../utils/rateLimiter");

// Mock Firebase Admin SDK
jest.mock("firebase-admin", () => {
  const mockAuth = {
    getUser: jest.fn(),
  };

  const mockDoc = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  const mockCollection = {
    doc: jest.fn(() => mockDoc),
    get: jest.fn(),
  };

  const mockSubDoc = {
    collection: jest.fn(() => mockCollection),
  };

  const mockTransaction = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
  };

  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => mockSubDoc),
    })),
    runTransaction: jest.fn(),
    FieldValue: {
      serverTimestamp: jest.fn(() => "TIMESTAMP"),
      increment: jest.fn((n) => ({INCREMENT: n})),
    },
    Timestamp: {
      fromMillis: jest.fn((ms) => ({toMillis: () => ms})),
    },
  };

  const firestoreFn = jest.fn(() => mockFirestore);
  firestoreFn.FieldValue = mockFirestore.FieldValue;
  firestoreFn.Timestamp = mockFirestore.Timestamp;

  return {
    auth: jest.fn(() => mockAuth),
    firestore: firestoreFn,
  };
});

const admin = require("firebase-admin");

describe("rateLimiter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("DEFAULT_LIMITS", () => {
    test("should have default limits defined", () => {
      expect(DEFAULT_LIMITS).toBeDefined();
      expect(DEFAULT_LIMITS.default).toBe(10);
      expect(DEFAULT_LIMITS.priority).toBe(10);
      expect(DEFAULT_LIMITS.summary).toBe(5);
      expect(DEFAULT_LIMITS.search).toBe(20);
      expect(DEFAULT_LIMITS.actions).toBe(10);
      expect(DEFAULT_LIMITS.decisions).toBe(5);
    });

    test("should have correct operation-specific limits", () => {
      expect(DEFAULT_LIMITS.summary).toBeLessThan(DEFAULT_LIMITS.search);
      expect(DEFAULT_LIMITS.decisions).toBe(5);
    });
  });

  describe("checkRateLimit", () => {
    test("should throw error for invalid userId", async () => {
      await expect(checkRateLimit("", "test"))
          .rejects.toThrow("userId must be a non-empty string");
      await expect(checkRateLimit(null, "test"))
          .rejects.toThrow();
    });

    test("should throw error for invalid operation", async () => {
      await expect(checkRateLimit("user123", ""))
          .rejects.toThrow("operation must be a non-empty string");
      await expect(checkRateLimit("user123", null))
          .rejects.toThrow();
    });

    test("should allow when user is admin", async () => {
      admin.auth().getUser.mockResolvedValue({
        customClaims: {isAdmin: true},
      });

      const result = await checkRateLimit("admin123", "test");
      expect(result).toBe(true);
    });

    test("should allow when no rate limit document exists", async () => {
      admin.auth().getUser.mockResolvedValue({
        customClaims: {},
      });
      admin.firestore()
          .collection()
          .doc()
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: false,
          });

      const result = await checkRateLimit("user123", "test");
      expect(result).toBe(true);
    });

    test("should use custom maxPerHour option", async () => {
      admin.auth().getUser.mockResolvedValue({
        customClaims: {},
      });
      admin.firestore()
          .collection()
          .doc()
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: false,
          });

      await checkRateLimit("user123", "test", {maxPerHour: 100});
      // Should not throw - testing that custom limit is accepted
      expect(true).toBe(true);
    });
  });

  describe("incrementRateLimit", () => {
    test("should not throw for invalid inputs", async () => {
      await expect(incrementRateLimit("", "test"))
          .resolves.not.toThrow();
      await expect(incrementRateLimit("user123", ""))
          .resolves.not.toThrow();
    });

    test("should be a function", () => {
      expect(typeof incrementRateLimit).toBe("function");
    });

    test("should not track admin users", async () => {
      admin.auth().getUser.mockResolvedValue({
        customClaims: {isAdmin: true},
      });

      await incrementRateLimit("admin123", "test");

      // runTransaction should not be called for admins
      expect(admin.firestore().runTransaction).not.toHaveBeenCalled();
    });

    test("should handle errors gracefully", async () => {
      admin.auth().getUser.mockResolvedValue({
        customClaims: {},
      });
      admin.firestore().runTransaction.mockRejectedValue(
          new Error("Firestore error"),
      );

      // Should not throw
      await expect(incrementRateLimit("user123", "test"))
          .resolves.not.toThrow();
    });
  });

  describe("getRateLimitStatus", () => {
    test("should throw error for invalid userId", async () => {
      await expect(getRateLimitStatus("", "test"))
          .rejects.toThrow();
      await expect(getRateLimitStatus(null, "test"))
          .rejects.toThrow();
    });

    test("should throw error for invalid operation", async () => {
      await expect(getRateLimitStatus("user123", ""))
          .rejects.toThrow();
      await expect(getRateLimitStatus("user123", null))
          .rejects.toThrow();
    });

    test("should return default status when no document exists", async () => {
      admin.firestore()
          .collection()
          .doc()
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: false,
          });

      const status = await getRateLimitStatus("user123", "summary");
      expect(status.count).toBe(0);
      expect(status.limit).toBe(5); // summary default
      expect(status.remaining).toBe(5);
      expect(status.resetAt).toBeGreaterThan(Date.now());
    });

    test("should use correct limit for different operations", async () => {
      admin.firestore()
          .collection()
          .doc()
          .collection()
          .doc()
          .get.mockResolvedValue({
            exists: false,
          });

      const searchStatus = await getRateLimitStatus("user123", "search");
      expect(searchStatus.limit).toBe(20);

      const summaryStatus = await getRateLimitStatus("user123", "summary");
      expect(summaryStatus.limit).toBe(5);
    });
  });

  describe("resetRateLimit", () => {
    test("should throw error for invalid userId", async () => {
      await expect(resetRateLimit(""))
          .rejects.toThrow();
      await expect(resetRateLimit(null))
          .rejects.toThrow();
    });

    test("should be a function", () => {
      expect(typeof resetRateLimit).toBe("function");
    });

    test("should delete specific operation document", async () => {
      const mockDelete = jest.fn().mockResolvedValue();
      admin.firestore()
          .collection()
          .doc()
          .collection()
          .doc.mockReturnValue({
            delete: mockDelete,
          });

      await resetRateLimit("user123", "summary");
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});

