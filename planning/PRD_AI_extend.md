# MessageAI Phase 2 Extension - Global AI Features PRD

## Overview

**Target Persona:** Busy Working Professional  
**Core Problem:** Information overload across multiple conversations, missing critical messages, losing track of commitments  
**Solution:** Global AI-powered inbox that surfaces what matters most

## Product Vision

Transform MessageAI from a messaging app with AI features into an **intelligent communication assistant** that helps busy professionals stay on top of their conversations without drowning in message volume.

### Key Principles
1. **Proactive, not reactive** - AI works for you, not on-demand
2. **Global, not siloed** - Analyze across all conversations, not per-chat
3. **Priority-driven** - Show what matters most, hide the noise
4. **Fast and smart** - Cache aggressively, optimize for latency

---

## Core Features

### Feature 1: Auto-Summary on App Open 🎯

**User Story:** As a busy professional, when I open the app after being away, I want an instant overview of everything I missed so I can quickly decide what needs my attention.

#### Behavior
- **Trigger:** App open (foreground from background/closed state)
- **Condition:** Only if unread messages exist
- **Presentation:** Full-screen modal (dismissible)
- **Fallback:** If no unread messages, show small toast: "No unread messages"

#### Summary Structure
```
📊 Unread Summary
━━━━━━━━━━━━━━━━━
⏰ Since [last open time] • [X] unread messages from [Y] chats

🔑 Key Points
• [Bullet point 1]
• [Bullet point 2]
• [Bullet point 3]

✅ New Action Items ([count])
• [Task] - @[person] - due [deadline] - from [chat name]
• [Task] - @[person] - from [chat name]

🎯 Decisions Made ([count])
• [Decision] - agreed by [people] - in [chat name]

[Close] [View Action Items] [View Chats]
```

#### Technical Details
- **Input:** All unread messages since last app open (tracked via watermark per user)
- **AI Model:** GPT-4o-mini for speed
- **Latency Target:** 
  - Show cached version instantly (if < 15 min old)
  - Background refresh and swap in fresh results (2-3s target)
  - Never block user from accessing chats
- **Caching Strategy:**
  - Cache per-user in `/users/{userId}/aiCache/globalSummary`
  - Store unread watermark per chat: `{chatId: lastSeenMessageId}`
  - Only process messages after watermark (delta processing)
  - Merge delta summary with cached summary
  - TTL: 15 minutes
  - Invalidate on new unread messages (but show stale while refreshing)

#### Success Metrics
- Initial summary display: < 500ms (from cache)
- Fresh summary generation: < 3s for 100-200 unread messages
- Cache hit rate: > 80%

---

### Feature 2: AI Priority Chat Ordering 🚨

**User Story:** As a busy professional, I want my chat list ordered by what actually needs my attention, not just what's most recent.

#### Behavior
- **Default View:** Chats list sorted by priority score (high to low)
- **Visual Indicators:**
  - **Bold text** if last message is unread
  - **Red "!" badge** if any unread message in that chat is urgent
  - **Yellow dot** for medium priority (optional polish)
- **Re-scoring:**
  - Full re-score on app open (all chats with unread)
  - Lightweight re-score for new messages while app is open

#### Priority Scoring Algorithm

**Hybrid Approach:** Lightweight local score + AI signals

```javascript
// Phase 1: Lightweight local scoring (runs immediately)
localScore = 
  (unreadCount * 0.3) +
  (recencyScore * 0.2) +          // 1.0 if < 1hr, decays to 0 over 24hr
  (senderAffinityScore * 0.1) +   // 1.0 for frequent contacts
  (unansweredQuestionBonus)       // +0.5 if last message is a question mark

// Phase 2: AI urgency detection (runs for high-priority candidates)
if (localScore > 0.5 OR unreadCount > 5) {
  aiSignals = await detectUrgency(chat)
  
  finalScore = localScore + 
    (aiSignals.hasUrgentKeywords * 0.4) +     // "urgent", "ASAP", "deadline"
    (aiSignals.hasUnansweredQuestion * 0.6) + // Boost questions directed at user
    (aiSignals.hasFollowUp * 0.3) +           // Multiple messages from same person
    (aiSignals.hasDeadline * 0.5) +           // Time-bound commitment
    (aiSignals.mentionsUser * 0.4)            // @mentions or name
}
```

#### Technical Details
- **Storage:** `/users/{userId}/aiCache/chatPriorities/{chatId}`
  - Fields: `{score, urgency, lastAnalyzed, signals}`
- **Rate Limiting:** Reuse existing AI rate limits
- **Caching:** 6 hours for AI signals, instant for local scores
- **Fallback:** If AI fails, use localScore only

---

### Feature 3: Global Action Items Tab 📋

**User Story:** As a busy professional, I want to see all my commitments across all conversations in one place, sorted by what's most urgent.

#### UI Location
- New bottom tab: "Action Items" (icon: checkbox/checklist)
- Replaces per-chat action items

#### Layout
```
Action Items                    [Sort: Priority ▾]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 HIGH PRIORITY
• Review Q4 budget by EOD
  @You • due Today 5pm • from #Finance Team
  [Mark Complete] [View Context]

• Approve PR #234
  @You • due Tomorrow • from #Engineering
  [Mark Complete] [View Context]

🟡 MEDIUM PRIORITY
...

🟢 LOW PRIORITY
...

✅ COMPLETED (3)
[Show/Hide]
```

#### Features
- **Flat list** across all chats
- **Sort options:** 
  - By Priority (default): High → Medium → Low → Completed
  - By Deadline: Soonest first
- **Each item shows:**
  - Priority badge (🔴🟡🟢)
  - Task description
  - Assignee (if any)
  - Deadline (if any)
  - Source chat name
- **Actions:**
  - Mark Complete / Reopen
  - View Context (opens chat to recent messages, highlights source message)
- **Filter button:** "Show Decisions Only" (meets rubric requirement for decision tracking)
- **Auto-refresh:** Real-time listener on all action items

#### Technical Details
- **Storage:** `/actionItems/{itemId}` (collection group query for all user's items)
- **Fields:** 
  ```javascript
  {
    itemId, userId, chatId, sourceMessageId,
    task, assignee, deadline, priority, type,
    status: 'pending' | 'completed',
    isDecision: boolean,
    createdAt, completedAt
  }
  ```
- **Extraction:** Reuse existing `extractActionItems` Cloud Function
- **Decisions:** Same collection, filtered by `isDecision: true`

---

### Feature 4: Global Smart Search Tab 🔍

**User Story:** As a busy professional, I want to find any past conversation by meaning, not just exact keywords.

#### UI Location
- New bottom tab: "Search" (icon: magnifying glass)

#### Two-Stage Search

**Stage 1: Fast Search (< 1.5s)**
- Search scope: Last 500 messages (recent context)
- Model: GPT-4o-mini
- Shows: Top 5-10 results with relevance badges

**Stage 2: Deep Search (2-4s)**
- Triggered automatically after Stage 1 completes
- Search scope: All messages (or last 5000)
- Model: GPT-4o or GPT-4-turbo
- Shows: Top 20 results, refined ranking

#### Layout
```
Smart Search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Search messages...                    🔍]

Suggested Searches:
• "When is the deadline for the proposal?"
• "Who volunteered to review the document?"
• "What did we decide about the budget?"
• "Messages about the client meeting"

─── OR (after search) ───

Searching...  [5 results]
Refining...   [14 results]

High Relevance (95%)
📨 "The proposal deadline is Friday EOD"
   Sarah Chen • 2 days ago • #Project Alpha
   [Jump to Message]

High Relevance (88%)
📨 "Can you finish the proposal by Friday?"
   Mike Johnson • 3 days ago • #Project Alpha
   [Jump to Message]

...
```

#### Technical Details
- **Stage 1:** 
  - Context: Last 500 messages with IDs
  - Prompt: "Find messages matching: {query}. Return message IDs and relevance 0-1."
  - Cache: Session-based (cleared on app close)
- **Stage 2:**
  - Context: All messages or last 5000
  - Same prompt, broader scope
  - Merge with Stage 1 results, re-rank
- **Suggested Queries:** Hardcoded examples (no AI)
- **Results show:**
  - Message text (3-line preview)
  - Sender name + timestamp
  - Relevance badge (color-coded)
  - Source chat name
  - Jump to message button

---

### Feature 5: Background Priority Detection 🔔

**User Story:** As a busy professional, I want the app to automatically detect urgent messages as they arrive, not just when I manually run analysis.

#### Behavior
- **On app open:** Run priority detection for all messages since last open (across all chats)
- **While app is open:** Run priority detection on new incoming messages (debounced 2s)
- **Visual feedback:** Red "!" badge appears on chat list immediately

#### Technical Details
- **Reuse:** Existing `analyzePriorities` Cloud Function
- **Optimization:** 
  - Batch messages from same chat
  - Only analyze unread messages
  - Cache results for 6 hours
- **Rate limiting:** 
  - On open: May hit rate limit if 100+ unread messages
  - Show warning: "Priority analysis rate limit reached. Showing cached results."
- **Fallback:** Lightweight keyword detection if AI unavailable

---

## Removed Features

### ❌ Per-Chat AI Insights Panel
- **Reason:** Moving to global, proactive model
- **Migration:** 
  - Drop `AIInsightsPanel` component
  - Drop per-chat summarization
  - Drop per-chat action items
  - Keep priority badges on individual messages (red bubble)

### ❌ Decision Tracking Page (PR21)
- **Reason:** Decisions folded into Action Items (with filter)
- **Rubric Compliance:** "Show Decisions Only" filter satisfies "surfaces agreed-upon decisions"

---

## Success Criteria

### Performance
- ✅ Summary popup appears < 500ms (cached)
- ✅ Fresh summary generates < 3s (100-200 unread)
- ✅ Chat list re-sorts instantly on app open
- ✅ Action Items page loads < 1s
- ✅ Smart Search Stage 1 < 1.5s, Stage 2 < 4s

### Accuracy
- ✅ Priority detection: 80%+ accuracy on urgent messages
- ✅ Action item extraction: 85%+ precision (no hallucinations)
- ✅ Smart search: Top 3 results relevant 90%+ of time
- ✅ Summary: Captures all critical info (no missed urgent items)

### User Experience
- ✅ Non-blocking: User can dismiss and access chats immediately
- ✅ Progressive: Show cached → update in background
- ✅ Clear indicators: Loading states, cache age, refresh buttons
- ✅ Error handling: Graceful fallbacks, retry options

### Cost Optimization
- ✅ Cache hit rate > 80% for summaries
- ✅ Delta processing reduces API calls by 60%
- ✅ Smart batching: Process multiple messages in single API call
- ✅ Estimated cost: < $5 per 1000 active users per month

---

## Rubric Alignment

### Required Features (Remote Team Professional)
1. ✅ **Thread summarization** → Global unread summary
2. ✅ **Action items extraction** → Global Action Items tab
3. ✅ **Smart search** → Global Smart Search tab
4. ✅ **Priority detection** → AI priority ordering + urgent badges
5. ✅ **Decision tracking** → "Show Decisions" filter in Action Items

### Advanced AI Capability
- **Intelligent Processing** with delta-based RAG pipeline
- **Proactive Assistant** that monitors all conversations
- **Multi-step workflow:** Summary → Action Items → Priority Sorting

### Mobile App Quality
- Progressive loading (cached → fresh)
- Non-blocking UI (background updates)
- Real-time updates (Firestore listeners)
- Optimistic UI updates

---

## Implementation Phases (Code Reuse Strategy)

### Existing Assets ✅
**Already Built (100% Reusable):**
- All Cloud Functions: `analyzePriorities`, `summarizeThread`, `extractActionItems`, `smartSearch`
- All UI Components: `SummaryModal`, `ActionItemsList`, `ActionItemsModal`, `TypeBadge`, `PriorityBadge`
- All Client Services: Complete `aiService.js` with all 5 features
- All Infrastructure: Caching, rate limiting, error handling, prompts
- **Total existing code:** ~8,000+ lines ready to reuse

### Phase 1: Global Summary Wrapper (PR20 - 4-6 hrs)
**Strategy:** Wrapper function that calls existing `summarizeThread` for multiple chats
- NEW: Watermark tracking service (~100 lines)
- NEW: `summarizeUnread` Cloud Function (~150 lines, calls existing logic)
- MODIFY: `SummaryModal` component (+20 lines for chat names)
- MODIFY: App root layout (+50 lines for trigger)
- **Reuses:** Existing summarization logic, prompts, caching, UI

### Phase 2: Priority Ordering Hybrid (PR21 - 4-5 hrs)
**Strategy:** Add local scoring, use existing `analyzePriorities` in batch
- NEW: Priority scoring service (~150 lines)
- MODIFY: `analyzePriorities` (+30 lines for batch support)
- MODIFY: Chat list screen (+80 lines for sorting)
- MODIFY: `ChatListItem` (+30 lines for indicators)
- **Reuses:** Existing AI analysis, prompts, caching, rate limiting

### Phase 3: Global Tabs with Existing Components (PR22 - 6-8 hrs)
**Strategy:** 100% reuse of ActionItemsList, minimal Cloud Function changes
- NEW: Action Items tab screen (~150 lines, wraps existing `ActionItemsList`)
- NEW: Search tab screen (~250 lines)
- MODIFY: `extractActionItems` (+5 lines to write to global collection)
- MODIFY: `smartSearch` (+30 lines for global support)
- MODIFY: Bottom navigation (+10 lines for tabs)
- **Reuses:** Existing ActionItemsList (filtering/sorting/UI), search function, all logic

### Phase 4: Polish with Enhancements (PR23 - 3-4 hrs)
**Strategy:** Small enhancements to existing components
- MODIFY: `SummaryModal` (+30 lines for one-tap actions)
- MODIFY: `ChatListItem` (+50 lines for tooltip)
- ADD: Performance memoization (+20 lines)
- **Reuses:** All existing components and logic

### Total Implementation
- **New code:** ~1,110 lines (mostly wrappers and UI screens)
- **Reused code:** ~8,000+ lines (Cloud Functions, components, services)
- **Time savings:** 40% reduction (17-23 hrs vs. 28-36 hrs from scratch)
- **Risk reduction:** Using proven, tested code instead of rewriting

---

## Future Enhancements (Post-MVP)

### User Preferences
- Disable auto-summary
- Adjust priority thresholds
- Custom action item categories
- Search filters (date, chat, person)

### Analytics Dashboard
- Busiest chats
- Response time trends
- Action item completion rate
- Time saved metrics

### Advanced Intelligence
- Predictive typing based on context
- Meeting scheduling from conversations
- Sentiment analysis for team health
- Automatic follow-up reminders

---

## Technical Architecture

### Data Model

#### User Cache Document
```javascript
/users/{userId}/aiCache/globalSummary
{
  lastUpdated: timestamp,
  watermarks: {
    [chatId]: lastSeenMessageId
  },
  summary: {
    keyPoints: [],
    actionItems: [],
    decisions: [],
    unreadCount: number,
    chatCount: number
  },
  metadata: {
    messageCount: number,
    processingTime: number,
    model: "gpt-4o-mini"
  }
}

/users/{userId}/aiCache/chatPriorities/{chatId}
{
  score: number,
  urgency: "high" | "medium" | "low",
  signals: {
    hasUrgentKeywords: boolean,
    hasUnansweredQuestion: boolean,
    hasFollowUp: boolean,
    hasDeadline: boolean,
    mentionsUser: boolean
  },
  lastAnalyzed: timestamp
}
```

#### Action Items Collection
```javascript
/actionItems/{itemId}
{
  itemId: string,
  userId: string,
  chatId: string,
  sourceMessageId: string,
  task: string,
  assignee: string | null,
  deadline: timestamp | null,
  priority: "high" | "medium" | "low",
  type: "commitment" | "question" | "task" | "decision",
  isDecision: boolean,
  status: "pending" | "completed",
  context: string,
  createdAt: timestamp,
  completedAt: timestamp | null
}
```

### Cloud Functions

#### New Functions
- `summarizeUnread` - Global summary with delta processing
- `analyzePriorityBatch` - Batch priority detection
- `searchMessages` - Two-stage semantic search
- `updateWatermarks` - Track last seen messages

#### Modified Functions
- `extractActionItems` - Now writes to global collection
- `analyzePriorities` - Supports batch mode

### Client Services

#### New Services
- `dashboardService.js` - Global summary management
- `priorityService.js` - Priority scoring + AI integration
- `watermarkService.js` - Track last seen messages

#### Modified Services
- `aiService.js` - Add batch operations, watermark sync

---

## Open Questions & Decisions

### Confirmed Decisions
✅ Show cached summary instantly, update in background  
✅ Add "Decisions" filter to Action Items (no separate page)  
✅ Summary TTL: 15 minutes  
✅ Priority cache: 6 hours  
✅ Two-stage search (fast → accurate)  
✅ Boost unanswered questions in priority scoring  
✅ No manual chat pinning (full AI ordering)  
✅ One-tap actions in summary (Phase 4 polish)  
✅ "Why prioritized" tooltips (Phase 4 polish)  

### To Validate in Testing
- Is 15 min summary TTL too aggressive? (May need 30 min)
- Does two-stage search feel responsive enough?
- Are priority scores accurate enough without manual adjustment?
- Does delta processing work correctly with rapid message bursts?

---

**Document Version:** 1.0  
**Last Updated:** October 23, 2025  
**Status:** Ready for Implementation  
**Estimated Timeline:** 4 PRs, ~12-16 hours of focused work

