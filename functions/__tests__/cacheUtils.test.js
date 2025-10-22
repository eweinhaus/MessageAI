/**
 * Unit tests for Caching Utilities
 *
 * Tests cover:
 * - Getting cached results (hit/miss/expired)
 * - Setting cache results
 * - Invalidating cache entries
 * - Cache statistics tracking
 */

const {
  getCachedResult,
  setCacheResult,
  invalidateCache,
  incrementCacheStats,
  getCacheStats,
} = require("../utils/cacheUtils");
const {AIServiceError} = require("../utils/aiUtils");
const admin = require("firebase-admin");

// Mock Firestore with static properties
jest.mock("firebase-admin", () => {
  const mockFieldValue = {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
    increment: jest.fn((n) => ({INCREMENT: n})),
  };

  const mockTimestamp = {
    fromMillis: jest.fn((ms) => ({toMillis: () => ms})),
  };

  const firestoreInstance = {
    collection: jest.fn(),
  };

  const firestoreFn = jest.fn(() => firestoreInstance);
  // Add static properties to the firestore function itself
  firestoreFn.FieldValue = mockFieldValue;
  firestoreFn.Timestamp = mockTimestamp;

  return {
    firestore: firestoreFn,
  };
});

describe("cacheUtils", () => {
  let mockFirestore;
  let mockCollection;
  let mockDoc;
  let mockSubcollection;
  let mockBatch;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock batch operations
    mockBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
    };

    // Set up mock chain
    mockSubcollection = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
      add: jest.fn().mockResolvedValue({id: "mockDoc123"}),
    };

    mockDoc = {
      collection: jest.fn(() => mockSubcollection),
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(),
    };

    // Mock for different collection paths (chats, meta, etc.)
    mockCollection = {
      doc: jest.fn((docId) => {
        // Return the same mockDoc for all paths
        return mockDoc;
      }),
    };

    mockFirestore = {
      collection: jest.fn((collectionName) => {
        // Return the same collection mock for all collections
        return mockCollection;
      }),
      batch: jest.fn(() => mockBatch),
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
        increment: jest.fn((n) => ({INCREMENT: n})),
      },
      Timestamp: {
        fromMillis: jest.fn((ms) => ({toMillis: () => ms})),
      },
    };

    const firestoreFn = jest.fn(() => mockFirestore);
    firestoreFn.FieldValue = mockFirestore.FieldValue;
    firestoreFn.Timestamp = mockFirestore.Timestamp;
    admin.firestore = firestoreFn;
  });

  describe("getCachedResult", () => {
    test("should return cached result on hit", async () => {
      const mockData = {
        type: "summary",
        result: {text: "Test summary"},
        createdAt: {toMillis: () => Date.now() - 1000},
      };

      mockSubcollection.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "doc123",
          data: () => mockData,
        }],
      });

      const result = await getCachedResult("chat123", "summary");

      expect(result).toBeDefined();
      expect(result.type).toBe("summary");
      expect(result.age).toBeLessThan(2000);
      expect(mockSubcollection.where).toHaveBeenCalledWith(
          "type",
          "==",
          "summary",
      );
    });

    test("should return null on cache miss", async () => {
      mockSubcollection.get.mockResolvedValue({empty: true});

      const result = await getCachedResult("chat123", "summary");

      expect(result).toBeNull();
    });

    test("should return null when cache expired", async () => {
      const mockData = {
        type: "summary",
        result: {text: "Old summary"},
        createdAt: {toMillis: () => Date.now() - 90000000}, // >24h ago
      };

      mockSubcollection.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "doc123",
          data: () => mockData,
        }],
      });

      const result = await getCachedResult("chat123", "summary");

      expect(result).toBeNull();
    });

    test("should respect custom maxAge option", async () => {
      const mockData = {
        type: "summary",
        result: {text: "Recent summary"},
        createdAt: {toMillis: () => Date.now() - 2000},
      };

      mockSubcollection.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "doc123",
          data: () => mockData,
        }],
      });

      const result = await getCachedResult("chat123", "summary", {
        maxAge: 1000,
      });

      expect(result).toBeNull(); // Expired with 1s maxAge
    });

    test("should throw error for invalid chatId", async () => {
      await expect(getCachedResult("", "summary"))
          .rejects.toThrow(AIServiceError);
      await expect(getCachedResult(null, "summary"))
          .rejects.toThrow(AIServiceError);
    });

    test("should throw error for invalid type", async () => {
      await expect(getCachedResult("chat123", ""))
          .rejects.toThrow(AIServiceError);
      await expect(getCachedResult("chat123", null))
          .rejects.toThrow(AIServiceError);
    });
  });

  describe("setCacheResult", () => {
    test("should cache result successfully", async () => {
      mockSubcollection.add.mockResolvedValue({id: "newDoc123"});

      const docId = await setCacheResult("chat123", {
        type: "summary",
        result: {text: "New summary"},
        metadata: {model: "gpt-4"},
      });

      expect(docId).toBe("newDoc123");
      expect(mockSubcollection.add).toHaveBeenCalledWith({
        type: "summary",
        result: {text: "New summary"},
        metadata: {model: "gpt-4"},
        createdAt: "SERVER_TIMESTAMP",
      });
    });

    test("should throw error for invalid chatId", async () => {
      await expect(setCacheResult("", {type: "test", result: {}}))
          .rejects.toThrow(AIServiceError);
    });

    test("should throw error for invalid data", async () => {
      await expect(setCacheResult("chat123", null))
          .rejects.toThrow(AIServiceError);
      await expect(setCacheResult("chat123", "invalid"))
          .rejects.toThrow(AIServiceError);
    });

    test("should throw error for missing type", async () => {
      await expect(setCacheResult("chat123", {result: {}}))
          .rejects.toThrow(AIServiceError);
    });

    test("should throw error for missing result", async () => {
      await expect(setCacheResult("chat123", {type: "test"}))
          .rejects.toThrow(AIServiceError);
    });
  });

  describe("invalidateCache", () => {
    test("should delete old cache entries", async () => {
      const mockBatch = {
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(),
      };

      mockSubcollection.get.mockResolvedValue({
        empty: false,
        size: 5,
        docs: [
          {ref: "ref1"},
          {ref: "ref2"},
          {ref: "ref3"},
          {ref: "ref4"},
          {ref: "ref5"},
        ],
      });

      mockFirestore.batch = jest.fn(() => mockBatch);

      const count = await invalidateCache("chat123");

      expect(count).toBe(5);
      expect(mockBatch.delete).toHaveBeenCalledTimes(5);
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    test("should return 0 when no entries to delete", async () => {
      mockSubcollection.get.mockResolvedValue({empty: true});

      const count = await invalidateCache("chat123");

      expect(count).toBe(0);
    });

    test("should filter by type when specified", async () => {
      mockSubcollection.get.mockResolvedValue({empty: true});

      await invalidateCache("chat123", "summary");

      expect(mockSubcollection.where).toHaveBeenCalledWith(
          "type",
          "==",
          "summary",
      );
    });

    test("should throw error for invalid chatId", async () => {
      await expect(invalidateCache(""))
          .rejects.toThrow(AIServiceError);
    });
  });

  describe("incrementCacheStats", () => {
    test("should increment hit stats", async () => {
      mockDoc.set.mockResolvedValue();

      await incrementCacheStats({hit: true, type: "summary"});

      expect(mockDoc.set).toHaveBeenCalledWith(
          expect.objectContaining({
            "summary.hits": {INCREMENT: 1},
            "summary.misses": {INCREMENT: 0},
            "summary.total": {INCREMENT: 1},
          }),
          {merge: true},
      );
    });

    test("should increment miss stats", async () => {
      mockDoc.set.mockResolvedValue();

      await incrementCacheStats({hit: false, type: "summary"});

      expect(mockDoc.set).toHaveBeenCalledWith(
          expect.objectContaining({
            "summary.hits": {INCREMENT: 0},
            "summary.misses": {INCREMENT: 1},
            "summary.total": {INCREMENT: 1},
          }),
          {merge: true},
      );
    });

    test("should not throw on error", async () => {
      mockDoc.set.mockRejectedValue(new Error("Firestore error"));

      await expect(incrementCacheStats({hit: true, type: "test"}))
          .resolves.not.toThrow();
    });
  });

  describe("getCacheStats", () => {
    test("should return stats when document exists", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          "summary.hits": 10,
          "summary.misses": 5,
          "summary.total": 15,
        }),
      });

      const stats = await getCacheStats();

      expect(stats["summary.hits"]).toBe(10);
      expect(stats["summary.misses"]).toBe(5);
    });

    test("should return empty object when no stats", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const stats = await getCacheStats();

      expect(stats).toEqual({});
    });

    test("should return empty object on error", async () => {
      mockDoc.get.mockRejectedValue(new Error("Firestore error"));

      const stats = await getCacheStats();

      expect(stats).toEqual({});
    });
  });
});

