/**
 * Unit tests for smartSearch Cloud Function
 *
 * Tests the callable Cloud Function including:
 * - Authentication validation
 * - Input parameter validation
 * - Rate limiting
 * - Chat access validation
 * - Cache behavior
 * - Error handling
 */

const {smartSearch} = require("../smartSearch");

// Mock dependencies
jest.mock("../utils/aiUtils");
jest.mock("../utils/cacheUtils");
jest.mock("../utils/rateLimiter");
jest.mock("../utils/searchUtils");

const {validateChatAccess} = require("../utils/aiUtils");
const {getCachedResult, setCacheResult} = require("../utils/cacheUtils");
const {checkRateLimit, incrementRateLimit} = require("../utils/rateLimiter");
const {semanticSearchSimple, validateQuery} = require("../utils/searchUtils");

describe("smartSearch Cloud Function", () => {
  // Mock request
  let mockRequest;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Default mock implementations
    validateChatAccess.mockResolvedValue(true);
    validateQuery.mockImplementation((q) => q.trim());
    checkRateLimit.mockResolvedValue(true);
    incrementRateLimit.mockResolvedValue(true);
    getCachedResult.mockResolvedValue(null);
    setCacheResult.mockResolvedValue(true);
    semanticSearchSimple.mockResolvedValue([]);

    // Default request structure
    mockRequest = {
      data: {
        chatId: "chat123",
        query: "deployment date",
        limit: 10,
        messageCount: 100,
        forceRefresh: false,
      },
      auth: {
        uid: "user123",
      },
    };
  });

  describe("Authentication", () => {
    test("should require authentication", async () => {
      mockRequest.auth = null;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should accept authenticated requests", async () => {
      semanticSearchSimple.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test message",
          relevance: 0.95,
          reason: "Match",
        },
      ]);

      const result = await smartSearch.run(mockRequest);

      expect(result.success).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("should validate chatId is provided", async () => {
      mockRequest.data.chatId = null;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should validate chatId is a string", async () => {
      mockRequest.data.chatId = 123;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should validate query through validateQuery", async () => {
      validateQuery.mockImplementation(() => {
        throw new Error("Query too long");
      });

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should validate limit range", async () => {
      mockRequest.data.limit = 0;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();

      mockRequest.data.limit = 51;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should validate messageCount range", async () => {
      mockRequest.data.messageCount = 5;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();

      mockRequest.data.messageCount = 501;

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should accept valid parameters", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      const result = await smartSearch.run(mockRequest);

      expect(result.success).toBe(true);
    });
  });

  describe("Rate Limiting", () => {
    test("should check rate limit for 'search' bucket", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith("user123", "search");
    });

    test("should increment rate limit after successful search", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(incrementRateLimit).toHaveBeenCalledWith("user123", "search");
    });

    test("should not increment rate limit on error", async () => {
      semanticSearchSimple.mockRejectedValue(new Error("Search failed"));

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();

      expect(incrementRateLimit).not.toHaveBeenCalled();
    });

    test("should throw error when rate limit exceeded", async () => {
      checkRateLimit.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });
  });

  describe("Chat Access Validation", () => {
    test("should validate user has access to chat", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(validateChatAccess).toHaveBeenCalledWith("user123", "chat123");
    });

    test("should throw error when user lacks access", async () => {
      validateChatAccess.mockRejectedValue(new Error("Access denied"));

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });
  });

  describe("Cache Behavior", () => {
    test("should check cache when forceRefresh is false", async () => {
      mockRequest.data.forceRefresh = false;

      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(getCachedResult).toHaveBeenCalledWith(
          "chat123",
          "search",
          expect.any(Object),
      );
    });

    test("should skip cache when forceRefresh is true", async () => {
      mockRequest.data.forceRefresh = true;

      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      // Cache check is skipped in the if block
      // semanticSearchSimple should still be called
      expect(semanticSearchSimple).toHaveBeenCalled();
    });

    test("should return cached result when available " +
      "and query matches", async () => {
      const cachedResult = {
        query: "deployment date",
        results: [
          {
            messageID: "msg1",
            text: "Cached message",
            relevance: 0.9,
          },
        ],
        totalResults: 1,
        createdAt: new Date().toISOString(),
      };

      getCachedResult.mockResolvedValue(cachedResult);

      const result = await smartSearch.run(mockRequest);

      expect(result.cached).toBe(true);
      expect(semanticSearchSimple).not.toHaveBeenCalled();
    });

    test("should not return cache if query doesn't match", async () => {
      const cachedResult = {
        query: "different query",
        results: [],
        totalResults: 0,
      };

      getCachedResult.mockResolvedValue(cachedResult);
      semanticSearchSimple.mockResolvedValue([]);

      const result = await smartSearch.run(mockRequest);

      expect(result.cached).toBe(false);
      expect(semanticSearchSimple).toHaveBeenCalled();
    });

    test("should cache new search results", async () => {
      semanticSearchSimple.mockResolvedValue([
        {
          messageID: "msg1",
          chatID: "chat123",
          senderID: "user456",
          senderName: "Alice",
          text: "Deployment scheduled",
          timestamp: new Date(),
          relevance: 0.95,
          reason: "Direct match",
        },
      ]);

      await smartSearch.run(mockRequest);

      expect(setCacheResult).toHaveBeenCalledWith(
          "chat123",
          expect.objectContaining({
            type: "search",
            query: "deployment date",
            results: expect.any(Array),
          }),
      );
    });
  });

  describe("Search Execution", () => {
    test("should call semanticSearchSimple with correct " +
      "parameters", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(semanticSearchSimple).toHaveBeenCalledWith(
          "chat123",
          "deployment date",
          {
            limit: 10,
            messageCount: 100,
          },
      );
    });

    test("should use default parameters when not provided", async () => {
      delete mockRequest.data.limit;
      delete mockRequest.data.messageCount;

      semanticSearchSimple.mockResolvedValue([]);

      await smartSearch.run(mockRequest);

      expect(semanticSearchSimple).toHaveBeenCalledWith(
          "chat123",
          "deployment date",
          {
            limit: 10, // default
            messageCount: 100, // default
          },
      );
    });

    test("should return search results with correct structure", async () => {
      semanticSearchSimple.mockResolvedValue([
        {
          messageID: "msg1",
          chatID: "chat123",
          senderID: "user456",
          senderName: "Alice",
          senderEmail: "alice@example.com",
          text: "Deployment on Friday",
          timestamp: new Date("2025-01-01"),
          relevance: 0.95,
          reason: "Directly discusses deployment date",
        },
      ]);

      const result = await smartSearch.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        messageID: "msg1",
        senderName: "Alice",
        text: "Deployment on Friday",
        relevance: 0.95,
        reason: "Directly discusses deployment date",
      });
      expect(result.totalResults).toBe(1);
    });

    test("should handle empty search results", async () => {
      semanticSearchSimple.mockResolvedValue([]);

      const result = await smartSearch.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
    });
  });

  describe("Error Handling", () => {
    test("should handle search errors gracefully", async () => {
      semanticSearchSimple.mockRejectedValue(new Error("OpenAI timeout"));

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should handle validation errors", async () => {
      validateChatAccess.mockRejectedValue(new Error("Chat not found"));

      await expect(smartSearch.run(mockRequest)).rejects.toThrow();
    });

    test("should handle cache errors gracefully", async () => {
      getCachedResult.mockRejectedValue(new Error("Firestore error"));

      // Should continue with search even if cache fails
      semanticSearchSimple.mockResolvedValue([]);

      const result = await smartSearch.run(mockRequest);

      expect(result.success).toBe(true);
    });
  });
});

