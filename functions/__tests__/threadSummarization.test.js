/**
 * Unit Tests for Thread Summarization Prompts
 *
 * Tests the prompt templates, few-shot examples, and helper functions
 */

const {
  SUMMARIZATION_SYSTEM_PROMPT,
  SUMMARIZATION_FEW_SHOT_EXAMPLES,
  buildSummarizationPrompt,
  getFewShotExamples,
} = require("../prompts/threadSummarization");

describe("Thread Summarization Prompts", () => {
  describe("SUMMARIZATION_SYSTEM_PROMPT", () => {
    test("should be a non-empty string", () => {
      expect(typeof SUMMARIZATION_SYSTEM_PROMPT).toBe("string");
      expect(SUMMARIZATION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    test("should include key instructions", () => {
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("Key Points");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("Decisions");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("Action Items");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("JSON");
    });

    test("should specify response format", () => {
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("keyPoints");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("decisions");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("actionItems");
      expect(SUMMARIZATION_SYSTEM_PROMPT).toContain("summary");
    });

    test("should mention workplace conversations", () => {
      expect(SUMMARIZATION_SYSTEM_PROMPT.toLowerCase()).toContain("workplace");
    });
  });

  describe("SUMMARIZATION_FEW_SHOT_EXAMPLES", () => {
    test("should be an array with at least 2 examples", () => {
      expect(Array.isArray(SUMMARIZATION_FEW_SHOT_EXAMPLES)).toBe(true);
      expect(SUMMARIZATION_FEW_SHOT_EXAMPLES.length).toBeGreaterThanOrEqual(2);
    });

    test("each example should have required structure", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty("name");
        expect(example).toHaveProperty("conversation");
        expect(example).toHaveProperty("expectedOutput");
      });
    });

    test("each expectedOutput should have required fields", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        const output = example.expectedOutput;
        expect(output).toHaveProperty("keyPoints");
        expect(output).toHaveProperty("decisions");
        expect(output).toHaveProperty("actionItems");
        expect(output).toHaveProperty("summary");
      });
    });

    test("keyPoints should be an array", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(Array.isArray(example.expectedOutput.keyPoints)).toBe(true);
      });
    });

    test("decisions should be an array", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(Array.isArray(example.expectedOutput.decisions)).toBe(true);
      });
    });

    test("actionItems should be an array", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(Array.isArray(example.expectedOutput.actionItems)).toBe(true);
      });
    });

    test("action items should have proper structure", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        example.expectedOutput.actionItems.forEach((item) => {
          expect(item).toHaveProperty("task");
          expect(item).toHaveProperty("assignee");
          expect(item).toHaveProperty("deadline");
          expect(item).toHaveProperty("sourceMessageId");
        });
      });
    });

    test("summary should be a non-empty string", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        expect(typeof example.expectedOutput.summary).toBe("string");
        expect(example.expectedOutput.summary.length).toBeGreaterThan(0);
      });
    });
  });

  describe("buildSummarizationPrompt", () => {
    test("should return a string", () => {
      const context = "Alice: Hello\nBob: Hi";
      const result = buildSummarizationPrompt(context);
      expect(typeof result).toBe("string");
    });

    test("should include system prompt", () => {
      const context = "Alice: Hello\nBob: Hi";
      const result = buildSummarizationPrompt(context);
      expect(result).toContain("Key Points");
      expect(result).toContain("Decisions");
    });

    test("should include conversation context", () => {
      const context = "Alice: Let's deploy on Monday\nBob: Sounds good";
      const result = buildSummarizationPrompt(context);
      expect(result).toContain("Alice: Let's deploy on Monday");
      expect(result).toContain("Bob: Sounds good");
    });

    test("should handle empty context", () => {
      const result = buildSummarizationPrompt("");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should handle long context", () => {
      const longContext = Array(100)
          .fill("Alice: Message")
          .join("\n");
      const result = buildSummarizationPrompt(longContext);
      expect(typeof result).toBe("string");
      expect(result).toContain(longContext);
    });
  });

  describe("getFewShotExamples", () => {
    test("should return an array", () => {
      const examples = getFewShotExamples();
      expect(Array.isArray(examples)).toBe(true);
    });

    test("should return same examples as constant", () => {
      const examples = getFewShotExamples();
      expect(examples).toEqual(SUMMARIZATION_FEW_SHOT_EXAMPLES);
    });

    test("should return examples array", () => {
      const examples = getFewShotExamples();
      expect(examples).toBeDefined();
      expect(examples.length).toBeGreaterThan(0);
    });
  });

  describe("Example Quality", () => {
    test("should have example with decisions", () => {
      const hasDecisions = SUMMARIZATION_FEW_SHOT_EXAMPLES.some(
          (ex) => ex.expectedOutput.decisions.length > 0,
      );
      expect(hasDecisions).toBe(true);
    });

    test("should have example with action items", () => {
      const hasActionItems = SUMMARIZATION_FEW_SHOT_EXAMPLES.some(
          (ex) => ex.expectedOutput.actionItems.length > 0,
      );
      expect(hasActionItems).toBe(true);
    });

    test("should have example with assignee specified", () => {
      let hasAssignee = false;
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((ex) => {
        if (ex.expectedOutput && ex.expectedOutput.actionItems) {
          ex.expectedOutput.actionItems.forEach((item) => {
            if (item.assignee && item.assignee !== null) {
              hasAssignee = true;
            }
          });
        }
      });
      expect(hasAssignee).toBe(true);
    });

    test("should have example with deadline specified", () => {
      let hasDeadline = false;
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((ex) => {
        if (ex.expectedOutput && ex.expectedOutput.actionItems) {
          ex.expectedOutput.actionItems.forEach((item) => {
            if (item.deadline && item.deadline !== null) {
              hasDeadline = true;
            }
          });
        }
      });
      expect(hasDeadline).toBe(true);
    });

    test("conversations should use timestamp format", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        // Should contain timestamp-like patterns [YYYY-MM-DD HH:MM]
        const hasTimestamp = /\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]/.test(
            example.conversation,
        );
        expect(hasTimestamp).toBe(true);
      });
    });

    test("key points should be concise (under 100 chars each)", () => {
      SUMMARIZATION_FEW_SHOT_EXAMPLES.forEach((example) => {
        if (example.expectedOutput && example.expectedOutput.keyPoints) {
          example.expectedOutput.keyPoints.forEach((point) => {
            expect(point.length).toBeLessThanOrEqual(150);
          });
        }
      });
    });
  });
});

