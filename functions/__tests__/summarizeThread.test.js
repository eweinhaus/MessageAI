/**
 * Unit Tests for summarizeThread Cloud Function
 *
 * Tests the RAG pipeline for thread summarization including:
 * - Authentication and authorization
 * - Rate limiting
 * - Cache behavior
 * - Message retrieval and context building
 * - OpenAI API integration
 * - Error handling
 */

/* eslint-disable max-len */
const {summarizeThread} = require("../summarizeThread");

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(),
    FieldValue: {
      serverTimestamp: jest.fn(() => "TIMESTAMP"),
    },
  })),
}));

// Mock dependencies
jest.mock("../utils/rateLimiter");
jest.mock("../utils/aiUtils");
jest.mock("../utils/cacheUtils");
jest.mock("../utils/errors");

const {checkRateLimit, incrementRateLimit} = require("../utils/rateLimiter");
const {
  validateChatAccess,
  getLastNMessages,
  buildMessageContext,
  getOpenAIClient,
} = require("../utils/aiUtils");
const {getCachedResult, setCacheResult} = require("../utils/cacheUtils");
const {handleAIError} = require("../utils/errors");

describe("summarizeThread Cloud Function", () => {
  let mockContext;
  let mockData;
  let mockOpenAI;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock authenticated context
    mockContext = {
      auth: {
        uid: "test-user-id",
      },
    };

    // Mock request data
    mockData = {
      chatId: "test-chat-id",
      messageCount: 50,
      forceRefresh: false,
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
    validateChatAccess.mockResolvedValue(true);
    getCachedResult.mockResolvedValue(null);
    setCacheResult.mockResolvedValue(true);
    incrementRateLimit.mockResolvedValue(true);
    getOpenAIClient.mockReturnValue(mockOpenAI);
  });

  describe("Authentication", () => {
    test("should throw error if user is not authenticated", async () => {
      const unauthContext = {};

      await expect(
          summarizeThread.call({data: mockData}, mockData, unauthContext),
      ).rejects.toThrow();
    });

    test("should proceed if user is authenticated", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test message",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test message");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point 1"],
                decisions: [],
                actionItems: [],
                summary: "Test summary",
              }),
            },
          },
        ],
      });

      const result = await summarizeThread.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("should throw error if chatId is missing", async () => {
      const invalidData = {...mockData, chatId: null};

      await expect(
          summarizeThread.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should throw error if messageCount is less than 1", async () => {
      const invalidData = {...mockData, messageCount: 0};

      await expect(
          summarizeThread.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should throw error if messageCount is greater than 100", async () => {
      const invalidData = {...mockData, messageCount: 101};

      await expect(
          summarizeThread.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should accept valid messageCount", async () => {
      const validData = {...mockData, messageCount: 50};

      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call(
          {data: validData},
          validData,
          mockContext,
      );

      expect(getLastNMessages).toHaveBeenCalledWith("test-chat-id", 50);
    });
  });

  describe("Rate Limiting", () => {
    test("should check rate limit before processing", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call({data: mockData}, mockData, mockContext);

      expect(checkRateLimit).toHaveBeenCalledWith("test-user-id", "summarize");
    });

    test("should throw error if rate limit exceeded", async () => {
      checkRateLimit.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(
          summarizeThread.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should increment rate limit after success", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call({data: mockData}, mockData, mockContext);

      expect(incrementRateLimit).toHaveBeenCalledWith(
          "test-user-id",
          "summarize",
      );
    });
  });

  describe("Chat Access Validation", () => {
    test("should validate user has access to chat", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call({data: mockData}, mockData, mockContext);

      expect(validateChatAccess).toHaveBeenCalledWith(
          "test-user-id",
          "test-chat-id",
      );
    });

    test("should throw error if user doesn't have access", async () => {
      validateChatAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
          summarizeThread.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });
  });

  describe("Cache Behavior", () => {
    test("should return cached result if available", async () => {
      const cachedSummary = {
        type: "summary",
        chatId: "test-chat-id",
        keyPoints: ["Cached point 1"],
        decisions: ["Cached decision"],
        actionItems: [],
        participants: [{name: "Alice", messageCount: 5}],
        summary: "Cached summary",
        createdAt: "TIMESTAMP",
      };

      getCachedResult.mockResolvedValue(cachedSummary);

      const result = await summarizeThread.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.cached).toBe(true);
      expect(result.keyPoints).toEqual(["Cached point 1"]);
      expect(getLastNMessages).not.toHaveBeenCalled();
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    test("should bypass cache if forceRefresh is true", async () => {
      const cachedSummary = {
        type: "summary",
        summary: "Cached summary",
      };

      getCachedResult.mockResolvedValue(cachedSummary);

      const refreshData = {...mockData, forceRefresh: true};

      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Fresh point"],
                decisions: [],
                actionItems: [],
                summary: "Fresh summary",
              }),
            },
          },
        ],
      });

      const result = await summarizeThread.call(
          {data: refreshData},
          refreshData,
          mockContext,
      );

      expect(getCachedResult).not.toHaveBeenCalled();
      expect(getLastNMessages).toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });

    test("should store result in cache after generation", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call({data: mockData}, mockData, mockContext);

      expect(setCacheResult).toHaveBeenCalled();
    });
  });

  describe("Message Retrieval", () => {
    test("should throw error if no messages found", async () => {
      getLastNMessages.mockResolvedValue([]);

      await expect(
          summarizeThread.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should retrieve correct number of messages", async () => {
      const customData = {...mockData, messageCount: 30};

      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Point"],
                decisions: [],
                actionItems: [],
                summary: "Summary",
              }),
            },
          },
        ],
      });

      await summarizeThread.call(
          {data: customData},
          customData,
          mockContext,
      );

      expect(getLastNMessages).toHaveBeenCalledWith("test-chat-id", 30);
    });
  });

  describe("Summary Generation", () => {
    test("should generate valid summary structure", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Let's deploy on Monday",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
        {
          messageID: "msg2",
          text: "Sounds good!",
          senderName: "Bob",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Let's deploy on Monday\nBob: Sounds good!");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Deployment timing discussion"],
                decisions: ["Deploy on Monday"],
                actionItems: [],
                summary: "Team decided to deploy on Monday",
              }),
            },
          },
        ],
      });

      const result = await summarizeThread.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.keyPoints).toBeDefined();
      expect(result.decisions).toBeDefined();
      expect(result.actionItems).toBeDefined();
      expect(result.participants).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    test("should calculate participant statistics", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Message 1",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
        {
          messageID: "msg2",
          text: "Message 2",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
        {
          messageID: "msg3",
          text: "Message 3",
          senderName: "Bob",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Message 1\nAlice: Message 2\nBob: Message 3");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                keyPoints: ["Discussion"],
                decisions: [],
                actionItems: [],
                summary: "Team discussion",
              }),
            },
          },
        ],
      });

      const result = await summarizeThread.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.participants).toHaveLength(2);
      expect(result.participants[0].name).toBe("Alice");
      expect(result.participants[0].messageCount).toBe(2);
      expect(result.participants[1].name).toBe("Bob");
      expect(result.participants[1].messageCount).toBe(1);
    });
  });

  describe("Error Handling", () => {
    test("should handle OpenAI API errors", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockRejectedValue(
          new Error("OpenAI API error"),
      );

      handleAIError.mockReturnValue({
        message: "AI service temporarily unavailable",
      });

      await expect(
          summarizeThread.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();

      expect(handleAIError).toHaveBeenCalled();
    });

    test("should handle JSON parsing errors", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: "Invalid JSON response",
            },
          },
        ],
      });

      await expect(
          summarizeThread.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should provide default values for missing fields", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue("Alice: Test");

      // OpenAI returns incomplete response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // Missing keyPoints, decisions, actionItems
                summary: "Summary text",
              }),
            },
          },
        ],
      });

      const result = await summarizeThread.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.keyPoints).toEqual([]);
      expect(result.decisions).toEqual([]);
      expect(result.actionItems).toEqual([]);
      expect(result.summary).toBe("Summary text");
    });
  });
});

