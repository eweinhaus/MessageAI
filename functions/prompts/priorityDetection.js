/**
 * Priority Detection Prompt Templates
 *
 * System prompts and few-shot examples for detecting urgent messages
 * in workplace conversations. Analyzes time-sensitive keywords, direct
 * questions, blocking issues, and @mentions.
 *
 * @module functions/prompts/priorityDetection
 */

/**
 * System prompt for priority detection
 * Instructs GPT-4 to analyze messages for urgency indicators
 */
const PRIORITY_SYSTEM_PROMPT = "You are an expert at analyzing " +
  `workplace messages to determine urgency.

Analyze each message for:
1. Time-sensitive keywords (deadline, urgent, ASAP, today, tomorrow, ` +
  `EOD, critical, emergency)
2. Direct questions or requests to specific people
3. Blocking issues or critical problems (bug, broken, down, failed, ` +
  `blocked)
4. @mentions of users (especially if combined with requests)
5. Exclamation marks or all-caps text indicating emphasis

Respond with JSON for each message:
{
  "priorities": [
    {
      "messageId": "string",
      "priority": "urgent" | "normal",
      "reason": "Brief explanation of why this is urgent or normal",
      "confidence": 0.0-1.0 (float)
    }
  ]
}

Priority levels:
- "urgent": Message requires immediate attention (deadlines, blockers, ` +
  `critical questions)
- "normal": Regular message without time pressure

Confidence scoring:
- 0.9-1.0: Very clear urgency indicators
- 0.7-0.9: Multiple moderate indicators
- 0.5-0.7: Single clear indicator
- Below 0.5: Mark as normal

Be conservative - only mark messages as urgent if there's genuine ` +
  "urgency.";

/**
 * Few-shot examples for better prompt performance
 * Provides sample conversations with expected outputs
 */
const PRIORITY_FEWSHOTS = [
  {
    conversation: `
[09:15] Alice: Good morning team! How's everyone doing?
[09:16] Bob: Hey Alice! Doing well, thanks. Ready for the sprint ` +
      `planning today.
[09:17] Charlie: @Alice the production server is down! Users can't ` +
      `login. This is blocking everything.
[09:18] Alice: @Charlie Thanks for the heads up, looking into it now.
[09:20] David: Has anyone seen the Q4 roadmap document?
    `.trim(),
    expectedOutput: {
      priorities: [
        {
          messageId: "msg_001",
          priority: "normal",
          reason: "Casual greeting with no urgency",
          confidence: 0.95,
        },
        {
          messageId: "msg_002",
          priority: "normal",
          reason: "Friendly response about routine meeting",
          confidence: 0.9,
        },
        {
          messageId: "msg_003",
          priority: "urgent",
          reason: "Production server down - critical blocker with @mention",
          confidence: 0.98,
        },
        {
          messageId: "msg_004",
          priority: "urgent",
          reason: "Response to critical issue with @mention",
          confidence: 0.85,
        },
        {
          messageId: "msg_005",
          priority: "normal",
          reason: "Question about document but no time pressure",
          confidence: 0.8,
        },
      ],
    },
  },
  {
    conversation: `
[14:30] Manager: Team, we need to deploy by EOD today. ` +
      `Client is waiting.
[14:31] Sarah: I can help! What needs to be done?
[14:32] John: Just finished testing, everything looks good.
[14:33] Sarah: @Manager should we do the deployment now or wait for ` +
      `final review?
[14:35] Manager: Let's deploy now, we're on a tight deadline.
    `.trim(),
    expectedOutput: {
      priorities: [
        {
          messageId: "msg_006",
          priority: "urgent",
          reason: "EOD deadline with client dependency",
          confidence: 0.95,
        },
        {
          messageId: "msg_007",
          priority: "normal",
          reason: "Helpful response but not urgent itself",
          confidence: 0.7,
        },
        {
          messageId: "msg_008",
          priority: "normal",
          reason: "Status update on testing completion",
          confidence: 0.75,
        },
        {
          messageId: "msg_009",
          priority: "urgent",
          reason: "Direct question to manager about time-sensitive deployment",
          confidence: 0.9,
        },
        {
          messageId: "msg_010",
          priority: "urgent",
          reason: "Deployment decision with tight deadline mentioned",
          confidence: 0.92,
        },
      ],
    },
  },
  {
    conversation: `
[11:00] Alex: Anyone want to grab lunch later?
[11:01] Emily: Sure! I'm thinking around 12:30?
[11:02] Tom: Can't today, maybe tomorrow?
[11:03] Alex: No problem! 12:30 works for me Emily.
[11:05] Rachel: @Everyone - URGENT: Security vulnerability found in ` +
      `the auth module. Need to patch ASAP!
    `.trim(),
    expectedOutput: {
      priorities: [
        {
          messageId: "msg_011",
          priority: "normal",
          reason: "Social lunch invitation, no urgency",
          confidence: 0.95,
        },
        {
          messageId: "msg_012",
          priority: "normal",
          reason: "Casual response about lunch plans",
          confidence: 0.9,
        },
        {
          messageId: "msg_013",
          priority: "normal",
          reason: "Declining lunch invitation",
          confidence: 0.9,
        },
        {
          messageId: "msg_014",
          priority: "normal",
          reason: "Confirming lunch plans",
          confidence: 0.85,
        },
        {
          messageId: "msg_015",
          priority: "urgent",
          reason: "Security vulnerability marked URGENT with ASAP, " +
            "@everyone mention",
          confidence: 1.0,
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
  return PRIORITY_FEWSHOTS.map((example, index) => {
    return `
Example ${index + 1}:

Input:
${example.conversation}

Expected Output:
${JSON.stringify(example.expectedOutput, null, 2)}
    `.trim();
  }).join("\n\n");
}

/**
 * Build complete prompt with system instructions and examples
 * @param {string} conversationContext - Conversation to analyze
 * @param {boolean} [includeExamples=false] - Include few-shot examples
 * @return {string} Complete prompt for OpenAI
 */
function buildPriorityPrompt(conversationContext, includeExamples = false) {
  let prompt = PRIORITY_SYSTEM_PROMPT;

  if (includeExamples) {
    prompt += "\n\n" + formatFewShotExamples();
  }

  prompt += `

Now analyze this conversation:

${conversationContext}

Return JSON with the priorities array as specified above.`;

  return prompt;
}

// Export all prompt components
module.exports = {
  PRIORITY_SYSTEM_PROMPT,
  PRIORITY_FEWSHOTS,
  formatFewShotExamples,
  buildPriorityPrompt,
};

