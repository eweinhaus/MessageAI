/**
 * Tests for Priority Detection Prompts
 */

const {
  PRIORITY_SYSTEM_PROMPT,
  PRIORITY_FEWSHOTS,
  formatFewShotExamples,
  buildPriorityPrompt,
} = require("../prompts/priorityDetection");

describe("Priority Detection Prompts", () => {
  describe("PRIORITY_SYSTEM_PROMPT", () => {
    it("should contain system instructions", () => {
      expect(PRIORITY_SYSTEM_PROMPT.toLowerCase()).toContain("analyze");
      expect(PRIORITY_SYSTEM_PROMPT).toContain("urgent");
      expect(PRIORITY_SYSTEM_PROMPT).toContain("normal");
      expect(PRIORITY_SYSTEM_PROMPT).toContain("JSON");
    });

    it("should define priority levels", () => {
      expect(PRIORITY_SYSTEM_PROMPT).toContain("urgent");
      expect(PRIORITY_SYSTEM_PROMPT).toContain("normal");
    });

    it("should include confidence scoring", () => {
      expect(PRIORITY_SYSTEM_PROMPT).toContain("confidence");
      expect(PRIORITY_SYSTEM_PROMPT).toContain("0.0-1.0");
    });
  });

  describe("PRIORITY_FEWSHOTS", () => {
    it("should have at least 3 examples", () => {
      expect(PRIORITY_FEWSHOTS.length).toBeGreaterThanOrEqual(3);
    });

    it("should have conversation and expectedOutput for each example", () => {
      PRIORITY_FEWSHOTS.forEach((example) => {
        expect(example).toHaveProperty("conversation");
        expect(example).toHaveProperty("expectedOutput");
        expect(example.expectedOutput).toHaveProperty("priorities");
        expect(Array.isArray(example.expectedOutput.priorities)).toBe(true);
      });
    });

    it("should have valid priority data in examples", () => {
      PRIORITY_FEWSHOTS.forEach((example) => {
        example.expectedOutput.priorities.forEach((priority) => {
          expect(priority).toHaveProperty("messageId");
          expect(priority).toHaveProperty("priority");
          expect(priority).toHaveProperty("reason");
          expect(priority).toHaveProperty("confidence");
          expect(["urgent", "normal"]).toContain(priority.priority);
          expect(priority.confidence).toBeGreaterThanOrEqual(0);
          expect(priority.confidence).toBeLessThanOrEqual(1);
        });
      });
    });
  });

  describe("formatFewShotExamples", () => {
    it("should format examples as a string", () => {
      const formatted = formatFewShotExamples();
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("should include all examples", () => {
      const formatted = formatFewShotExamples();
      expect(formatted).toContain("Example 1");
      expect(formatted).toContain("Example 2");
      expect(formatted).toContain("Example 3");
    });

    it("should include conversation and output sections", () => {
      const formatted = formatFewShotExamples();
      expect(formatted).toContain("Input:");
      expect(formatted).toContain("Expected Output:");
    });
  });

  describe("buildPriorityPrompt", () => {
    const testConversation = `
      [10:00] Alice: This is urgent!
      [10:01] Bob: No problem, I'll help.
    `;

    it("should build prompt without examples", () => {
      const prompt = buildPriorityPrompt(testConversation, false);
      expect(prompt).toContain(PRIORITY_SYSTEM_PROMPT);
      expect(prompt).toContain(testConversation);
      expect(prompt).not.toContain("Example 1");
    });

    it("should build prompt with examples", () => {
      const prompt = buildPriorityPrompt(testConversation, true);
      expect(prompt).toContain(PRIORITY_SYSTEM_PROMPT);
      expect(prompt).toContain(testConversation);
      expect(prompt).toContain("Example 1");
    });

    it("should include analysis instruction", () => {
      const prompt = buildPriorityPrompt(testConversation, false);
      expect(prompt).toContain("analyze this conversation");
      expect(prompt).toContain("Return JSON");
    });
  });
});

