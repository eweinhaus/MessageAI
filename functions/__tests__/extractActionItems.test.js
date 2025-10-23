/**
 * Unit Tests for extractActionItems Cloud Function
 *
 * Tests action item extraction including:
 * - Authentication and authorization
 * - Rate limiting
 * - Cache behavior
 * - Message retrieval and context building
 * - OpenAI API integration
 * - Firestore batch writes
 * - Error handling
 */

/* eslint-disable max-len */
const {extractActionItems} = require("../extractActionItems");

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(),
    batch: jest.fn(() => ({
      set: jest.fn(),
      commit: jest.fn(),
    })),
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
jest.mock("../utils/langchainUtils");

const {checkRateLimit, incrementRateLimit} = require("../utils/rateLimiter");
const {
  validateChatAccess,
  getLastNMessages,
  buildMessageContext,
  getOpenAIClient,
} = require("../utils/aiUtils");
const {getCachedResult, setCacheResult} = require("../utils/cacheUtils");
const {handleAIError} = require("../utils/errors");
const {parseJSONResponse} = require("../utils/langchainUtils");

describe("extractActionItems Cloud Function", () => {
  let mockContext;
  let mockData;
  let mockOpenAI;
  let mockBatch;
  let mockFirestore;

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

    // Mock batch operations
    mockBatch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(true),
    };

    // Mock Firestore
    mockFirestore = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      batch: jest.fn(() => mockBatch),
      FieldValue: {
        serverTimestamp: jest.fn(() => "TIMESTAMP"),
      },
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
    parseJSONResponse.mockImplementation((json) => JSON.parse(json));

    // Mock admin.firestore()
    const admin = require("firebase-admin");
    admin.firestore.mockReturnValue(mockFirestore);
  });

  describe("Authentication", () => {
    test("should throw error if user is not authenticated", async () => {
      const unauthContext = {};

      await expect(
          extractActionItems.call({data: mockData}, mockData, unauthContext),
      ).rejects.toThrow();
    });

    test("should proceed if user is authenticated", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "I'll do this by EOD",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    task: "Do this",
                    assignee: "Alice",
                    deadline: "EOD",
                    type: "commitment",
                    priority: "high",
                    sourceMessageId: "msg1",
                    context: "Test context",
                  },
                ],
              }),
            },
          },
        ],
      });

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.cached).toBe(false);
    });
  });

  describe("Input Validation", () => {
    test("should throw error if chatId is missing", async () => {
      const invalidData = {...mockData, chatId: null};

      await expect(
          extractActionItems.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should throw error if chatId is not a string", async () => {
      const invalidData = {...mockData, chatId: 123};

      await expect(
          extractActionItems.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should throw error if messageCount is less than 1", async () => {
      const invalidData = {...mockData, messageCount: 0};

      await expect(
          extractActionItems.call({data: invalidData}, invalidData, mockContext),
      ).rejects.toThrow();
    });

    test("should throw error if messageCount is greater than 100", async () => {
      const invalidData = {...mockData, messageCount: 101};

      await expect(
          extractActionItems.call({data: invalidData}, invalidData, mockContext),
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

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: validData},
          validData,
          mockContext,
      );

      expect(getLastNMessages).toHaveBeenCalledWith("test-chat-id", 50);
    });
  });

  describe("Rate Limiting", () => {
    test("should check rate limit before processing", async () => {
      getLastNMessages.mockResolvedValue([]);

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(checkRateLimit).toHaveBeenCalledWith("test-user-id", "actionItems");
    });

    test("should throw error if rate limit exceeded", async () => {
      checkRateLimit.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should increment rate limit after successful extraction", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(incrementRateLimit).toHaveBeenCalledWith("test-user-id", "actionItems");
    });
  });

  describe("Authorization", () => {
    test("should validate user has access to chat", async () => {
      getLastNMessages.mockResolvedValue([]);

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(validateChatAccess).toHaveBeenCalledWith("test-user-id", "test-chat-id");
    });

    test("should throw error if user does not have access", async () => {
      validateChatAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });
  });

  describe("Caching", () => {
    test("should check cache before processing", async () => {
      getLastNMessages.mockResolvedValue([]);

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(getCachedResult).toHaveBeenCalledWith(
          "test-chat-id",
          "actionItems",
          {maxAge: 24 * 60 * 60 * 1000},
      );
    });

    test("should return cached result if available", async () => {
      const cachedResult = {
        result: {
          actionItems: [{task: "Cached task", type: "task", priority: "medium"}],
          totalFound: 1,
          messageCount: 10,
        },
        age: 1000,
      };

      getCachedResult.mockResolvedValue(cachedResult);

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.cached).toBe(true);
      expect(result.actionItems).toBeDefined();
      expect(getLastNMessages).not.toHaveBeenCalled();
    });

    test("should skip cache if forceRefresh is true", async () => {
      const dataWithRefresh = {...mockData, forceRefresh: true};

      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: dataWithRefresh},
          dataWithRefresh,
          mockContext,
      );

      expect(getCachedResult).not.toHaveBeenCalled();
      expect(getLastNMessages).toHaveBeenCalled();
    });

    test("should cache results after successful extraction", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(setCacheResult).toHaveBeenCalled();
    });
  });

  describe("Message Handling", () => {
    test("should return empty result if no messages found", async () => {
      getLastNMessages.mockResolvedValue([]);

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.actionItems).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.messageCount).toBe(0);
    });

    test("should build context from messages", async () => {
      const messages = [
        {
          messageID: "msg1",
          text: "I'll do this",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
        {
          messageID: "msg2",
          text: "Can you do that?",
          senderName: "Bob",
          timestamp: {toMillis: () => Date.now()},
        },
      ];

      getLastNMessages.mockResolvedValue(messages);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 200,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(buildMessageContext).toHaveBeenCalledWith(
          messages,
          {format: "detailed", maxMessages: 50},
      );
    });
  });

  describe("OpenAI Integration", () => {
    test("should call OpenAI with correct parameters", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 2000,
            response_format: {type: "json_object"},
          }),
      );
    });

    test("should handle OpenAI API errors", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockRejectedValue(
          new Error("OpenAI error"),
      );

      handleAIError.mockReturnValue({
        message: "AI service error",
      });

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();

      expect(handleAIError).toHaveBeenCalled();
    });
  });

  describe("Response Parsing", () => {
    test("should parse valid JSON response", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "I'll do this",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      const actionItems = [
        {
          task: "Do this",
          assignee: "Alice",
          deadline: null,
          type: "commitment",
          priority: "medium",
          sourceMessageId: "msg1",
          context: "Test",
        },
      ];

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({actionItems}),
            },
          },
        ],
      });

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.actionItems).toHaveLength(1);
      expect(result.actionItems[0].task).toBe("Do this");
    });

    test("should throw error if response missing actionItems array", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({invalid: "data"}),
            },
          },
        ],
      });

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should validate action item schema", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    // Missing required fields
                    task: "Do something",
                  },
                ],
              }),
            },
          },
        ],
      });

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should validate type field", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    task: "Do something",
                    type: "invalid-type",
                    priority: "medium",
                    sourceMessageId: "msg1",
                  },
                ],
              }),
            },
          },
        ],
      });

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });

    test("should validate priority field", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    task: "Do something",
                    type: "task",
                    priority: "invalid-priority",
                    sourceMessageId: "msg1",
                  },
                ],
              }),
            },
          },
        ],
      });

      await expect(
          extractActionItems.call({data: mockData}, mockData, mockContext),
      ).rejects.toThrow();
    });
  });

  describe("Firestore Storage", () => {
    test("should store action items in Firestore", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "I'll do this",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    task: "Do this",
                    assignee: "Alice",
                    deadline: "EOD",
                    type: "commitment",
                    priority: "high",
                    sourceMessageId: "msg1",
                    context: "Test",
                  },
                ],
              }),
            },
          },
        ],
      });

      await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(mockBatch.set).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    test("should handle multiple action items", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      const actionItems = Array(5).fill(null).map((_, i) => ({
        task: `Task ${i}`,
        assignee: "Alice",
        deadline: null,
        type: "task",
        priority: "medium",
        sourceMessageId: `msg${i}`,
        context: "Test",
      }));

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({actionItems}),
            },
          },
        ],
      });

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result.totalFound).toBe(5);
      expect(mockBatch.set).toHaveBeenCalledTimes(5);
    });
  });

  describe("Return Values", () => {
    test("should return correct structure", async () => {
      getLastNMessages.mockResolvedValue([
        {
          messageID: "msg1",
          text: "Test",
          senderName: "Alice",
          timestamp: {toMillis: () => Date.now()},
        },
      ]);

      buildMessageContext.mockReturnValue({
        estimatedTokens: 100,
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  {
                    task: "Task",
                    assignee: "Alice",
                    deadline: null,
                    type: "task",
                    priority: "medium",
                    sourceMessageId: "msg1",
                    context: "Test",
                  },
                ],
              }),
            },
          },
        ],
      });

      const result = await extractActionItems.call(
          {data: mockData},
          mockData,
          mockContext,
      );

      expect(result).toHaveProperty("actionItems");
      expect(result).toHaveProperty("totalFound");
      expect(result).toHaveProperty("messageCount");
      expect(result).toHaveProperty("cached");
      expect(result).toHaveProperty("duration");
    });
  });
});

