# MessageAI Phase 2 - AI Features Task List

**Goal:** Add intelligent AI features to help remote teams manage communication overload using OpenAI GPT-4 with RAG pipeline.

**Target Persona:** Remote Team Professional

**Core Requirements:**
- ✅ Implement RAG pipeline for conversation context
- ✅ All 5 required features working:
  1. Thread summarization captures key points
  2. Action items correctly extracted
  3. Smart search finds relevant messages
  4. Priority detection flags urgent messages accurately
  5. Decision tracking surfaces agreed-upon decisions
- ✅ Cache all AI results for cost optimization
- ✅ Response time < 5 seconds for most operations

---

## PR 16: AI Infrastructure Setup

**Objective:** Set up OpenAI API integration, Langchain, and basic Cloud Function infrastructure

### Tasks

1. **Install dependencies in Cloud Functions**
   - [ ] Navigate to `functions/` directory
   - [ ] Install required packages:
     ```bash
     cd functions
     npm install openai@^4.20.0
     npm install langchain@^0.1.0
     npm install @langchain/openai@^0.0.19
     npm install @langchain/core@^0.1.0
     ```
   - [ ] Update `package.json` with dependency versions
   - [ ] Test `npm install` completes without errors

2. **Set up OpenAI API credentials**
   - [ ] Obtain OpenAI API key from platform.openai.com
   - [ ] Set Firebase environment config:
     ```bash
     firebase functions:config:set openai.api_key="sk-..."
     ```
   - [ ] Create `.env` file in `/functions` for local development:
     ```
     OPENAI_API_KEY=sk-...
     ```
   - [ ] Add `.env` to `.gitignore`
   - [ ] Document setup in README

3. **Create AI utilities module**
   - [ ] Create `functions/utils/aiUtils.js`
   - [ ] Export `getOpenAIClient()` - returns initialized OpenAI client
   - [ ] Export `buildMessageContext()` - formats messages for GPT-4
     ```javascript
     function buildMessageContext(messages, options = {}) {
       const { maxMessages = 50, format = 'detailed' } = options;
       const recent = messages.slice(-maxMessages);
       
       if (format === 'detailed') {
         return recent.map(m => 
           `[${formatTimestamp(m.timestamp)}] ${m.senderName}: ${m.text}`
         ).join('\n');
       } else {
         return recent.map(m => `${m.senderName}: ${m.text}`).join('\n');
       }
     }
     ```
   - [ ] Export `formatTimestamp()` - human-readable timestamps
   - [ ] Export `validateChatAccess()` - verify user has access to chat
   - [ ] Add error handling helpers
   - [ ] Write JSDoc comments for all functions

4. **Create Langchain wrapper utilities**
   - [ ] Create `functions/utils/langchainUtils.js`
   - [ ] Export `createSimpleChain()` - basic LLM chain with prompt template
     ```javascript
     import { ChatOpenAI } from "@langchain/openai";
     import { PromptTemplate } from "@langchain/core/prompts";
     import { LLMChain } from "langchain/chains";
     
     export function createSimpleChain(templateString, options = {}) {
       const model = new ChatOpenAI({
         modelName: options.model || "gpt-4-turbo-preview",
         temperature: options.temperature || 0.3,
         maxTokens: options.maxTokens || 2000
       });
       
       const prompt = PromptTemplate.fromTemplate(templateString);
       
       return new LLMChain({ llm: model, prompt });
     }
     ```
   - [ ] Export `createStructuredOutputChain()` - for JSON responses
   - [ ] Export `parseJSONResponse()` - safely parse AI responses
   - [ ] Add retry logic with exponential backoff
   - [ ] Add token counting helper

5. **Create caching utilities**
   - [ ] Create `functions/utils/cacheUtils.js`
   - [ ] Export `getCachedResult()` - fetch from Firestore cache
     ```javascript
     async function getCachedResult(chatId, type, options = {}) {
       const { maxAge = 86400000 } = options; // 24 hours default
       
       const snapshot = await admin.firestore()
         .collection('chats').doc(chatId)
         .collection('aiInsights')
         .where('type', '==', type)
         .orderBy('createdAt', 'desc')
         .limit(1)
         .get();
       
       if (snapshot.empty) return null;
       
       const doc = snapshot.docs[0];
       const data = doc.data();
       const age = Date.now() - data.createdAt.toMillis();
       
       if (age > maxAge) return null;
       
       return { id: doc.id, ...data };
     }
     ```
   - [ ] Export `setCacheResult()` - write to Firestore cache
   - [ ] Export `invalidateCache()` - clear old cache entries
   - [ ] Add cache expiration logic (24 hours default)
   - [ ] Add cache stats tracking (hits/misses)

6. **Set up error handling framework**
   - [ ] Create `functions/utils/errors.js`
   - [ ] Define custom error classes:
     - `AIServiceError` - OpenAI API errors
     - `CacheError` - Cache operation errors
     - `ValidationError` - Input validation errors
     - `RateLimitError` - Rate limiting errors
   - [ ] Export `handleAIError()` - centralized error handler
     ```javascript
     export function handleAIError(error, context) {
       console.error(`[AI Error] ${context}:`, error);
       
       if (error.response?.status === 429) {
         return {
           error: 'RATE_LIMIT',
           message: 'AI service is busy. Please try again in a moment.',
           retryAfter: 30
         };
       }
       
       if (error.response?.status === 500) {
         return {
           error: 'SERVICE_ERROR',
           message: 'AI service temporarily unavailable.',
           fallback: true
         };
       }
       
       return {
         error: 'UNKNOWN',
         message: 'Something went wrong. Please try again.',
         details: process.env.NODE_ENV === 'development' ? error.message : undefined
       };
     }
     ```
   - [ ] Add logging utilities with context
   - [ ] Add performance monitoring helpers

7. **Create rate limiting utilities**
   - [ ] Create `functions/utils/rateLimiter.js`
   - [ ] Implement user-based rate limiting:
     - Max 10 AI operations per hour per user
     - Track in Firestore `/rateLimits/{userId}`
   - [ ] Export `checkRateLimit()` - verify user can make request
   - [ ] Export `incrementRateLimit()` - track usage
   - [ ] Add automatic reset after time window
   - [ ] Add admin bypass for testing

8. **Test infrastructure**
   - [ ] Create `functions/__tests__/aiUtils.test.js`
   - [ ] Write unit tests for context building
   - [ ] Write unit tests for cache operations
   - [ ] Write unit tests for error handling
   - [ ] Test OpenAI API connection (manual)
   - [ ] Verify rate limiting works
   - [ ] Deploy to Firebase:
     ```bash
     firebase deploy --only functions
     ```
   - [ ] Check Cloud Function logs for errors

### Testing Checklist
- [ ] OpenAI client initializes without errors
- [ ] Context building formats messages correctly
- [ ] Cache read/write operations work
- [ ] Error handling returns user-friendly messages
- [ ] Rate limiting blocks after limit reached
- [ ] All unit tests pass
- [ ] No linter errors
- [ ] Cloud Functions deploy successfully

### Commit
`feat: set up AI infrastructure with OpenAI, Langchain, and caching (PR16)`

---

## PR 17: Priority Detection Feature (Required #4)

**Objective:** Implement AI-powered priority detection to flag urgent messages

### Tasks

1. **Create prompt template for priority detection**
   - [ ] Create `functions/prompts/priorityDetection.js`
   - [ ] Define system prompt:
     ```javascript
     export const PRIORITY_SYSTEM_PROMPT = `You are an expert at analyzing workplace messages to determine urgency.

     Analyze each message for:
     1. Time-sensitive keywords (deadline, urgent, ASAP, today, tomorrow)
     2. Direct questions or requests to specific people
     3. Blocking issues or critical problems
     4. @mentions of the current user
     
     Respond with JSON for each message:
     {
       "messageId": "string",
       "priority": "urgent" | "normal",
       "reason": "Brief explanation",
       "confidence": 0-1 (float)
     }`;
     ```
   - [ ] Add examples for few-shot learning (3-5 examples)
   - [ ] Test prompt with sample conversations

2. **Create Cloud Function: analyzePriorities**
   - [ ] Create `functions/analyzePriorities.js`
   - [ ] Export callable function with full implementation
   - [ ] Include: auth check, rate limiting, chat access validation
   - [ ] Include: cache check, message fetching, context building
   - [ ] Include: OpenAI API call, response parsing
   - [ ] Include: Firestore storage of priorities
   - [ ] Include: cache result and rate limit increment
   - [ ] Add comprehensive error handling
   - [ ] Add performance logging

3. **Create client-side AI service**
   - [ ] Create `services/aiService.js`
   - [ ] Export `analyzePriorities(chatId, options)`:
     ```javascript
     import { getFunctions, httpsCallable } from 'firebase/functions';
     
     export async function analyzePriorities(chatId, options = {}) {
       try {
         const functions = getFunctions();
         const callable = httpsCallable(functions, 'analyzePriorities');
         
         const result = await callable({
           chatId,
           messageCount: options.messageCount || 30
         });
         
         return { success: true, data: result.data };
       } catch (error) {
         console.error('[AI Service] Priority analysis failed:', error);
         
         return {
           success: false,
           error: error.code || 'UNKNOWN',
           message: error.message || 'Failed to analyze priorities'
         };
       }
     }
     ```
   - [ ] Add loading state management
   - [ ] Add error handling with user-friendly messages

4. **Create AI Insights Panel UI component**
   - [ ] Create `components/AIInsightsPanel.js`
   - [ ] Build bottom sheet/modal layout
   - [ ] Add Priority Detection button with icon and description
   - [ ] Add loading states
   - [ ] Add error display
   - [ ] Style with consistent design system
   - [ ] Add accessibility labels
   - [ ] Test on various screen sizes

5. **Create Priority Badge component**
   - [ ] Create `components/PriorityBadge.js`
   - [ ] Props: `priority` object with level, reason
   - [ ] Display: Red badge with "!" icon for urgent
   - [ ] Tap to show reason in tooltip/modal
   - [ ] Add dismiss functionality
   - [ ] Animate entrance (fade in)

6. **Integrate into Chat Detail screen**
   - [ ] Modify `app/chat/[chatId].js`
   - [ ] Add "AI Insights" button in header (brain icon 🧠)
   - [ ] Import `AIInsightsPanel` component
   - [ ] Add modal state management
   - [ ] Wire up analyzePriorities call
   - [ ] Display loading state while analyzing
   - [ ] Show results in modal
   - [ ] Subscribe to priority updates from Firestore
   - [ ] Display PriorityBadge on urgent messages

7. **Set up Firestore listener for priorities**
   - [ ] In chat detail screen, add listener for real-time updates
   - [ ] Update MessageBubble to show badge if priority exists
   - [ ] Handle real-time updates

8. **Test Priority Detection**
   - [ ] Create test chat with urgent and normal messages
   - [ ] Tap "Check Priorities" button
   - [ ] Verify urgent messages flagged correctly
   - [ ] Verify reasons make sense
   - [ ] Test error handling (airplane mode)
   - [ ] Test cache (second request faster)
   - [ ] Test rate limiting

### Testing Checklist
- [ ] Cloud Function deploys successfully
- [ ] Priority detection identifies urgent messages
- [ ] UI displays priorities correctly
- [ ] Badge shows on urgent messages
- [ ] Loading states work
- [ ] Error messages are user-friendly
- [ ] Cache reduces response time
- [ ] Rate limiting works
- [ ] Response time < 3 seconds for 30 messages

### Commit
`feat: implement AI priority detection for urgent messages (PR17)`

---

## PR 18: Thread Summarization Feature (Required #1)

**Objective:** Implement AI-powered thread summarization with key points, decisions, and action items (RAG showcase)

### Tasks

1-8. **[Similar to previous version but updated labels]**
   - All tasks remain the same as before
   - This is the RAG showcase feature
   - Demonstrates conversation context retrieval

### Testing Checklist
- [ ] Summarization works for 10-100 message threads
- [ ] Key points are accurate and relevant
- [ ] Decisions captured correctly
- [ ] Action items extracted with assignees/deadlines
- [ ] Response time < 5 seconds for 50 messages

### Commit
`feat: implement AI thread summarization with RAG pipeline (PR18)`

---

## PR 19: Action Item Extraction Feature (Required #2)

**Objective:** Automatically extract tasks, commitments, and deadlines from conversations

### Tasks

1-8. **[Similar to previous version but updated labels]**
   - All tasks remain the same as before
   - Uses GPT-4 function calling for structured output

### Testing Checklist
- [ ] Extracts explicit commitments correctly
- [ ] Extracts questions needing answers
- [ ] Parses deadlines accurately
- [ ] Links to source messages correctly
- [ ] Response time < 4 seconds

### Commit
`feat: implement AI action item extraction from conversations (PR19)`

---

## PR 20: Smart Search Feature (Required #3)

**Objective:** Implement semantic search to find relevant messages by meaning, not just keywords

### Tasks

1. **Decide on implementation approach**
   - [ ] Review Approach A (Simple - GPT-4 semantic matching)
   - [ ] Review Approach B (Vector embeddings + cosine similarity)
   - [ ] **Decision**: Start with Approach A for speed, can upgrade later
   - [ ] Document decision

2. **Create search utility functions**
   - [ ] Create `functions/utils/searchUtils.js`
   - [ ] If Approach A:
     - Export `semanticSearchSimple(chatId, query)` using GPT-4
   - [ ] If Approach B:
     - Export `generateEmbeddings(chatId)` for message embedding
     - Export `cosineSimilarity(a, b)` for similarity calculation
     - Export `vectorSearch(chatId, query)` for searching
   - [ ] Add message ranking logic
   - [ ] Add result limiting (top 10)

3. **Create Cloud Function: smartSearch**
   - [ ] Create `functions/smartSearch.js`
   - [ ] Export callable function:
     ```javascript
     exports.smartSearch = functions.https.onCall(async (data, context) => {
       // Auth & validation
       if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
       
       const { chatId, query, limit = 10 } = data;
       const userId = context.auth.uid;
       
       await checkRateLimit(userId, 'search');
       await validateChatAccess(userId, chatId);
       
       // Approach A: Simple semantic search with GPT-4
       const messages = await getLastNMessages(chatId, 100);
       const context = messages.map((m, i) => 
         `${i}. [${m.senderName}]: ${m.text}`
       ).join('\n');
       
       const prompt = `
         Find messages most relevant to: "${query}"
         
         Messages:
         ${context}
         
         Return JSON with top ${limit} relevant message indices and relevance scores:
         {"results": [{"index": 0, "relevance": 0.9, "reason": "..."}]}
       `;
       
       const result = await openai.chat.completions.create({
         model: "gpt-4-turbo",
         messages: [{ role: "user", content: prompt }]
       });
       
       const parsed = JSON.parse(result.choices[0].message.content);
       const results = parsed.results.map(r => ({
         ...messages[r.index],
         relevance: r.relevance,
         reason: r.reason
       }));
       
       await incrementRateLimit(userId, 'search');
       
       return { results, query, timestamp: Date.now() };
     });
     ```
   - [ ] Add error handling
   - [ ] Add performance logging

4. **Add to client AI service**
   - [ ] In `services/aiService.js`, add:
     ```javascript
     export async function smartSearch(chatId, query, options = {}) {
       try {
         const functions = getFunctions();
         const callable = httpsCallable(functions, 'smartSearch');
         
         const result = await callable({
           chatId,
           query,
           limit: options.limit || 10
         });
         
         return { success: true, data: result.data };
       } catch (error) {
         return {
           success: false,
           error: error.code,
           message: getErrorMessage(error)
         };
       }
     }
     ```

5. **Create Search UI component**
   - [ ] Create `components/SmartSearchModal.js`
   - [ ] Add search input field
   - [ ] Add search button with loading state
   - [ ] Display results list:
     - Message text
     - Sender name
     - Timestamp
     - Relevance score/badge
     - "Jump to message" button
   - [ ] Add empty state ("No results found")
   - [ ] Add keyboard dismiss
   - [ ] Style consistently

6. **Integrate into AI Insights Panel**
   - [ ] Add "Smart Search" button in AIInsightsPanel
   - [ ] Wire up modal display
   - [ ] Handle search query submission
   - [ ] Display results
   - [ ] Implement "jump to message" functionality:
     ```javascript
     function jumpToMessage(messageId) {
       // Scroll FlatList to message
       messageListRef.current?.scrollToItem({ item: message });
       // Highlight message briefly
     }
     ```

7. **Test Smart Search**
   - [ ] Create test conversation with various topics
   - [ ] Search for specific concept in different words
     - Query: "deployment date" should find "when are we pushing to prod"
     - Query: "bug" should find "issue" and "problem"
   - [ ] Verify results are ranked by relevance
   - [ ] Verify jump-to-message works
   - [ ] Test with no results
   - [ ] Test error handling
   - [ ] Measure response time

8. **Optional: Upgrade to Approach B (if needed)**
   - [ ] Only if Approach A is too slow or inaccurate
   - [ ] Generate embeddings for existing messages
   - [ ] Update Cloud Function to use vector search
   - [ ] Test performance improvement

### Testing Checklist
- [ ] Search finds relevant messages by meaning
- [ ] Different wording returns same results
- [ ] Results ranked by relevance
- [ ] Jump to message works
- [ ] Loading states work
- [ ] Error handling graceful
- [ ] Response time < 3-5 seconds

### Commit
`feat: implement semantic smart search for messages (PR20)`

---

## PR 21: Decision Tracking Feature (Required #5)

**Objective:** Identify and track team decisions using AI agents with multi-step reasoning

### Tasks

1. **Create decision tracking prompt with agent tools**
   - [ ] Create `functions/prompts/decisionTracking.js`
   - [ ] Define agent system prompt:
     ```javascript
     export const DECISION_AGENT_PROMPT = `You are an expert at identifying team decisions in workplace conversations.

     A decision is:
     - An agreement reached by multiple people
     - A choice made by leadership
     - A plan of action confirmed

     For each decision:
     1. What was decided
     2. Who agreed (look for affirmative responses)
     3. When it happened
     4. Supporting messages`;
     ```
   - [ ] Add decision identification criteria
   - [ ] Add examples

2. **Set up Langchain agent (if using agents)**
   - [ ] Install agent dependencies if needed
   - [ ] Create `functions/utils/agentUtils.js`
   - [ ] Define agent tools:
     - `fetch_message_thread` - get conversation around timestamp
     - `analyze_consensus` - check if multiple people agreed
     - `find_alternatives` - identify options discussed
   - [ ] Create agent configuration
   - [ ] Test agent behavior with sample data

3. **Create Cloud Function: trackDecisions**
   - [ ] Create `functions/trackDecisions.js`
   - [ ] Export callable function:
     ```javascript
     exports.trackDecisions = functions.https.onCall(async (data, context) => {
       if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
       
       const { chatId } = data;
       const userId = context.auth.uid;
       
       await checkRateLimit(userId, 'decisions');
       await validateChatAccess(userId, chatId);
       
       // Check cache
       const cached = await getCachedResult(chatId, 'decisions', { maxAge: 86400000 });
       if (cached) return cached;
       
       // Fetch ALL messages for full context
       const messages = await getAllMessagesInChat(chatId);
       const context = buildMessageContext(messages, { format: 'detailed' });
       
       // Use agent or structured prompt
       const agent = createDecisionAgent(); // or use simple prompt
       const decisions = await agent.invoke({
         conversationHistory: context,
         task: "identify_decisions"
       });
       
       // Store decisions with metadata
       const batch = admin.firestore().batch();
       const decisionsCollection = admin.firestore()
         .collection('chats').doc(chatId)
         .collection('decisions');
       
       decisions.forEach(decision => {
         const docRef = decisionsCollection.doc();
         batch.set(docRef, {
           decision: decision.text,
           participants: decision.participants,
           timestamp: decision.timestamp,
           supportingMessages: decision.messageIds,
           confidence: decision.confidence,
           createdAt: admin.firestore.FieldValue.serverTimestamp()
         });
       });
       
       await batch.commit();
       
       const cacheData = {
         type: 'decisions',
         chatId,
         decisions,
         totalFound: decisions.length,
         createdAt: admin.firestore.FieldValue.serverTimestamp()
       };
       await setCacheResult(chatId, cacheData);
       await incrementRateLimit(userId, 'decisions');
       
       return cacheData;
     });
     ```
   - [ ] Add error handling
   - [ ] Add confidence scoring

4. **Create Decision Timeline UI**
   - [ ] Create `components/DecisionTimeline.js`
   - [ ] Display decisions chronologically:
     ```jsx
     <ScrollView>
       {decisions.map(decision => (
         <DecisionCard key={decision.id}>
           <DecisionText>{decision.decision}</DecisionText>
           <Participants>
             Agreed by: {decision.participants.join(', ')}
           </Participants>
           <Timestamp>{formatDate(decision.timestamp)}</Timestamp>
           <ViewContext onPress={() => showMessages(decision.supportingMessages)}>
             View Discussion
           </ViewContext>
         </DecisionCard>
       ))}
     </ScrollView>
     ```
   - [ ] Add "View Discussion" to show supporting messages
   - [ ] Style timeline view

5. **Integrate into AI Insights Panel**
   - [ ] Add "Track Decisions" button
   - [ ] Wire up Cloud Function call
   - [ ] Display timeline modal
   - [ ] Handle loading and error states

6. **Test Decision Tracking**
   - [ ] Create conversations with clear decisions:
     - "Let's go with Option B" + "Agreed" from others
     - "We'll deploy on Friday" + confirmations
   - [ ] Test agent reasoning
   - [ ] Verify participants identified correctly
   - [ ] Verify supporting messages linked
   - [ ] Test with no decisions
   - [ ] Test with ambiguous discussions

### Testing Checklist
- [ ] Identifies clear team decisions
- [ ] Distinguishes decisions from suggestions
- [ ] Tracks participant consensus
- [ ] Links to supporting messages
- [ ] Confidence scores make sense
- [ ] Response time < 10 seconds
- [ ] Agent reasoning is logical (if using agents)

### Commit
`feat: implement AI decision tracking with multi-step reasoning (PR21)`

---

## PR 22: AI Features Polish & Testing

**Objective:** Polish UI/UX, optimize performance, comprehensive testing

### Tasks

1. **Performance Optimization**
   - [ ] Review all AI Cloud Functions for bottlenecks
   - [ ] Add response time logging
   - [ ] Optimize Firestore queries (add indexes if needed)
   - [ ] Test with 100+ message threads
   - [ ] Profile token usage

2. **Error Handling Enhancement**
   - [ ] Add retry logic for transient failures
   - [ ] Improve error messages for users
   - [ ] Add fallback to GPT-3.5 if GPT-4 fails
   - [ ] Log errors appropriately
   - [ ] Test all error scenarios

3. **UI/UX Polish**
   - [ ] Add animations for modal transitions
   - [ ] Add skeleton loaders for AI operations
   - [ ] Improve empty states
   - [ ] Add tooltips/help text
   - [ ] Ensure consistent styling
   - [ ] Test on various screen sizes
   - [ ] Add haptic feedback

4. **Cache Management**
   - [ ] Implement automatic cache cleanup (scheduled function)
   - [ ] Add manual cache invalidation
   - [ ] Optimize cache TTL based on usage
   - [ ] Monitor cache hit rates

5. **Rate Limiting Refinement**
   - [ ] Review rate limits based on testing
   - [ ] Add UI feedback when approaching limits
   - [ ] Document rate limit policies

6. **Comprehensive Testing**
   - [ ] Test all 5 features end-to-end
   - [ ] Test with various conversation types
   - [ ] Test error scenarios
   - [ ] Test on multiple devices
   - [ ] Measure accuracy for each feature
   - [ ] Document test results

7. **Documentation**
   - [ ] Document all AI features in README
   - [ ] Add inline code comments
   - [ ] Create API documentation for Cloud Functions
   - [ ] Document prompt engineering decisions
   - [ ] Create troubleshooting guide

8. **Demo Preparation**
   - [ ] Create demo script
   - [ ] Prepare test conversations
   - [ ] Record demo video (5-7 minutes):
     - MVP features recap
     - All 5 AI features demonstrated
     - Technical depth shown (RAG, semantic search, agents)
     - Before/after value clear
   - [ ] Edit and polish video
   - [ ] Prepare presentation

### Testing Checklist
- [ ] All 5 features work reliably
- [ ] Response times acceptable
- [ ] Error handling graceful
- [ ] UI polished and consistent
- [ ] Documentation comprehensive
- [ ] Demo video ready

### Commit
`feat: polish and test all AI features, prepare demo (PR22)`

---

## Final Checklist: Phase 2 Complete

### All 5 Required Features Working
- [ ] **Priority Detection** - Flags urgent messages accurately
- [ ] **Thread Summarization** - Captures key points with RAG
- [ ] **Action Item Extraction** - Correctly extracts tasks and deadlines
- [ ] **Smart Search** - Finds relevant messages semantically
- [ ] **Decision Tracking** - Surfaces agreed-upon decisions

### Quality Standards
- [ ] Response times < 5 seconds for most operations
- [ ] Error handling is graceful
- [ ] UI is polished and intuitive
- [ ] Features provide genuine value
- [ ] No crashes or data loss
- [ ] RAG pipeline demonstrates conversation context

### Technical Implementation
- [ ] Cloud Functions deploy successfully
- [ ] OpenAI API integration working
- [ ] Langchain orchestration effective
- [ ] Firestore caching efficient
- [ ] All features accessible via UI
- [ ] No linter errors

### Demo & Documentation
- [ ] Demo video recorded (5-7 minutes)
- [ ] All 5 features demonstrated
- [ ] Technical depth showcased
- [ ] Documentation complete
- [ ] README updated

---

## Implementation Priority Order

**Recommended sequence (by risk and dependency):**

1. ✅ **PR 16: Infrastructure** - Foundation for everything
2. ✅ **PR 17: Priority Detection** - Simplest feature, quick win
3. ✅ **PR 18: Thread Summarization** - Core RAG showcase
4. ✅ **PR 19: Action Item Extraction** - Builds on summarization
5. ✅ **PR 20: Smart Search** - Start simple, can be upgraded
6. ✅ **PR 21: Decision Tracking** - Most complex, but foundation is ready
7. ✅ **PR 22: Polish & Testing** - Final refinement

**Alternative order if needed:**
- Can swap PR 20 (Smart Search) and PR 21 (Decision Tracking) if preferred
- Can implement Smart Search Approach A quickly, upgrade later
- Cannot skip any feature - all 5 are required

---

**Document Version:** 2.0  
**Last Updated:** October 22, 2025  
**Status:** Ready for Implementation  
**Note:** All 5 features must be implemented. Timeline and cost information removed per user request.
