# MessageAI Phase 2 - AI Features PRD

## Project Overview

**Phase**: Phase 2 - AI Enhancement Layer  
**Target Persona**: Remote Team Professional  
**Status**: Planning Complete, Ready for Implementation  

## Executive Summary

Building on the production-quality messaging infrastructure from Phase 1 (MVP), we're adding intelligent AI features to help remote teams manage communication overload. The system will use OpenAI GPT-4 with a Retrieval-Augmented Generation (RAG) pipeline to provide context-aware insights from conversations.

**Key Success Metric**: Demonstrate that AI can meaningfully enhance workplace messaging by solving real information overload problems.

---

## Target Persona: Remote Team Professional

### Pain Points
1. **Thread Overwhelm**: Drowning in long conversation threads across multiple team chats
2. **Missed Action Items**: Important tasks and commitments get lost in chat history
3. **Context Switching**: Hard to quickly understand what happened in a chat without reading everything
4. **Decision Tracking**: Team decisions get buried and forgotten over time
5. **Priority Blindness**: Urgent messages get missed among the noise

### User Profile
- **Role**: Software engineer, product manager, designer on distributed team
- **Team Size**: 5-15 people across 2-4 time zones
- **Message Volume**: 200+ messages/day across 3-5 active chats
- **Key Need**: Quickly understand "what matters" without reading everything

---

## Core Requirements

### Technical Requirements
✅ **Must implement RAG pipeline** for conversation context  
✅ **Must use OpenAI API** (GPT-4 or GPT-4 Turbo)  
✅ **Must integrate with existing Firebase infrastructure**  
✅ **Must cache AI results** to minimize costs  
✅ **Must handle errors gracefully** (AI is probabilistic)  

### Feature Requirements
✅ **All 5 required features** must be implemented and working:
   1. Thread summarization captures key points
   2. Action items correctly extracted
   3. Smart search finds relevant messages
   4. Priority detection flags urgent messages accurately
   5. Decision tracking surfaces agreed-upon decisions
✅ **All features must solve real user problems** (not gimmicks)  
✅ **Features must feel fast** (< 5s response time for most operations)  

---

## De-Risked Implementation Strategy

### Risk Mitigation Approach

**Previous Risk**: Background triggers processing all messages automatically could be costly and hard to debug.

**De-Risked Approach**: Use **callable Cloud Functions** (on-demand) for initial implementation:
- ✅ User explicitly triggers AI features (via button tap)
- ✅ Easier to test and debug (see results immediately)
- ✅ Predictable costs (only process what's requested)
- ✅ Clear error feedback to user
- ✅ Can upgrade to automatic background processing later

### Progressive Enhancement Path

**Phase 1: Foundation + Priority Detection**
1. OpenAI API integration in Cloud Functions
2. Simple RAG pipeline (context window)
3. Feature 1: Priority Detection (low risk, immediate value)
4. Caching infrastructure

**Phase 2: Core RAG Features**
5. Feature 2: Thread Summarization (demonstrates RAG capability)
6. Feature 3: Action Item Extraction (high value)
7. Client UI for AI insights panel

**Phase 3: Advanced Search & Decision Tracking**
8. Feature 4: Smart Search (semantic search with embeddings)
9. Feature 5: Decision Tracking (advanced multi-step reasoning)
10. Comprehensive error handling

**Phase 4: Testing & Polish**
11. Testing, optimization, demo preparation

---

## AI Features Specification (All 5 Required)

### Feature 1: Priority Detection ⭐⭐⭐⭐ (Required #4)

**What**: Automatically detect if a message needs urgent attention

**Implementation**: Callable Cloud Function (on-demand analysis)

**User Experience**:
- User opens chat, taps "Check Priorities" button
- System analyzes recent messages (last 30)
- Messages flagged as urgent show red badge/highlight
- Tap badge to see why it's flagged

**How It Works**:
```javascript
// Client calls Cloud Function
const result = await analyzePriorities(chatId);

// Function analyzes messages with GPT-4
const analysis = await openai.chat.completions.create({
  model: "gpt-4-turbo",
  messages: [
    { role: "system", content: "Analyze messages for urgency..." },
    { role: "user", content: context }
  ]
});

// Store results in Firestore
/chats/{chatId}/priorities/{messageId}
  - level: "urgent" | "normal"
  - reason: "Mentions deadline tomorrow"
  - analyzedAt: timestamp
```

**Success Criteria**:
- ✅ Correctly identifies time-sensitive messages (deadlines, blocking issues)
- ✅ Correctly identifies @mentions of user
- ✅ Correctly identifies questions directed at user
- ✅ Low false positive rate (< 20%)
- ✅ Response time < 3 seconds for 30 messages

**Complexity**: Low-Medium  
**Risk**: Low (simple prompt, predictable output)  
**Value**: High (immediate actionable insight)

---

### Feature 2: Thread Summarization ⭐⭐⭐⭐⭐ (Required #1)

**What**: Generate concise summary of conversation thread with key points

**Implementation**: Callable Cloud Function with context retrieval

**User Experience**:
- Long press on chat in chat list → "Summarize Thread"
- Or in chat detail, tap "Summarize" button in header
- Shows loading state (2-5 seconds)
- Displays summary in modal/sheet:
  - **Key Points** (3-5 bullet points)
  - **Decisions Made** (if any)
  - **Action Items** (if any)
  - **Participants** (most active members)
- Option to share summary or save as note

**How It Works (RAG Pipeline)**:
```javascript
// Step 1: Retrieve relevant messages (RAG)
const messages = await getLastNMessages(chatId, 50); // or filter by date range

// Step 2: Build context
const context = messages.map(m => 
  `[${formatTime(m.timestamp)}] ${m.senderName}: ${m.text}`
).join('\n');

// Step 3: Use Langchain for structured summarization
const chain = new LLMChain({
  llm: new ChatOpenAI({ modelName: "gpt-4-turbo" }),
  prompt: PromptTemplate.fromTemplate(`
    Summarize this team conversation.
    
    Conversation:
    {context}
    
    Provide:
    1. Key points (3-5 bullets)
    2. Decisions made
    3. Action items mentioned
    4. Most active participants
    
    Format as JSON.
  `)
});

const summary = await chain.invoke({ context });

// Step 4: Cache result
await db.collection('summaries').add({
  chatId,
  summary: summary,
  messageCount: messages.length,
  timeRange: { start: messages[0].timestamp, end: messages[messages.length-1].timestamp },
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
```

**Success Criteria**:
- ✅ Summary captures main topics discussed
- ✅ Identifies concrete decisions (if any)
- ✅ Extracts action items with assignees
- ✅ Summary is readable and concise (< 200 words)
- ✅ Works with 10-100 message threads
- ✅ Response time < 5 seconds for 50 messages

**Complexity**: Medium  
**Risk**: Medium (depends on conversation complexity)  
**Value**: Very High (this is the RAG showcase feature)

---

### Feature 3: Action Item Extraction ⭐⭐⭐⭐ (Required #2)

**What**: Identify commitments, tasks, and deadlines from conversations

**Implementation**: Callable Cloud Function with structured output

**User Experience**:
- In chat detail, tap "Find Action Items" button
- System scans conversation (last 50 messages or date range)
- Displays action items in list:
  - ✅ Task description
  - 👤 Assigned to (if mentioned)
  - 📅 Deadline (if mentioned)
  - 💬 Source message (tap to jump to context)
- Can mark as "Done" or add to calendar

**How It Works**:
```javascript
// Use GPT-4 function calling for structured output
const completion = await openai.chat.completions.create({
  model: "gpt-4-turbo",
  messages: [
    { role: "system", content: "Extract action items from conversation..." },
    { role: "user", content: context }
  ],
  functions: [{
    name: "extract_action_items",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string" },
              assignee: { type: "string" },
              deadline: { type: "string" },
              messageId: { type: "string" }
            }
          }
        }
      }
    }
  }],
  function_call: { name: "extract_action_items" }
});

// Store in dedicated collection
/chats/{chatId}/actionItems/{itemId}
  - task: string
  - assignee: string | null
  - deadline: timestamp | null
  - sourceMessageId: string
  - status: "pending" | "completed"
  - createdAt: timestamp
```

**Success Criteria**:
- ✅ Identifies explicit commitments ("I'll do X by Y")
- ✅ Identifies questions that need answers
- ✅ Extracts deadline information correctly
- ✅ Links back to source message
- ✅ Low false positives (< 15%)
- ✅ Response time < 4 seconds

**Complexity**: Medium  
**Risk**: Medium (parsing language is tricky)  
**Value**: Very High (directly actionable)

---

### Feature 4: Smart Search ⭐⭐⭐⭐⭐ (Required #3)

**What**: Semantic search to find relevant messages by meaning, not just keywords

**Implementation**: Vector embeddings + similarity search or GPT-4 semantic search

**User Experience**:
- Search bar in chat detail or AI Insights panel
- User types query: "When did we decide on the deployment date?"
- System searches conversation semantically
- Returns relevant messages ranked by relevance
- Shows message context and jump-to functionality

**How It Works (Two Approaches)**:

**Approach A: Simple Semantic Search (No Vector DB)**
```javascript
// User-friendly, no infrastructure needed
async function semanticSearch(chatId, query) {
  // 1. Fetch recent messages
  const messages = await getLastNMessages(chatId, 100);
  
  // 2. Use GPT-4 to find relevant messages
  const prompt = `
    Find messages most relevant to this query: "${query}"
    
    Messages:
    ${messages.map((m, i) => `${i}. ${m.senderName}: ${m.text}`).join('\n')}
    
    Return indices of 5 most relevant messages as JSON: {"indices": [0, 5, 12, ...]}
  `;
  
  const result = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: prompt }]
  });
  
  // 3. Return matched messages
  const indices = JSON.parse(result.choices[0].message.content).indices;
  return indices.map(i => messages[i]);
}
```

**Approach B: Vector Embeddings (Better, More Scalable)**
```javascript
// One-time: Generate embeddings for all messages
async function generateEmbeddings(chatId) {
  const messages = await getAllMessages(chatId);
  
  for (const message of messages) {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message.text
    });
    
    // Store in Firestore with embedding
    await firestore.collection('chats').doc(chatId)
      .collection('messageEmbeddings').doc(message.messageID)
      .set({
        messageID: message.messageID,
        embedding: embedding.data[0].embedding,
        text: message.text,
        senderName: message.senderName,
        timestamp: message.timestamp
      });
  }
}

// Search: Find similar messages
async function vectorSearch(chatId, query) {
  // 1. Generate query embedding
  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  });
  
  // 2. Fetch all embeddings (or use vector DB)
  const embeddings = await firestore
    .collection('chats').doc(chatId)
    .collection('messageEmbeddings')
    .get();
  
  // 3. Calculate cosine similarity
  const results = embeddings.docs.map(doc => {
    const data = doc.data();
    const similarity = cosineSimilarity(
      queryEmbedding.data[0].embedding,
      data.embedding
    );
    return { ...data, similarity };
  });
  
  // 4. Return top 10 results
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
}

function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
```

**Recommendation**: Start with Approach A (simple), upgrade to Approach B if needed.

**Success Criteria**:
- ✅ Finds relevant messages even with different wording
- ✅ "deployment date" matches "when are we pushing to prod?"
- ✅ Ranks results by relevance
- ✅ Works with natural language queries
- ✅ Response time < 3 seconds for simple search
- ✅ Response time < 5 seconds for vector search

**Complexity**: Medium-High (vector embeddings add complexity)  
**Risk**: Medium (Approach A is low risk, Approach B requires embedding management)  
**Value**: Very High (powerful search capability)

---

### Feature 5: Decision Tracking ⭐⭐⭐⭐⭐ (Required #5)

**What**: Identify and track team decisions made in conversations

**Implementation**: Callable Cloud Function with multi-step reasoning

**User Experience**:
- Tap "Track Decisions" in chat settings
- System analyzes full conversation history
- Displays decisions in timeline:
  - 📋 Decision statement
  - 👥 Who agreed (participants)
  - 📅 When decided
  - 💬 Discussion context (tap to see full thread)
- Can export as decision log

**How It Works (Advanced RAG)**:
```javascript
// Use Langchain agents for multi-step reasoning
import { OpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent } from "langchain/agents";

const agent = await createOpenAIFunctionsAgent({
  llm: new ChatOpenAI({ modelName: "gpt-4-turbo" }),
  tools: [
    {
      name: "fetch_messages",
      description: "Fetch messages from date range",
      func: async (range) => await getMessagesInRange(chatId, range)
    },
    {
      name: "analyze_consensus",
      description: "Analyze if multiple people agreed",
      func: async (messageIds) => await analyzeConsensus(messageIds)
    }
  ],
  prompt: `You are a decision tracker. Identify team decisions in the conversation.
  
  A decision is:
  - An agreement reached by multiple people
  - A choice made by leadership
  - A plan of action confirmed
  
  For each decision, determine:
  1. What was decided
  2. Who agreed (look for affirmative responses)
  3. When it happened
  4. Supporting messages`
});

const result = await agent.invoke({
  input: "Identify all decisions made in this chat"
});

// Store decisions
/chats/{chatId}/decisions/{decisionId}
  - decision: string
  - participants: string[]
  - timestamp: timestamp
  - supportingMessages: string[]
  - confidence: number (0-1)
  - createdAt: timestamp
```

**Success Criteria**:
- ✅ Identifies clear team agreements
- ✅ Distinguishes decisions from suggestions
- ✅ Tracks participant consensus
- ✅ Links to supporting messages
- ✅ Confidence score makes sense
- ✅ Response time < 10 seconds for full chat

**Complexity**: High  
**Risk**: Medium-High (agent behavior can be unpredictable)  
**Value**: Very High (this is the "wow" feature)

---

## Technical Architecture

### Component Overview

```
Client (React Native)
  ↓
  [User taps "Summarize Thread"]
  ↓
Cloud Function (Callable)
  ↓
  1. Fetch messages from Firestore
  2. Build context string
  3. Call OpenAI API (GPT-4)
  4. Parse response
  5. Cache in Firestore
  ↓
Response → Client
  ↓
Display in UI
```

### Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **AI Model** | OpenAI GPT-4 Turbo | Best balance of quality/speed/cost |
| **Orchestration** | Langchain (minimal) | Prompt management, structured output |
| **Backend** | Firebase Cloud Functions v2 | Already in stack, scales automatically |
| **Caching** | Firestore Collections | Persistent, queryable, real-time updates |
| **RAG Strategy** | Context Window (Simple) | No vector DB initially, use GPT-4 128K context |
| **Client SDK** | Native fetch/callable | No special client libraries needed |

**What We're NOT Using (and why)**:
- ❌ **n8n** - Unnecessary complexity, Cloud Functions handle all workflows
- ❌ **Vector Database** - Not needed for MVP, GPT-4 context window sufficient
- ❌ **Heavy Langchain Agents** - Only use if needed for Decision Tracking
- ❌ **Background Triggers** - Start with on-demand to reduce risk/cost

---

## Data Schema

### New Firestore Collections

**`/chats/{chatId}/aiInsights/{insightId}`**
```javascript
{
  insightId: string,
  type: "priority" | "summary" | "actionItems" | "decisions",
  chatId: string,
  data: object, // feature-specific structure
  messageCount: number,
  timeRange: { start: timestamp, end: timestamp },
  requestedBy: string, // userId
  createdAt: timestamp,
  expiresAt: timestamp // cache invalidation (24 hours)
}
```

**`/chats/{chatId}/priorities/{messageId}`** (for Priority Detection)
```javascript
{
  messageId: string,
  chatId: string,
  level: "urgent" | "normal",
  reason: string,
  confidence: number,
  analyzedAt: timestamp
}
```

**`/chats/{chatId}/summaries/{summaryId}`** (for Thread Summarization)
```javascript
{
  summaryId: string,
  chatId: string,
  keyPoints: string[],
  decisions: string[],
  actionItems: string[],
  participants: string[],
  messageCount: number,
  timeRange: { start: timestamp, end: timestamp },
  createdAt: timestamp
}
```

**`/chats/{chatId}/actionItems/{itemId}`** (for Action Items)
```javascript
{
  itemId: string,
  chatId: string,
  task: string,
  assignee: string | null,
  deadline: timestamp | null,
  sourceMessageId: string,
  status: "pending" | "completed",
  completedAt: timestamp | null,
  createdAt: timestamp
}
```

**`/chats/{chatId}/decisions/{decisionId}`** (for Decision Tracking - Stretch)
```javascript
{
  decisionId: string,
  chatId: string,
  decision: string,
  participants: string[],
  timestamp: timestamp,
  supportingMessages: string[],
  confidence: number,
  createdAt: timestamp
}
```

---

## User Interface Design

### AI Insights Panel (New Component)

Location: Chat Detail Screen → Swipe up or tap "AI Insights" button

**Layout**:
```
┌─────────────────────────────┐
│  AI Insights                │
│  ─────────────────────────  │
│                             │
│  [🎯 Check Priorities]      │
│   Find urgent messages      │
│                             │
│  [📝 Summarize Thread]      │
│   Get the key points        │
│                             │
│  [✅ Find Action Items]     │
│   See what needs doing      │
│                             │
│  [📋 Track Decisions]       │
│   Review team choices       │
│                             │
└─────────────────────────────┘
```

**Interaction Flow**:
1. User taps feature button
2. Show loading indicator (spinner + "Analyzing...")
3. On success: Display results in modal/sheet
4. On error: Show friendly message ("AI is busy, try again")
5. Results cached: Show "Last analyzed 5m ago" with refresh option

### Priority Badge Display

- Red badge on message bubble for urgent messages
- Tap to see AI reasoning
- Can dismiss or "Mark as handled"

### Summary Modal

```
┌─────────────────────────────┐
│  Thread Summary             │
│  ─────────────────────────  │
│                             │
│  Key Points:                │
│  • Discussed Q4 roadmap     │
│  • Backend bug needs fixing │
│  • Deployment Friday 3pm    │
│                             │
│  Decisions Made:            │
│  • Go with Option B         │
│                             │
│  Action Items:              │
│  • Sarah: Fix bug by Thu    │
│  • Mike: Deploy on Friday   │
│                             │
│  [Share] [Save] [Close]     │
└─────────────────────────────┘
```

---

## Cost Management

### OpenAI API Costs (Estimated)

**GPT-4 Turbo Pricing**:
- Input: $0.01 per 1K tokens (~$0.01 per 750 words)
- Output: $0.03 per 1K tokens (~$0.03 per 750 words)

**Per Operation Estimates**:
- Priority Detection (30 messages): ~$0.05
- Thread Summarization (50 messages): ~$0.10
- Action Item Extraction (50 messages): ~$0.12
- Decision Tracking (100+ messages): ~$0.25

**Cost Mitigation**:
1. ✅ **Caching**: Store results for 24 hours, reuse if re-requested
2. ✅ **On-Demand**: User triggers, not automatic (predictable costs)
3. ✅ **Rate Limiting**: Max 10 AI operations per user per hour
4. ✅ **Smart Context**: Only send relevant messages, not entire history
5. ✅ **Fallback to GPT-3.5**: If GPT-4 fails, use cheaper model

**Monthly Cost Projection** (100 active users):
- ~1000 AI operations/month
- Average $0.10 per operation
- **Total: ~$100/month**

---

## Testing Strategy

### Feature Testing Requirements

**Each feature must pass**:
1. ✅ **Accuracy Test**: 10 sample conversations, 80%+ accuracy
2. ✅ **Performance Test**: Response time < 5 seconds for typical input
3. ✅ **Error Handling**: Graceful degradation on API failures
4. ✅ **Edge Cases**: Empty chats, very long threads, special characters
5. ✅ **Cost Test**: Verify token usage is within estimates

### Test Scenarios

**Priority Detection**:
- [ ] Detects message with deadline
- [ ] Detects direct @mention
- [ ] Detects question directed at user
- [ ] Doesn't flag casual messages
- [ ] Handles no urgent messages gracefully

**Thread Summarization**:
- [ ] Summarizes 10-message thread accurately
- [ ] Summarizes 50-message thread accurately
- [ ] Identifies key decision
- [ ] Extracts action items
- [ ] Handles chat with no clear topic

**Action Item Extraction**:
- [ ] Finds "I'll do X by Y" commitments
- [ ] Extracts deadline correctly
- [ ] Identifies assignee
- [ ] Links to source message
- [ ] Handles no action items gracefully

---

## Success Metrics

### Phase 2 Complete When:

**Functionality** (All 5 Required Features):
- ✅ Priority Detection working and accurate
- ✅ Thread Summarization generates quality summaries
- ✅ Action Item Extraction finds tasks and deadlines
- ✅ Smart Search finds relevant messages semantically
- ✅ Decision Tracking identifies team agreements
- ✅ RAG pipeline demonstrates conversation context
- ✅ All features accessible via UI
- ✅ Error handling in place
- ✅ Results cached efficiently

**Quality**:
- ✅ Features provide accurate, useful insights (tested on real conversations)
- ✅ Response times acceptable (< 5s for most operations)
- ✅ No crashes or data loss
- ✅ Graceful degradation on errors

**Demo Ready**:
- ✅ Can demonstrate all features working
- ✅ Clear "before/after" value proposition
- ✅ Works reliably in demo scenarios
- ✅ Impressive to technical evaluators

**Documentation**:
- ✅ README updated with AI features
- ✅ Demo video includes AI features
- ✅ Code is clean and commented

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| OpenAI API slow/down | High | Medium | Cache results, add retry logic, fallback to GPT-3.5 |
| GPT-4 output unpredictable | Medium | Medium | Structured output, validation, examples in prompts |
| Langchain complexity | Medium | Low | Use minimally, can remove if issues |
| Integration bugs | Medium | Medium | Incremental implementation, extensive testing |
| Feature not useful | High | Low | Test on real conversations, iterate prompts |
| Vector search complexity | Medium | Medium | Start simple (Approach A), upgrade only if needed |
| Agent unpredictability | Medium | Medium | Test extensively, add confidence scores, human validation

---

## Out of Scope (Future Enhancements)

**Not included in Phase 2**:
- ❌ Fine-tuned models
- ❌ Multi-language support
- ❌ Background automatic processing
- ❌ Advanced analytics dashboard
- ❌ Meeting scheduling
- ❌ Auto-responses
- ❌ Production-grade vector database (Pinecone, etc)

These can be added in Phase 3 if the core features prove valuable.

---

## Deliverables

### Code Deliverables
1. ✅ 5 Cloud Functions (one per feature, all callable)
2. ✅ AI Insights UI components
3. ✅ Client integration code
4. ✅ Prompt templates for all features
5. ✅ Comprehensive error handling
6. ✅ Semantic search implementation
7. ✅ Vector embeddings (if using Approach B)

### Documentation Deliverables
1. ✅ Updated README with AI features
2. ✅ API documentation (Cloud Function interfaces)
3. ✅ Testing guide for AI features
4. ✅ Demo script highlighting AI capabilities

### Demo Deliverables
1. ✅ 5-7 minute video showing:
   - MVP messaging working
   - All 5 AI features in action
   - Before/after comparison
   - Real-world scenarios
   - Technical depth (RAG, semantic search, agents)
2. ✅ Live demo ready for interviews

---

**Document Version**: 2.0  
**Last Updated**: October 22, 2025  
**Status**: Ready for Implementation

