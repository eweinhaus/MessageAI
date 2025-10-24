/**
 * Tests for Action Item Extraction Prompts
 */

const {
  ACTION_ITEM_SYSTEM_PROMPT,
  ACTION_ITEM_FEW_SHOT_EXAMPLES,
  formatFewShotExamples,
  buildActionItemPrompt,
  getFewShotExamples,
} = require("../prompts/actionItemExtraction");

describe("Action Item Extraction Prompts", () => {
  describe("ACTION_ITEM_SYSTEM_PROMPT", () => {
    it("should contain system instructions", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT.toLowerCase()).toContain("extract");
      expect(ACTION_ITEM_SYSTEM_PROMPT.toLowerCase()).toContain("action");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("JSON");
    });

    it("should define action item types", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("commitment");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("question");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("task");
    });

    it("should define priority levels", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("high");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("medium");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("low");
    });

    it("should mention required fields", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("task");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("assignee");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("deadline");
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("sourceMessageId");
    });

    it("should include conservative extraction guidance", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toContain("conservative");
    });
  });

  describe("ACTION_ITEM_FEW_SHOT_EXAMPLES", () => {
    it("should have at least 3 examples", () => {
      expect(ACTION_ITEM_FEW_SHOT_EXAMPLES.length).toBeGreaterThanOrEqual(3);
    });

    it("should have name, conversation and expectedOutput for each" +
      " example", () => {
      ACTION_ITEM_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty("name");
        expect(example).toHaveProperty("conversation");
        expect(example).toHaveProperty("expectedOutput");
        expect(example.expectedOutput).toHaveProperty("actionItems");
        expect(Array.isArray(example.expectedOutput.actionItems)).toBe(true);
      });
    });

    it("should have valid action item data in examples", () => {
      ACTION_ITEM_FEW_SHOT_EXAMPLES.forEach((example) => {
        example.expectedOutput.actionItems.forEach((item) => {
          // Required fields
          expect(item).toHaveProperty("task");
          expect(item).toHaveProperty("type");
          expect(item).toHaveProperty("priority");
          expect(item).toHaveProperty("sourceMessageId");

          // Type validation
          const validTypes = ["commitment", "question", "task", "decision"];
          expect(validTypes).toContain(item.type);

          // Priority validation
          expect(["high", "medium", "low"]).toContain(item.priority);

          // Task should be non-empty string
          expect(typeof item.task).toBe("string");
          expect(item.task.length).toBeGreaterThan(0);

          // Assignee can be string or null
          expect(
              item.assignee === null || typeof item.assignee === "string",
          ).toBe(true);

          // Deadline can be string or null
          expect(
              item.deadline === null || typeof item.deadline === "string",
          ).toBe(true);
        });
      });
    });

    it("should include example with no action items", () => {
      const noActionItemsExample = ACTION_ITEM_FEW_SHOT_EXAMPLES.find(
          (example) => example.expectedOutput.actionItems.length === 0,
      );
      expect(noActionItemsExample).toBeDefined();
    });

    it("should include examples with various types", () => {
      const allTypes = ACTION_ITEM_FEW_SHOT_EXAMPLES
          .flatMap((example) => example.expectedOutput.actionItems)
          .map((item) => item.type);

      expect(allTypes).toContain("commitment");
      expect(allTypes).toContain("question");
      expect(allTypes).toContain("task");
    });

    it("should include examples with various priorities", () => {
      const allPriorities = ACTION_ITEM_FEW_SHOT_EXAMPLES
          .flatMap((example) => example.expectedOutput.actionItems)
          .map((item) => item.priority);

      expect(allPriorities).toContain("high");
      expect(allPriorities).toContain("medium");
      expect(allPriorities).toContain("low");
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

    it("should include example names", () => {
      const formatted = formatFewShotExamples();
      ACTION_ITEM_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(formatted).toContain(example.name);
      });
    });

    it("should include conversation and output sections", () => {
      const formatted = formatFewShotExamples();
      expect(formatted).toContain("Input:");
      expect(formatted).toContain("Expected Output:");
    });
  });

  describe("buildActionItemPrompt", () => {
    const testConversation = `
      [10:00] Alice: I'll finish the report by EOD.
      [10:01] Bob: Can you also review the slides?
    `;

    it("should build prompt without examples", () => {
      const prompt = buildActionItemPrompt(testConversation, false);
      expect(prompt).toContain(ACTION_ITEM_SYSTEM_PROMPT);
      expect(prompt).toContain(testConversation);
      expect(prompt).not.toContain("Example 1");
    });

    it("should build prompt with examples", () => {
      const prompt = buildActionItemPrompt(testConversation, true);
      expect(prompt).toContain(ACTION_ITEM_SYSTEM_PROMPT);
      expect(prompt).toContain(testConversation);
      expect(prompt).toContain("Example 1");
    });

    it("should include analysis instruction", () => {
      const prompt = buildActionItemPrompt(testConversation, false);
      expect(prompt).toContain("analyze this conversation");
      expect(prompt).toContain("Return JSON");
    });
  });

  describe("getFewShotExamples", () => {
    it("should return array of examples", () => {
      const examples = getFewShotExamples();
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThanOrEqual(3);
    });

    it("should return same data as ACTION_ITEM_FEW_SHOT_EXAMPLES", () => {
      const examples = getFewShotExamples();
      expect(examples).toEqual(ACTION_ITEM_FEW_SHOT_EXAMPLES);
    });
  });

  describe("Prompt Quality Checks", () => {
    it("should have clear instructions for each type", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/commitment.*I'll.*I will/i);
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/question.*answer/i);
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/task.*assignment.*request/i);
    });

    it("should have clear priority guidelines", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/high.*deadline.*urgent/i);
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/medium.*this week/i);
      expect(ACTION_ITEM_SYSTEM_PROMPT).toMatch(/low.*no.*deadline/i);
    });

    it("should mention conservative approach", () => {
      expect(ACTION_ITEM_SYSTEM_PROMPT.toLowerCase())
          .toContain("conservative");
      expect(ACTION_ITEM_SYSTEM_PROMPT.toLowerCase())
          .toContain("when in doubt");
    });
  });
});

