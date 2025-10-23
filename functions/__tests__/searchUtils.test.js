/**
 * Unit tests for searchUtils.js
 *
 * Tests semantic search utilities including:
 * - Search context building
 * - JSON response parsing
 * - Query validation
 * - Error handling
 */

const {
  buildSearchContext,
  parseSearchResponse,
  validateQuery,
  SEARCH_SYSTEM_PROMPT,
} = require("../utils/searchUtils");

describe("searchUtils - buildSearchContext", () => {
  test("should build numbered context from messages", () => {
    const messages = [
      {
        messageID: "msg1",
        senderName: "Alice",
        text: "Hello world",
        timestamp: new Date("2025-01-01T12:00:00Z"),
      },
      {
        messageID: "msg2",
        senderName: "Bob",
        text: "Hi there",
        timestamp: new Date("2025-01-01T12:01:00Z"),
      },
    ];

    const context = buildSearchContext(messages);

    expect(context).toContain("0. [Alice");
    expect(context).toContain("Hello world");
    expect(context).toContain("1. [Bob");
    expect(context).toContain("Hi there");
  });

  test("should handle messages without timestamps", () => {
    const messages = [
      {
        messageID: "msg1",
        senderName: "Alice",
        text: "Test message",
      },
    ];

    const context = buildSearchContext(messages);

    expect(context).toContain("0. [Alice");
    expect(context).toContain("Test message");
  });

  test("should handle messages with Firestore timestamps", () => {
    const messages = [
      {
        messageID: "msg1",
        senderName: "Alice",
        text: "Test",
        timestamp: {
          toDate: () => new Date("2025-01-01T12:00:00Z"),
        },
      },
    ];

    const context = buildSearchContext(messages);

    expect(context).toContain("0. [Alice");
  });

  test("should handle empty messages array", () => {
    const context = buildSearchContext([]);

    expect(context).toBe("No messages found.");
  });

  test("should handle null/undefined messages", () => {
    expect(buildSearchContext(null)).toBe("No messages found.");
    expect(buildSearchContext(undefined)).toBe("No messages found.");
  });

  test("should use fallback for missing sender info", () => {
    const messages = [
      {
        messageID: "msg1",
        text: "Anonymous message",
      },
    ];

    const context = buildSearchContext(messages);

    expect(context).toContain("Unknown");
  });
});

describe("searchUtils - parseSearchResponse", () => {
  test("should parse valid JSON response", () => {
    const content = JSON.stringify({
      results: [
        {index: 0, relevance: 0.95, reason: "Direct match"},
        {index: 1, relevance: 0.8, reason: "Related"},
      ],
    });

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].index).toBe(0);
    expect(parsed.results[0].relevance).toBe(0.95);
  });

  test("should extract JSON from markdown code block", () => {
    const jsonStr = "{\"results\": [{\"index\": 0, " +
      "\"relevance\": 0.9, \"reason\": \"Match\"}]}";
    const content = "```json\n" + jsonStr + "\n```";

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].index).toBe(0);
  });

  test("should extract JSON from markdown without json tag", () => {
    const jsonStr = "{\"results\": [{\"index\": 0, " +
      "\"relevance\": 0.9, \"reason\": \"Match\"}]}";
    const content = "```\n" + jsonStr + "\n```";

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toHaveLength(1);
  });

  test("should return empty results for malformed JSON", () => {
    const content = "This is not JSON";

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toEqual([]);
  });

  test("should return empty results for JSON without results field", () => {
    const content = JSON.stringify({data: "something else"});

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toEqual([]);
  });

  test("should handle JSON with results but not array", () => {
    const content = JSON.stringify({results: "not an array"});

    const parsed = parseSearchResponse(content);

    expect(parsed.results).toEqual([]);
  });
});

describe("searchUtils - validateQuery", () => {
  test("should accept valid queries", () => {
    expect(validateQuery("deployment date")).toBe("deployment date");
    expect(validateQuery("  bug fixes  ")).toBe("bug fixes");
    expect(validateQuery("Who is responsible?")).toBe("Who is responsible?");
  });

  test("should trim whitespace", () => {
    expect(validateQuery("  test  ")).toBe("test");
  });

  test("should reject empty strings", () => {
    expect(() => validateQuery("")).toThrow("cannot be empty");
    expect(() => validateQuery("   ")).toThrow("cannot be empty");
  });

  test("should reject null/undefined", () => {
    const expectedMsg = "must be a non-empty string";
    expect(() => validateQuery(null)).toThrow(expectedMsg);
    expect(() => validateQuery(undefined)).toThrow(expectedMsg);
  });

  test("should reject non-string types", () => {
    expect(() => validateQuery(123)).toThrow("must be a non-empty string");
    expect(() => validateQuery({})).toThrow("must be a non-empty string");
    expect(() => validateQuery([])).toThrow("must be a non-empty string");
  });

  test("should reject queries that are too long", () => {
    const longQuery = "a".repeat(501);

    expect(() => validateQuery(longQuery)).toThrow("too long");
  });

  test("should accept max length queries", () => {
    const maxQuery = "a".repeat(500);

    expect(() => validateQuery(maxQuery)).not.toThrow();
  });
});

describe("searchUtils - SEARCH_SYSTEM_PROMPT", () => {
  test("should contain key instructions", () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain("semantic search");
    expect(SEARCH_SYSTEM_PROMPT).toContain("MEANING");
    expect(SEARCH_SYSTEM_PROMPT).toContain("relevance");
  });

  test("should specify JSON output format", () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain("JSON");
    expect(SEARCH_SYSTEM_PROMPT).toContain("results");
  });

  test("should define relevance scoring", () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain("0.9");
    expect(SEARCH_SYSTEM_PROMPT).toContain("relevance");
  });

  test("should specify result limit", () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain("10");
  });
});

