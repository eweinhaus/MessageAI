/**
 * Unit tests for Error Handling Framework
 *
 * Tests cover:
 * - Custom error classes
 * - Error mapping and user-friendly responses
 * - Error logging (mocked)
 */

const {
  AIServiceError,
  ValidationError,
  CacheError,
  RateLimitError,
  handleAIError,
  logError,
} = require("../utils/errors");

describe("errors", () => {
  describe("Custom Error Classes", () => {
    test("AIServiceError should extend Error", () => {
      const error = new AIServiceError("Test error", 500, "TEST_CODE");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("AIServiceError");
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("TEST_CODE");
    });

    test("AIServiceError should have default values", () => {
      const error = new AIServiceError("Test");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("UNKNOWN");
    });

    test("ValidationError should extend Error", () => {
      const error = new ValidationError("Invalid input");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ValidationError");
      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    test("CacheError should extend Error", () => {
      const error = new CacheError("Cache failed", "CACHE_READ_ERROR");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("CacheError");
      expect(error.message).toBe("Cache failed");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("CACHE_READ_ERROR");
    });

    test("CacheError should have default code", () => {
      const error = new CacheError("Cache failed");
      expect(error.code).toBe("CACHE_ERROR");
    });

    test("RateLimitError should extend Error", () => {
      const error = new RateLimitError("Too many requests", 120);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("RateLimitError");
      expect(error.message).toBe("Too many requests");
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(error.retryAfter).toBe(120);
    });

    test("RateLimitError should have default retryAfter", () => {
      const error = new RateLimitError("Too many requests");
      expect(error.retryAfter).toBe(60);
    });
  });

  describe("handleAIError", () => {
    test("should handle RateLimitError", () => {
      const error = new RateLimitError("Too many requests", 90);
      const result = handleAIError(error, "test");

      expect(result.error).toBe("RATE_LIMIT");
      expect(result.message).toBe("Too many requests");
      expect(result.retryAfter).toBe(90);
    });

    test("should handle 429 status from API", () => {
      const error = {response: {status: 429}};
      const result = handleAIError(error, "test");

      expect(result.error).toBe("RATE_LIMIT");
      expect(result.retryAfter).toBe(30);
    });

    test("should handle 401 authentication errors", () => {
      const error = {response: {status: 401}};
      const result = handleAIError(error, "test");

      expect(result.error).toBe("AUTHENTICATION_ERROR");
      expect(result.message).toContain("authentication");
    });

    test("should handle 500 server errors", () => {
      const error = {response: {status: 500}};
      const result = handleAIError(error, "test");

      expect(result.error).toBe("SERVICE_ERROR");
      expect(result.fallback).toBe(true);
    });

    test("should handle timeout errors by code", () => {
      const error = {code: "ETIMEDOUT"};
      const result = handleAIError(error, "test");

      expect(result.error).toBe("TIMEOUT");
      expect(result.retryAfter).toBe(10);
    });

    test("should handle timeout errors by message", () => {
      const error = new Error("Request timeout exceeded");
      const result = handleAIError(error, "test");

      expect(result.error).toBe("TIMEOUT");
      expect(result.retryAfter).toBe(10);
    });

    test("should handle ValidationError", () => {
      const error = new ValidationError("Invalid input");
      const result = handleAIError(error, "test");

      expect(result.error).toBe("VALIDATION_ERROR");
      expect(result.message).toBe("Invalid input");
    });

    test("should handle CacheError", () => {
      const error = new CacheError("Cache failed");
      const result = handleAIError(error, "test");

      expect(result.error).toBe("CACHE_ERROR");
      expect(result.fallback).toBe(true);
    });

    test("should handle AIServiceError", () => {
      const error = new AIServiceError("Service error", 500, "TEST_CODE");
      const result = handleAIError(error, "test");

      expect(result.error).toBe("TEST_CODE");
      expect(result.message).toBe("Service error");
    });

    test("should handle unknown errors", () => {
      const error = new Error("Unknown error");
      const result = handleAIError(error, "test");

      expect(result.error).toBe("UNKNOWN");
      expect(result.message).toContain("Something went wrong");
    });

    test("should include error details in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Test error");
      const result = handleAIError(error, "test");

      expect(result.details).toBe("Test error");

      process.env.NODE_ENV = originalEnv;
    });

    test("should not include details in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const error = new Error("Test error");
      const result = handleAIError(error, "test");

      expect(result.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logError", () => {
    test("should not log in development", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Test error");
      await logError(error, "test", {uid: "user123"});

      // No assertions - just ensuring it doesn't throw
      expect(true).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    test("should be a function", () => {
      expect(typeof logError).toBe("function");
    });
  });
});

