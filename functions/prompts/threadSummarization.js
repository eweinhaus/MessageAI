/**
 * Thread Summarization Prompts
 *
 * System prompts and few-shot examples for generating conversation summaries
 * with key points, decisions, action items, and participant statistics.
 */

/* eslint-disable max-len */
/**
 * System prompt for thread summarization
 * Instructs the AI to analyze conversations and extract structured insights
 */
const SUMMARIZATION_SYSTEM_PROMPT = `You are an expert at summarizing workplace conversations for remote teams.

Your task is to analyze conversation threads and extract actionable insights that help team members quickly understand what happened without reading every message.

Analyze the conversation and provide:

1. **Key Points** (3-5 main topics discussed)
   - Focus on the main themes and topics
   - Be concise but specific
   - Capture the essence of the discussion

2. **Decisions Made** (concrete agreements or choices)
   - Only include actual decisions that were agreed upon
   - Must have clear consensus or authority approval
   - Avoid suggestions or proposals that weren't finalized

3. **Action Items** (tasks, commitments, or questions needing answers)
   - Extract explicit commitments ("I'll do X by Y")
   - Identify task assignments ("Can you handle Z?")
   - Note questions that require answers
   - Include assignee name if mentioned
   - Include deadline if mentioned
   - Reference the message ID where the action item appears

4. **Summary** (1-2 paragraph overview)
   - Provide a brief narrative summary
   - Capture the flow of the conversation
   - Highlight the most important outcomes

Respond with valid JSON in this exact format:
{
  "keyPoints": ["point1", "point2", "point3"],
  "decisions": ["decision1", "decision2"],
  "actionItems": [
    {
      "task": "Clear description of what needs to be done",
      "assignee": "Name or null if not mentioned",
      "deadline": "Date/time or null if not mentioned",
      "sourceMessageId": "message ID"
    }
  ],
  "summary": "One or two paragraph overview of the conversation"
}

Important guidelines:
- Be concise but comprehensive
- Focus on actionable information
- If a section has no items, return an empty array
- Do not hallucinate or invent information
- Stay factual and objective
- Use clear, professional language`;

/**
 * Few-shot examples showing expected input/output for various conversation types
 */
const SUMMARIZATION_FEW_SHOT_EXAMPLES = [
  {
    name: "Simple Decision-Making Conversation",
    conversation: `[2024-10-22 10:30] Alice: Should we deploy the new feature on Friday or wait until Monday?
[2024-10-22 10:32] Bob: I think Monday is safer. Gives us the weekend buffer in case there are issues.
[2024-10-22 10:33] Alice: Good point. Less risky.
[2024-10-22 10:35] Charlie: Agreed. Monday deployment works better for the team schedule too.
[2024-10-22 10:36] Alice: Okay, it's decided. We'll deploy Monday morning.`,
    expectedOutput: {
      keyPoints: [
        "Discussion about deployment timing for new feature",
        "Team considered Friday vs Monday deployment",
        "Consensus reached on Monday for safety and schedule alignment",
      ],
      decisions: [
        "Deploy new feature on Monday morning instead of Friday",
      ],
      actionItems: [],
      summary: "The team discussed when to deploy a new feature, weighing the options between Friday and Monday. After considering the risks and team schedules, they unanimously decided to deploy on Monday morning to allow for a weekend buffer in case of issues.",
    },
  },
  {
    name: "Action Items and Assignments",
    conversation: `[2024-10-22 14:15] Sarah: We need to finalize the Q4 budget by next Friday.
[2024-10-22 14:16] Mike: I can pull the expense reports by Wednesday.
[2024-10-22 14:18] Sarah: Perfect. Can you also include the vendor contracts?
[2024-10-22 14:19] Mike: Yes, I'll add those too.
[2024-10-22 14:20] Lisa: I'll review everything and prepare the presentation by Thursday.
[2024-10-22 14:22] Sarah: Great. I'll schedule the stakeholder meeting for Friday afternoon.`,
    expectedOutput: {
      keyPoints: [
        "Q4 budget needs to be finalized by next Friday",
        "Multiple team members assigned specific preparation tasks",
        "Stakeholder meeting scheduled for final review",
      ],
      decisions: [
        "Schedule stakeholder meeting for Friday afternoon to review Q4 budget",
      ],
      actionItems: [
        {
          task: "Pull expense reports and vendor contracts",
          assignee: "Mike",
          deadline: "Wednesday",
          sourceMessageId: "msg-456",
        },
        {
          task: "Review expense reports and prepare presentation",
          assignee: "Lisa",
          deadline: "Thursday",
          sourceMessageId: "msg-460",
        },
        {
          task: "Schedule stakeholder meeting",
          assignee: "Sarah",
          deadline: "Friday afternoon",
          sourceMessageId: "msg-462",
        },
      ],
      summary: "The team coordinated on finalizing the Q4 budget with a deadline of next Friday. Mike committed to pulling expense reports and vendor contracts by Wednesday. Lisa will review the materials and prepare a presentation by Thursday. Sarah will schedule a stakeholder meeting for Friday afternoon to present the final budget.",
    },
  },
  {
    name: "Complex Multi-Topic Discussion",
    conversation: `[2024-10-22 09:00] Tom: Morning team! Three things to discuss today.
[2024-10-22 09:01] Tom: 1) API performance issues from yesterday
[2024-10-22 09:02] Tom: 2) New hire onboarding process
[2024-10-22 09:03] Tom: 3) Team social event planning
[2024-10-22 09:05] Emma: On the API issue - I found the bottleneck. It's the database query in the user service.
[2024-10-22 09:06] Emma: I'll optimize it and deploy a fix today.
[2024-10-22 09:08] Jake: For onboarding, can we add a buddy system? New hires need more support.
[2024-10-22 09:10] Tom: Good idea. Let's implement that for all future hires.
[2024-10-22 09:12] Sara: I'll document the buddy system process.
[2024-10-22 09:15] Tom: For the social event, how about bowling next Friday?
[2024-10-22 09:16] Emma: Works for me!
[2024-10-22 09:17] Jake: I'm in.
[2024-10-22 09:18] Sara: Sounds fun, count me in.
[2024-10-22 09:20] Tom: Great, I'll book it for 6pm.`,
    expectedOutput: {
      keyPoints: [
        "API performance issue identified and solution found",
        "Team agreed to implement buddy system for new hire onboarding",
        "Team social event (bowling) scheduled for next Friday at 6pm",
      ],
      decisions: [
        "Implement buddy system for all future new hires",
        "Team bowling social event scheduled for next Friday at 6pm",
      ],
      actionItems: [
        {
          task: "Optimize database query in user service and deploy fix",
          assignee: "Emma",
          deadline: "today",
          sourceMessageId: "msg-506",
        },
        {
          task: "Document the buddy system onboarding process",
          assignee: "Sara",
          deadline: null,
          sourceMessageId: "msg-512",
        },
        {
          task: "Book bowling venue for team event",
          assignee: "Tom",
          deadline: "next Friday 6pm",
          sourceMessageId: "msg-520",
        },
      ],
      summary: "The team meeting covered three main topics. First, Emma identified the cause of API performance issues as a database query bottleneck and committed to deploying a fix today. Second, the team decided to implement a buddy system for new hire onboarding, with Sara taking responsibility for documenting the process. Finally, the team agreed on a bowling social event for next Friday at 6pm, which Tom will organize.",
    },
  },
];

/**
 * Build the full prompt with context
 * @param {string} conversationContext - Formatted conversation messages
 * @return {string} Complete prompt for OpenAI
 */
function buildSummarizationPrompt(conversationContext) {
  return `${SUMMARIZATION_SYSTEM_PROMPT}

CONVERSATION TO SUMMARIZE:
${conversationContext}

Provide your analysis in the JSON format specified above.`;
}

/**
 * Get few-shot examples formatted for training
 * @return {Array} Array of example objects
 */
function getFewShotExamples() {
  return SUMMARIZATION_FEW_SHOT_EXAMPLES;
}

/**
 * Unread-focused summarization prompt with message markers
 * Designed for delta-based global summaries with READ/UNREAD/SELF context
 */
const UNREAD_SUMMARIZATION_SYSTEM_PROMPT = `You are summarizing NEW, UNREAD messages across chats.

Your job:
- Focus output on what changed and what needs attention.
- Use [READ] and [SELF] messages strictly as context to understand the conversation.
- Be SPECIFIC with facts (times, dates, names, decisions).
  - BAD: "Discussion about schedule changes"
  - GOOD: "Meeting rescheduled from 3:30 to 4:30"
- Resolve contradictions by picking the most recent/final statement.

Rules:
1) Provide AT LEAST ONE key point per conversation. Prefer concrete facts over generic themes.
2) Avoid redundancy; merge similar points into one specific statement.
3) Extract ALL action items, including implicit ones:
   - Questions that require answers
   - Requests for information or files
   - Deadlines mentioned (normalize to specific times if stated)
   - Assign to "You" if the current user must act
4) Tie items to the correct chat using chatName.
5) Prefer final, most recent values (e.g., if time changes from 3:30 to 4:30, report 4:30).
6) If someone asks "Which one?" and later someone answers, combine into a single specific point (e.g., "John needs the marketing plan file").

Message markers in the context:
- [UNREAD] = New messages requiring summary
- [READ] = Previously read messages (context only, don't summarize these directly)
- [SELF] = Messages sent by current user (may be READ or UNREAD, use for context)

Only treat [UNREAD] messages as new information to report.

Respond with valid JSON in this exact format:
{
  "keyPoints": [
    {"text": "Specific fact or update", "chatName": "Chat Name"}
  ],
  "decisions": [
    {"text": "Clear decision made", "chatName": "Chat Name"}
  ],
  "actionItems": [
    {
      "task": "What needs to be done",
      "assignee": "Name or 'You'",
      "deadline": "Specific time/date or null",
      "priority": "high" | "normal" | "low",
      "chatName": "Chat Name"
    }
  ],
  "summary": "Brief overview focused on what's NEW and needs attention"
}

Important:
- If a section has no items, return an empty array
- Do not hallucinate or invent information
- Stay factual and objective
- Be concise but capture all critical information`;

module.exports = {
  SUMMARIZATION_SYSTEM_PROMPT,
  UNREAD_SUMMARIZATION_SYSTEM_PROMPT,
  SUMMARIZATION_FEW_SHOT_EXAMPLES,
  buildSummarizationPrompt,
  getFewShotExamples,
};

