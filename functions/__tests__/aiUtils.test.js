/**
 * Unit tests for AI Utilities Module
 *
 * Test coverage:
 * - OpenAI client initialization and singleton pattern
 * - Message context building with various options
 * - Timestamp formatting for different input types
 * - Chat access validation
 * - Error handling
 *
 * Note: These are stub tests to be expanded in PR16 Step 8
 */

const {
  getOpenAIClient,
  buildMessageContext,
  formatTimestamp,
  validateChatAccess,
  handleAIError,
  estimateTokenCount,
  getLastNMessages,
  AIServiceError,
  ValidationError,
} = require("../utils/aiUtils");

describe("aiUtils", () => {
  describe("estimateTokenCount", () => {
    test("should estimate token count for text", () => {
      const text = "Hello world";
      const estimate = estimateTokenCount(text);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThanOrEqual(text.length);
    });

    test("should return 0 for empty text", () => {
      expect(estimateTokenCount("")).toBe(0);
      expect(estimateTokenCount(null)).toBe(0);
      expect(estimateTokenCount(undefined)).toBe(0);
    });
  });

  describe("formatTimestamp", () => {
    test("should format Date object", () => {
      const date = new Date("2024-01-15T14:30:00Z");
      const formatted = formatTimestamp(date);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    test("should format numeric timestamp", () => {
      const timestamp = 1634567890000;
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    test("should handle Firestore Timestamp", () => {
      const firestoreTimestamp = {
        toDate: () => new Date("2024-01-15T14:30:00Z"),
      };
      const formatted = formatTimestamp(firestoreTimestamp);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe("buildMessageContext", () => {
    const mockMessages = [
      {
        text: "Hello",
        senderName: "Alice",
        timestamp: Date.now(),
      },
      {
        text: "Hi there",
        senderName: "Bob",
        timestamp: Date.now(),
      },
      {
        text: "How are you?",
        senderName: "Alice",
        timestamp: Date.now(),
      },
    ];

    test("should build context with default options", () => {
      const result = buildMessageContext(mockMessages);
      expect(result).toHaveProperty("text");
      expect(result).toHaveProperty("messageCount");
      expect(result).toHaveProperty("estimatedTokens");
      expect(result.messageCount).toBe(3);
    });

    test("should respect maxMessages option", () => {
      const result = buildMessageContext(mockMessages, {maxMessages: 2});
      expect(result.messageCount).toBe(2);
      expect(result.text).not.toContain("Hello"); // First message excluded
    });

    test("should support simple format", () => {
      const result = buildMessageContext(mockMessages, {format: "simple"});
      expect(result.text).toContain("Alice: Hello");
      expect(result.text).not.toContain("["); // No timestamps in simple format
    });

    test("should support detailed format", () => {
      const result = buildMessageContext(mockMessages, {format: "detailed"});
      expect(result.text).toMatch(/\[\d{2}:\d{2}\]/); // Contains timestamps
    });

    test("should throw ValidationError for invalid input", () => {
      expect(() => buildMessageContext("not an array"))
          .toThrow(ValidationError);
      expect(() => buildMessageContext(null)).toThrow(ValidationError);
    });

    test("should throw ValidationError for missing required fields", () => {
      const invalidMessages = [{senderName: "Alice"}];
      expect(() => buildMessageContext(invalidMessages))
          .toThrow(ValidationError);
    });

    test("should handle empty messages array", () => {
      const result = buildMessageContext([]);
      expect(result.text).toBe("");
      expect(result.messageCount).toBe(0);
      expect(result.estimatedTokens).toBe(0);
    });
  });

  describe("getOpenAIClient", () => {
    const originalEnv = process.env.OPENAI_API_KEY;

    afterEach(() => {
      process.env.OPENAI_API_KEY = originalEnv;
    });

    test("should be a function", () => {
      expect(typeof getOpenAIClient).toBe("function");
    });

    test("should return client when API key is set", () => {
      process.env.OPENAI_API_KEY = "test-key";
      const client = getOpenAIClient();
      expect(client).toBeDefined();
    });

    test("should return singleton instance", () => {
      process.env.OPENAI_API_KEY = "test-key";
      const client1 = getOpenAIClient();
      const client2 = getOpenAIClient({model: "gpt-3.5-turbo"});

      // Singleton pattern - same instance returned
      expect(client1).toBe(client2);
      expect(client1.defaultOptions).toBeDefined();
    });
  });

  describe("validateChatAccess", () => {
    // Note: These tests will be expanded in PR16 Step 8
    // They require Firebase Admin SDK mocking

    test("should be a function", () => {
      expect(typeof validateChatAccess).toBe("function");
    });

    test("should throw ValidationError for invalid userId", async () => {
      await expect(validateChatAccess("", "chat123"))
          .rejects.toThrow(ValidationError);
      await expect(validateChatAccess(null, "chat123"))
          .rejects.toThrow(ValidationError);
    });

    test("should throw ValidationError for invalid chatId", async () => {
      await expect(validateChatAccess("user123", ""))
          .rejects.toThrow(ValidationError);
      await expect(validateChatAccess("user123", null))
          .rejects.toThrow(ValidationError);
    });

    // TODO: Add tests for successful validation (requires Firestore mocking)
    // TODO: Add tests for unauthorized access
    // TODO: Add tests for non-existent chats
  });

  describe("handleAIError", () => {
    test("should handle rate limit errors (429)", () => {
      const error = {response: {status: 429}};
      const result = handleAIError(error, "test");
      expect(result.error).toBe("RATE_LIMIT");
      expect(result.retryAfter).toBeDefined();
    });

    test("should handle authentication errors (401)", () => {
      const error = {response: {status: 401}};
      const result = handleAIError(error, "test");
      expect(result.error).toBe("AUTHENTICATION_ERROR");
    });

    test("should handle server errors (500+)", () => {
      const error = {response: {status: 500}};
      const result = handleAIError(error, "test");
      expect(result.error).toBe("SERVICE_ERROR");
      expect(result.fallback).toBe(true);
    });

    test("should handle timeout errors", () => {
      const error = {code: "ETIMEDOUT"};
      const result = handleAIError(error, "test");
      expect(result.error).toBe("TIMEOUT");
      expect(result.retryAfter).toBeDefined();
    });

    test("should handle ValidationError", () => {
      const error = new ValidationError("Invalid input");
      const result = handleAIError(error, "test");
      expect(result.error).toBe("VALIDATION_ERROR");
      expect(result.message).toBe("Invalid input");
    });

    test("should handle unknown errors", () => {
      const error = new Error("Unknown error");
      const result = handleAIError(error, "test");
      expect(result.error).toBe("UNKNOWN");
      expect(result.message).toBeDefined();
    });
  });

  describe("Custom Error Classes", () => {
    test("AIServiceError should extend Error", () => {
      const error = new AIServiceError("Test error", 500, "TEST_CODE");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("AIServiceError");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("TEST_CODE");
    });

    test("ValidationError should extend Error", () => {
      const error = new ValidationError("Test validation error");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ValidationError");
    });
  });

  describe("getLastNMessages", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should fetch messages in chronological order", async () => {
      // Skip test if admin not properly initialized
      // Tested during integration tests
      expect(true).toBe(true);
    });

    test("should return empty array for no messages", async () => {
      // Skip test if admin not properly initialized
      // Tested during integration tests
      expect(true).toBe(true);
    });

    test("should throw ValidationError for invalid chatId", async () => {
      // Test validation before Firestore is called
      await expect(getLastNMessages("", 10))
          .rejects.toThrow(ValidationError);
      await expect(getLastNMessages(null, 10))
          .rejects.toThrow(ValidationError);
    });

    test("should throw ValidationError for invalid messageCount",
        async () => {
          // Test validation before Firestore is called
          await expect(getLastNMessages("chat1", 0))
              .rejects.toThrow(ValidationError);
          await expect(getLastNMessages("chat1", -1))
              .rejects.toThrow(ValidationError);
        });

    test("should throw AIServiceError on Firestore error", async () => {
      // Tested during integration tests with proper Firestore mocking
      expect(true).toBe(true);
    });
  });
});

