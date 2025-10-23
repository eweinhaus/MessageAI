/**
 * Unit tests for LangChain Wrapper Utilities
 *
 * Tests cover:
 * - Simple chain creation and invocation
 * - Structured output chain with JSON parsing
 * - JSON parsing with various inputs
 * - Retry logic with exponential backoff
 * - Token counting
 */

const {
  createSimpleChain,
  createStructuredOutputChain,
  parseJSONResponse,
  invokeWithRetry,
  tokenCount,
} = require("../utils/langchainUtils");
const {AIServiceError} = require("../utils/aiUtils");

// Mock LangChain modules
jest.mock("@langchain/openai");
jest.mock("langchain/chains");
jest.mock("langchain/output_parsers", () => ({
  StructuredOutputParser: {
    fromNamesAndDescriptions: jest.fn(() => ({
      getFormatInstructions: jest.fn(() => "Format instructions"),
    })),
  },
}));

describe("langchainUtils", () => {
  // Set up environment
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    jest.clearAllMocks();
  });

  describe("createSimpleChain", () => {
    test("should create chain with default options", () => {
      const chain = createSimpleChain("Test prompt: {input}");
      expect(chain).toBeDefined();
      expect(typeof chain.invoke).toBe("function");
    });

    test("should create chain with custom options", () => {
      const chain = createSimpleChain("Test: {input}", {
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        maxTokens: 500,
      });
      expect(chain).toBeDefined();
    });

    test("should throw error for invalid template", () => {
      expect(() => createSimpleChain("")).toThrow(AIServiceError);
      expect(() => createSimpleChain(null)).toThrow(AIServiceError);
      expect(() => createSimpleChain(123)).toThrow(AIServiceError);
    });

    test("should throw error if API key missing", () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => createSimpleChain("Test: {input}"))
          .toThrow(AIServiceError);
    });
  });

  describe("createStructuredOutputChain", () => {
    test("should create structured chain", () => {
      const schema = {
        result: "The result of the analysis",
      };
      const chain = createStructuredOutputChain(
          schema,
          "Analyze: {input}\n{format_instructions}",
      );
      expect(chain).toBeDefined();
    });

    test("should throw error for invalid schema", () => {
      expect(() => createStructuredOutputChain(
          null,
          "Test",
      )).toThrow(AIServiceError);
      expect(() => createStructuredOutputChain(
          "invalid",
          "Test",
      )).toThrow(AIServiceError);
    });

    test("should throw error for invalid template", () => {
      expect(() => createStructuredOutputChain(
          {},
          "",
      )).toThrow(AIServiceError);
      expect(() => createStructuredOutputChain(
          {},
          null,
      )).toThrow(AIServiceError);
    });
  });

  describe("parseJSONResponse", () => {
    test("should parse valid JSON", () => {
      const result = parseJSONResponse("{\"key\": \"value\"}");
      expect(result).toEqual({key: "value"});
    });

    test("should parse JSON with whitespace", () => {
      const result = parseJSONResponse("  {\"key\": \"value\"}  ");
      expect(result).toEqual({key: "value"});
    });

    test("should parse JSON in markdown code blocks", () => {
      const result = parseJSONResponse("```json\n{\"key\": \"value\"}\n```");
      expect(result).toEqual({key: "value"});
    });

    test("should parse JSON in generic code blocks", () => {
      const result = parseJSONResponse("```\n{\"key\": \"value\"}\n```");
      expect(result).toEqual({key: "value"});
    });

    test("should throw on invalid JSON with throwOnError=true", () => {
      expect(() => parseJSONResponse("invalid json"))
          .toThrow(AIServiceError);
    });

    test("should return fallback on error with throwOnError=false", () => {
      const result = parseJSONResponse("invalid", {
        throwOnError: false,
        fallback: {default: true},
      });
      expect(result).toEqual({default: true});
    });

    test("should return null fallback by default", () => {
      const result = parseJSONResponse("invalid", {throwOnError: false});
      expect(result).toBeNull();
    });

    test("should throw error for non-string input", () => {
      expect(() => parseJSONResponse(null)).toThrow(AIServiceError);
      expect(() => parseJSONResponse(undefined)).toThrow(AIServiceError);
      expect(() => parseJSONResponse(123)).toThrow(AIServiceError);
    });
  });

  describe("invokeWithRetry", () => {
    test("should return result on first try", async () => {
      const mockChain = {
        invoke: jest.fn().mockResolvedValue({text: "success"}),
      };

      const result = await invokeWithRetry(mockChain, {input: "test"});
      expect(result).toEqual({text: "success"});
      expect(mockChain.invoke).toHaveBeenCalledTimes(1);
    });

    test("should retry on transient errors", async () => {
      const mockChain = {
        invoke: jest.fn()
            .mockRejectedValueOnce(new Error("Network error"))
            .mockResolvedValueOnce({text: "success"}),
      };

      const result = await invokeWithRetry(
          mockChain,
          {input: "test"},
          {maxRetries: 3, baseDelay: 10},
      );
      expect(result).toEqual({text: "success"});
      expect(mockChain.invoke).toHaveBeenCalledTimes(2);
    });

    test("should not retry on 4xx errors", async () => {
      const mockChain = {
        invoke: jest.fn().mockRejectedValue(
            Object.assign(
                new Error("Bad request"),
                {statusCode: 400},
            ),
        ),
      };

      await expect(invokeWithRetry(mockChain, {input: "test"}))
          .rejects.toThrow("Bad request");
      expect(mockChain.invoke).toHaveBeenCalledTimes(1);
    });

    test("should throw after max retries", async () => {
      const mockChain = {
        invoke: jest.fn().mockRejectedValue(new Error("Persistent error")),
      };

      await expect(invokeWithRetry(
          mockChain,
          {input: "test"},
          {maxRetries: 3, baseDelay: 10},
      )).rejects.toThrow(AIServiceError);

      expect(mockChain.invoke).toHaveBeenCalledTimes(3);
    });
  });

  describe("tokenCount", () => {
    test("should estimate token count", () => {
      const count = tokenCount("Hello world");
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(11);
    });

    test("should return 0 for empty string", () => {
      expect(tokenCount("")).toBe(0);
    });

    test("should handle large text", () => {
      const longText = "word ".repeat(1000);
      const count = tokenCount(longText);
      expect(count).toBeGreaterThan(100);
    });
  });
});

