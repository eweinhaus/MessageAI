/**
 * Action Item Extraction Prompt Templates
 *
 * System prompts and few-shot examples for identifying tasks, commitments,
 * questions, and deadlines in workplace conversations.
 *
 * @module functions/prompts/actionItemExtraction
 */

/* eslint-disable max-len */
/**
 * System prompt for action item extraction
 * Instructs GPT-4 to identify actionable items in conversations
 */
const ACTION_ITEM_SYSTEM_PROMPT = `You are an expert at identifying action items, tasks, and commitments in workplace conversations.

Extract the following types of actionable items:

1. **Explicit Commitments** - "I'll do X by Y"
2. **Task Assignments** - "Can you handle Z?" or "Sarah, please update the docs"
3. **Questions Requiring Answers** - Direct questions that need responses
4. **Decisions Requiring Follow-up** - Agreements that need implementation

For each action item, identify:
- **Task Description**: Clear, actionable statement of what needs to be done
- **Assignee**: Person responsible (name if mentioned, null if unclear)
- **Deadline**: Date/time if mentioned (null otherwise)
- **Type**: "commitment" | "question" | "task" | "decision"
- **Priority**: "high" | "medium" | "low" based on urgency indicators
- **Source Message ID**: REQUIRED - The exact message ID where this item appears (never null)
- **Context**: Brief surrounding context (1 sentence)
- **Is Decision**: true if this represents an agreed-upon choice or resolution

CRITICAL: Every action item MUST have a valid sourceMessageId. This is required for users to view the original context.

Respond with JSON in this exact format:
{
  "actionItems": [
    {
      "task": "Clear description of what needs to be done",
      "assignee": "Name or null",
      "deadline": "ISO date string or descriptive text like 'EOD today', or null",
      "type": "commitment" | "question" | "task" | "decision",
      "priority": "high" | "medium" | "low",
      "sourceMessageId": "REQUIRED - exact message ID (never null or empty)",
      "context": "Brief surrounding context",
      "isDecision": true | false
    }
  ]
}

Type definitions:
- **commitment**: Personal promise or commitment by speaker ("I'll...", "I will...")
- **question**: Question directed at someone that needs an answer
- **task**: Explicit assignment or request to someone ("Can you...", "Please...")
- **decision**: Agreed-upon choice, conclusion, or resolution ("Let's go with...", "We decided...")

Decision detection:
- **isDecision**: Set to true when the item represents a team decision, agreed-upon approach, or consensus
- Examples: "Let's use Plan B", "We agreed to postpone", "Everyone approved the design"
- Only mark as decision if there's clear agreement or resolution (not just suggestions)

Priority guidelines:
- **high**: Has deadline today/tomorrow, marked urgent, or blocks other work
- **medium**: Has deadline this week, or important but not urgent
- **low**: No specific deadline, nice-to-have, or informational questions

Important rules:
- Only extract genuine action items, not casual conversation
- Be conservative - when in doubt, don't extract it
- If no action items exist, return empty array
- Extract assignee name exactly as it appears in the conversation
- Do not hallucinate or invent information`;

/**
 * Few-shot examples for better prompt performance
 * Provides sample conversations with expected outputs
 */
const ACTION_ITEM_FEW_SHOT_EXAMPLES = [
  {
    name: "Explicit Commitments with Deadlines",
    conversation: `[2024-10-22 09:00] Alice: We need to finalize the presentation for the client meeting.
[2024-10-22 09:02] Bob: I'll finish the slides by EOD today.
[2024-10-22 09:03] Charlie: I can review them tomorrow morning before the meeting.
[2024-10-22 09:05] Alice: Perfect. I'll send the agenda to the client by 5pm today.
[2024-10-22 09:06] David: What time is the meeting?`,
    expectedOutput: {
      actionItems: [
        {
          task: "Finish the presentation slides",
          assignee: "Bob",
          deadline: "EOD today",
          type: "commitment",
          priority: "high",
          sourceMessageId: "msg-002",
          context: "Preparing slides for client meeting",
          isDecision: false,
        },
        {
          task: "Review presentation slides",
          assignee: "Charlie",
          deadline: "tomorrow morning",
          type: "commitment",
          priority: "high",
          sourceMessageId: "msg-003",
          context: "Review before client meeting",
          isDecision: false,
        },
        {
          task: "Send meeting agenda to the client",
          assignee: "Alice",
          deadline: "5pm today",
          type: "commitment",
          priority: "high",
          sourceMessageId: "msg-005",
          context: "Share agenda before client meeting",
          isDecision: false,
        },
        {
          task: "Answer: What time is the meeting?",
          assignee: null,
          deadline: null,
          type: "question",
          priority: "medium",
          sourceMessageId: "msg-006",
          context: "David asking about meeting time",
          isDecision: false,
        },
      ],
    },
  },
  {
    name: "Task Assignments and Questions",
    conversation: `[2024-10-22 11:30] Manager: Sarah, can you update the API documentation?
[2024-10-22 11:32] Sarah: Sure, I'll get that done.
[2024-10-22 11:33] Manager: @Tom can you review the security audit findings?
[2024-10-22 11:35] Tom: Yes, I'll review them this week.
[2024-10-22 11:36] Emily: Has anyone tested the new deployment pipeline?
[2024-10-22 11:38] Manager: Good question. Tom, can you add that to your list?
[2024-10-22 11:40] Tom: Will do.`,
    expectedOutput: {
      actionItems: [
        {
          task: "Update the API documentation",
          assignee: "Sarah",
          deadline: null,
          type: "task",
          priority: "medium",
          sourceMessageId: "msg-011",
          context: "Manager requested documentation update",
          isDecision: false,
        },
        {
          task: "Review the security audit findings",
          assignee: "Tom",
          deadline: "this week",
          type: "task",
          priority: "medium",
          sourceMessageId: "msg-013",
          context: "Security audit needs review",
          isDecision: false,
        },
        {
          task: "Answer: Has anyone tested the new deployment pipeline?",
          assignee: null,
          deadline: null,
          type: "question",
          priority: "medium",
          sourceMessageId: "msg-015",
          context: "Emily asking about deployment pipeline testing",
          isDecision: false,
        },
        {
          task: "Test the new deployment pipeline",
          assignee: "Tom",
          deadline: null,
          type: "task",
          priority: "medium",
          sourceMessageId: "msg-016",
          context: "Added to Tom's task list",
          isDecision: false,
        },
      ],
    },
  },
  {
    name: "Urgent Items and Blockers",
    conversation: `[2024-10-22 14:00] Alex: URGENT: Production database is running out of space!
[2024-10-22 14:01] Jordan: I'm on it. I'll increase the storage immediately.
[2024-10-22 14:03] Morgan: We should also investigate why it's growing so fast.
[2024-10-22 14:05] Alex: Good point. Jordan, can you analyze the growth patterns after the fix?
[2024-10-22 14:07] Jordan: Yes, I'll generate a report by tomorrow.`,
    expectedOutput: {
      actionItems: [
        {
          task: "Increase production database storage",
          assignee: "Jordan",
          deadline: "immediately",
          type: "commitment",
          priority: "high",
          sourceMessageId: "msg-021",
          context: "Urgent fix for database storage issue",
          isDecision: false,
        },
        {
          task: "Analyze database growth patterns and generate report",
          assignee: "Jordan",
          deadline: "tomorrow",
          type: "task",
          priority: "high",
          sourceMessageId: "msg-025",
          context: "Investigation after urgent storage fix",
          isDecision: false,
        },
      ],
    },
  },
  {
    name: "Casual Conversation with Low Priority Item",
    conversation: `[2024-10-22 12:00] Lisa: Anyone want coffee? I'm heading to the café.
[2024-10-22 12:01] Mark: I'm good, thanks!
[2024-10-22 12:02] Nina: Ooh, can you grab me a latte?
[2024-10-22 12:03] Lisa: Sure thing!
[2024-10-22 12:05] Mark: The weather is nice today. By the way, did anyone see that article about AI trends?
[2024-10-22 12:06] Nina: No, but it sounds interesting. Can you share the link when you get a chance?`,
    expectedOutput: {
      actionItems: [
        {
          task: "Share article link about AI trends",
          assignee: "Mark",
          deadline: null,
          type: "question",
          priority: "low",
          sourceMessageId: "msg-046",
          context: "Casual conversation about interesting article",
          isDecision: false,
        },
      ],
    },
  },
  {
    name: "Pure Social Conversation - No Action Items",
    conversation: `[2024-10-22 15:00] Alex: Hey team, congrats on shipping the feature!
[2024-10-22 15:01] Jamie: Thanks! It was a team effort.
[2024-10-22 15:02] Sam: Yeah, everyone did great work.
[2024-10-22 15:03] Alex: Definitely. Looking forward to the next sprint.
[2024-10-22 15:04] Jamie: Me too!`,
    expectedOutput: {
      actionItems: [],
    },
  },
  {
    name: "Team Decisions and Agreements",
    conversation: `[2024-10-22 10:00] Manager: We need to decide on the deployment strategy for v2.0.
[2024-10-22 10:02] Tech Lead: I propose we do a gradual rollout over 3 days.
[2024-10-22 10:04] Product: That sounds safer. What about monitoring?
[2024-10-22 10:06] DevOps: I can set up alerts for error rates and performance metrics.
[2024-10-22 10:08] Manager: Great. Everyone agreed on the gradual rollout approach?
[2024-10-22 10:09] Tech Lead: Yes, makes sense.
[2024-10-22 10:10] Product: Agreed.
[2024-10-22 10:11] Manager: Perfect. Let's go with the 3-day gradual rollout plan. DevOps, please prepare the monitoring setup.`,
    expectedOutput: {
      actionItems: [
        {
          task: "Use gradual rollout over 3 days for v2.0 deployment",
          assignee: null,
          deadline: null,
          type: "decision",
          priority: "high",
          sourceMessageId: "msg-051",
          context: "Team decision on deployment strategy",
          isDecision: true,
        },
        {
          task: "Set up alerts for error rates and performance metrics",
          assignee: "DevOps",
          deadline: null,
          type: "task",
          priority: "high",
          sourceMessageId: "msg-051",
          context: "Monitoring setup for gradual rollout",
          isDecision: false,
        },
      ],
    },
  },
  {
    name: "Mixed Priorities and Types",
    conversation: `[2024-10-22 16:00] Project Lead: Quick status check before end of day.
[2024-10-22 16:01] Dev1: I deployed the hotfix this morning. All good.
[2024-10-22 16:02] Dev2: I'm still working on the refactoring task. Should be done tomorrow.
[2024-10-22 16:04] Project Lead: Thanks. @Dev1 can you document the hotfix in the changelog?
[2024-10-22 16:05] Dev1: Sure, I'll do it right after this call.
[2024-10-22 16:07] QA: Do we need regression testing for the hotfix?
[2024-10-22 16:09] Project Lead: Good question. Dev1, what do you think?
[2024-10-22 16:10] Dev1: It's a minor fix, but let's test the login flow to be safe.
[2024-10-22 16:11] QA: I'll run those tests today.`,
    expectedOutput: {
      actionItems: [
        {
          task: "Complete the refactoring task",
          assignee: "Dev2",
          deadline: "tomorrow",
          type: "commitment",
          priority: "medium",
          sourceMessageId: "msg-032",
          context: "Ongoing refactoring work",
          isDecision: false,
        },
        {
          task: "Document the hotfix in the changelog",
          assignee: "Dev1",
          deadline: "right after this call",
          type: "task",
          priority: "medium",
          sourceMessageId: "msg-034",
          context: "Changelog documentation needed",
          isDecision: false,
        },
        {
          task: "Answer: Do we need regression testing for the hotfix?",
          assignee: null,
          deadline: null,
          type: "question",
          priority: "medium",
          sourceMessageId: "msg-037",
          context: "QA asking about testing requirements",
          isDecision: false,
        },
        {
          task: "Run regression tests on login flow",
          assignee: "QA",
          deadline: "today",
          type: "commitment",
          priority: "high",
          sourceMessageId: "msg-041",
          context: "Testing hotfix to ensure safety",
          isDecision: false,
        },
      ],
    },
  },
];

/**
 * Format few-shot examples as a string for inclusion in prompts
 * @return {string} Formatted examples
 */
function formatFewShotExamples() {
  return ACTION_ITEM_FEW_SHOT_EXAMPLES.map((example, index) => {
    return `
Example ${index + 1}: ${example.name}

Input:
${example.conversation}

Expected Output:
${JSON.stringify(example.expectedOutput, null, 2)}
    `.trim();
  }).join("\n\n");
}

/**
 * Build complete prompt with system instructions and optional examples
 * @param {string} conversationContext - Conversation to analyze
 * @param {boolean} [includeExamples=false] - Include few-shot examples
 * @return {string} Complete prompt for OpenAI
 */
function buildActionItemPrompt(conversationContext, includeExamples = false) {
  let prompt = ACTION_ITEM_SYSTEM_PROMPT;

  if (includeExamples) {
    prompt += "\n\n" + formatFewShotExamples();
  }

  prompt += `

Now analyze this conversation:

${conversationContext}

Return JSON with the actionItems array as specified above.`;

  return prompt;
}

/**
 * Get few-shot examples for testing
 * @return {Array} Array of example objects
 */
function getFewShotExamples() {
  return ACTION_ITEM_FEW_SHOT_EXAMPLES;
}

// Export all prompt components
module.exports = {
  ACTION_ITEM_SYSTEM_PROMPT,
  ACTION_ITEM_FEW_SHOT_EXAMPLES,
  formatFewShotExamples,
  buildActionItemPrompt,
  getFewShotExamples,
};

