/**
 * Unit Tests for summarizeUnread Cloud Function
 *
 * Tests the global unread summarization including:
 * - Authentication
 * - Rate limiting
 * - Cache behavior
 * - Watermark tracking
 * - Delta processing (only new messages)
 * - Multi-chat summarization and merging
 * - Error handling
 */

/* eslint-disable max-len */
const {summarizeUnread} = require("../summarizeUnread");

// Mock Firebase Admin
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: mockCollection,
    FieldValue: {
      serverTimestamp: jest.fn(() => "TIMESTAMP"),
    },
    Timestamp: {
      fromMillis: jest.fn((millis) => ({toMillis: () => millis})),
      now: jest.fn(() => ({toMillis: () => Date.now()})),
    },
  })),
}));

// Mock dependencies
jest.mock("../utils/rateLimiter");
jest.mock("../utils/cacheUtils");
jest.mock("../utils/errors");
jest.mock("../utils/aiUtils");

const {checkRateLimit, incrementRateLimit} = require("../utils/rateLimiter");
const {getCachedResult, setCacheResult} = require("../utils/cacheUtils");
const {handleAIError} = require("../utils/errors");
const {buildMessageContext, getOpenAIClient} = require("../utils/aiUtils");

describe("summarizeUnread Cloud Function", () => {
  let mockRequest;
  let mockContext;
  let mockOpenAI;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock authenticated request (Functions v2 format)
    mockRequest = {
      auth: {
        uid: "test-user-id",
      },
      data: {
        forceRefresh: false,
      },
    };

    mockContext = {
      auth: {uid: "test-user-id"},
    };

    // Mock OpenAI client
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // Set up default mock implementations
    checkRateLimit.mockResolvedValue(true);
    getCachedResult.mockResolvedValue(null);
    setCacheResult.mockResolvedValue(true);
    incrementRateLimit.mockResolvedValue(true);
    getOpenAIClient.mockReturnValue(mockOpenAI);
    buildMessageContext.mockReturnValue({
      text: "Mock context",
      messageCount: 5,
      estimatedTokens: 100,
    });

    // Mock OpenAI response
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: "Test summary",
            keyPoints: ["Point 1", "Point 2"],
            decisions: ["Decision 1"],
            actionItems: [{task: "Do something", assignee: "Alice"}],
          }),
        },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });

    // Setup Firestore mocks
    mockCollection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
    });

    mockDoc.mockReturnValue({
      collection: mockCollection,
      get: mockGet,
      set: mockSet,
    });

    mockWhere.mockReturnValue({
      get: mockGet,
    });

    mockOrderBy.mockReturnValue({
      limit: mockLimit,
    });

    mockLimit.mockReturnValue({
      get: mockGet,
    });
  });

  describe("Authentication", () => {
    test("should reject unauthenticated requests", async () => {
      const unauthContext = {};
      await expect(
          summarizeUnread.call({data: mockRequest.data}, mockRequest.data, unauthContext),
      ).rejects.toThrow();
    });

    test("should accept authenticated requests", async () => {
      // Mock empty watermarks (first run)
      mockGet.mockResolvedValue({
        exists: false,
      });

      // Mock no chats
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: jest.fn(),
        }),
      });

      const result = await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);
      expect(result.success).toBe(true);
      expect(result.hasUnread).toBe(false);
    });
  });

  describe("Rate Limiting", () => {
    test("should check rate limit before processing", async () => {
      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(checkRateLimit).toHaveBeenCalledWith("test-user-id", "summarizeGlobal");
    });

    test("should increment rate limit after success", async () => {
      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(incrementRateLimit).toHaveBeenCalledWith("test-user-id", "summarizeGlobal");
    });
  });

  describe("Cache Behavior", () => {
    test("should return cached result if available", async () => {
      const cachedData = {
        result: {
          hasUnread: true,
          summary: "Cached summary",
          chatCount: 2,
        },
        age: 300000, // 5 minutes
      };

      getCachedResult.mockResolvedValue(cachedData);

      const result = await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.hasUnread).toBe(true);
      expect(getCachedResult).toHaveBeenCalledWith("test-user-id", "summaryGlobal", {maxAge: 900000});
    });

    test("should skip cache when forceRefresh is true", async () => {
      mockRequest.data.forceRefresh = true;

      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(getCachedResult).not.toHaveBeenCalled();
    });

    test("should cache successful results", async () => {
      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(setCacheResult).toHaveBeenCalledWith(
          "test-user-id",
          expect.objectContaining({
            type: "summaryGlobal",
            result: expect.any(Object),
            metadata: expect.any(Object),
          }),
      );
    });
  });

  describe("Watermark Tracking", () => {
    test("should handle first run with no watermarks", async () => {
      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      const result = await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(result.success).toBe(true);
    });

    test("should fetch existing watermarks", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          "chat1": 1234567890000,
          "chat2": 1234567891000,
          "updatedAt": "TIMESTAMP",
        }),
      });

      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(mockGet).toHaveBeenCalled();
    });
  });

  describe("No Unread Messages", () => {
    test("should return hasUnread:false when no chats", async () => {
      mockGet.mockResolvedValue({exists: false});

      // Mock empty chat queries
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: jest.fn(),
        }),
      });

      const result = await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);

      expect(result.success).toBe(true);
      expect(result.hasUnread).toBe(false);
    });

    test("should return hasUnread:false when no unread messages", async () => {
      mockGet.mockResolvedValue({exists: false});

      // Mock chats but no unread messages
      const mockChatData = [{chatID: "chat1", type: "1:1", participantIDs: ["user1", "user2"]}];
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => mockChatData.forEach((chat) => callback({data: () => chat})),
        }),
      });

      // Mock collection for messages query - empty results
      mockCollection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue({
                    empty: true,
                    docs: [],
                  }),
                }),
              }),
            }),
          }),
          get: mockGet,
          set: mockSet,
        }),
        where: mockWhere,
      });

      const result = await summarizeUnread(mockRequest);

      expect(result.success).toBe(true);
      expect(result.hasUnread).toBe(false);
    });
  });

  describe("Error Handling", () => {
    test("should handle Firestore errors gracefully", async () => {
      mockGet.mockRejectedValue(new Error("Firestore error"));

      handleAIError.mockReturnValue({
        message: "Database error occurred",
        code: "internal",
      });

      await expect(
          summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext),
      ).rejects.toThrow();
      expect(handleAIError).toHaveBeenCalled();
    });

    test("should handle OpenAI errors", async () => {
      mockGet.mockResolvedValue({exists: false});

      // Mock chats with messages
      const mockChatData = [{chatID: "chat1", type: "1:1", participantIDs: ["user1", "user2"], participantNames: ["Alice", "Bob"]}];
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => mockChatData.forEach((chat) => callback({data: () => chat})),
        }),
      });

      // Mock messages
      mockCollection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue({
                    empty: false,
                    docs: [{
                      data: () => ({
                        messageID: "msg1",
                        text: "Hello",
                        timestamp: {toMillis: () => Date.now()},
                      }),
                    }],
                  }),
                }),
              }),
            }),
          }),
          get: mockGet,
          set: mockSet,
        }),
        where: mockWhere,
      });

      // Mock OpenAI error
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error("OpenAI API error"));

      handleAIError.mockReturnValue({
        message: "AI service error",
        code: "internal",
      });

      await expect(summarizeUnread(mockRequest)).rejects.toThrow();
    });
  });

  describe("Input Validation", () => {
    test("should handle missing request data", async () => {
      mockRequest.data = undefined;

      mockGet.mockResolvedValue({exists: false});
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({forEach: jest.fn()}),
      });

      const result = await summarizeUnread.call({data: mockRequest.data}, mockRequest.data, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe("Context Window Optimization", () => {
    test("should fetch up to 6 previous messages before first unread", async () => {
      mockRequest.data.mode = "rich";
      mockGet.mockResolvedValue({exists: false});

      // Mock chat with unread messages
      const mockChatData = [{
        chatID: "chat1",
        type: "1:1",
        participantIDs: ["test-user-id", "user2"],
        participantNames: ["Alice", "Bob"],
      }];

      let previousQueryCalled = false;
      let previousQueryLimit = 0;

      // Mock the chat query
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => mockChatData.forEach((chat) => callback({data: () => chat})),
        }),
      });

      // Mock collection to track query patterns
      mockCollection.mockImplementation((collectionName) => {
        if (collectionName === "chats") {
          return {
            doc: jest.fn((docId) => ({
              collection: jest.fn((subCollection) => {
                if (subCollection === "messages") {
                  return {
                    // This is the unread messages query
                    where: jest.fn().mockReturnValue({
                      orderBy: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          get: jest.fn().mockResolvedValue({
                            empty: false,
                            docs: [
                              {id: "msg4", data: () => ({messageID: "msg4", text: "Unread 1", timestamp: {toMillis: () => 1000000004000}})},
                              {id: "msg5", data: () => ({messageID: "msg5", text: "Unread 2", timestamp: {toMillis: () => 1000000005000}})},
                              {id: "msg6", data: () => ({messageID: "msg6", text: "Unread 3", timestamp: {toMillis: () => 1000000006000}})},
                            ],
                          }),
                        }),
                      }),
                    }),
                    // This is the previous messages query
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn((limit) => {
                        previousQueryCalled = true;
                        previousQueryLimit = limit;
                        return {
                          get: jest.fn().mockResolvedValue({
                            docs: [
                              {id: "msg3", data: () => ({messageID: "msg3", text: "Read 3", timestamp: {toMillis: () => 1000000003000}})},
                              {id: "msg2", data: () => ({messageID: "msg2", text: "Read 2", timestamp: {toMillis: () => 1000000002000}})},
                              {id: "msg1", data: () => ({messageID: "msg1", text: "Read 1", timestamp: {toMillis: () => 1000000001000}})},
                            ],
                          }),
                        };
                      }),
                    }),
                  };
                }
                return {where: jest.fn(), orderBy: jest.fn()};
              }),
              get: mockGet,
              set: mockSet,
            })),
            where: mockWhere,
          };
        }
        return {doc: mockDoc, where: mockWhere};
      });

      await summarizeUnread(mockRequest);

      expect(previousQueryCalled).toBe(true);
      expect(previousQueryLimit).toBe(6);
    });

    test("should handle chats with fewer than 6 previous messages", async () => {
      mockRequest.data.mode = "rich";
      mockGet.mockResolvedValue({exists: false});

      const mockChatData = [{
        chatID: "chat1",
        type: "1:1",
        participantIDs: ["test-user-id", "user2"],
        participantNames: ["Alice", "Bob"],
      }];

      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => mockChatData.forEach((chat) => callback({data: () => chat})),
        }),
      });

      mockCollection.mockImplementation((collectionName) => {
        if (collectionName === "chats") {
          return {
            doc: jest.fn(() => ({
              collection: jest.fn((subCollection) => {
                if (subCollection === "messages") {
                  return {
                    where: jest.fn().mockReturnValue({
                      orderBy: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          get: jest.fn().mockResolvedValue({
                            empty: false,
                            docs: [
                              {id: "msg3", data: () => ({messageID: "msg3", text: "Unread 1", timestamp: {toMillis: () => 1000000003000}})},
                            ],
                          }),
                        }),
                      }),
                    }),
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                          docs: [
                            {id: "msg2", data: () => ({messageID: "msg2", text: "Read 2", timestamp: {toMillis: () => 1000000002000}})},
                            {id: "msg1", data: () => ({messageID: "msg1", text: "Read 1", timestamp: {toMillis: () => 1000000001000}})},
                          ],
                        }),
                      }),
                    }),
                  };
                }
                return {where: jest.fn(), orderBy: jest.fn()};
              }),
              get: mockGet,
              set: mockSet,
            })),
            where: mockWhere,
          };
        }
        return {doc: mockDoc, where: mockWhere};
      });

      const result = await summarizeUnread(mockRequest);

      expect(result.success).toBe(true);
      // Should handle gracefully with only 2 previous messages available
    });

    test("should skip summarization when no unread messages exist", async () => {
      mockRequest.data.mode = "rich";
      mockGet.mockResolvedValue({exists: false});

      const mockChatData = [{
        chatID: "chat1",
        type: "1:1",
        participantIDs: ["test-user-id", "user2"],
        participantNames: ["Alice", "Bob"],
      }];

      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => mockChatData.forEach((chat) => callback({data: () => chat})),
        }),
      });

      mockCollection.mockImplementation((collectionName) => {
        if (collectionName === "chats") {
          return {
            doc: jest.fn(() => ({
              collection: jest.fn((subCollection) => {
                if (subCollection === "messages") {
                  return {
                    where: jest.fn().mockReturnValue({
                      orderBy: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          get: jest.fn().mockResolvedValue({
                            empty: true,
                            docs: [],
                          }),
                        }),
                      }),
                    }),
                  };
                }
                return {where: jest.fn(), orderBy: jest.fn()};
              }),
              get: mockGet,
              set: mockSet,
            })),
            where: mockWhere,
          };
        }
        return {doc: mockDoc, where: mockWhere};
      });

      const result = await summarizeUnread(mockRequest);

      expect(result.success).toBe(true);
      expect(result.hasUnread).toBe(false);
      // Should not make OpenAI call for chats with no unread messages
    });
  });
});

