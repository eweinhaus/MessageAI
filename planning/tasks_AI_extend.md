# MessageAI Phase 2 Extension - Global AI Features (MIGRATION PLAN)

**Goal:** Adapt existing per-chat AI features to work globally with minimal code changes.

**Key Insight:** Most scaffolding is complete. Focus on **adapting, not rewriting**.

---

## What Already Exists ✅

### Cloud Functions (All Complete)
- ✅ `analyzePriorities.js` - Priority detection for one chat
- ✅ `summarizeThread.js` - Summarization for one chat  
- ✅ `extractActionItems.js` - Action item extraction for one chat
- ✅ `smartSearch.js` - Semantic search for one chat
- ✅ All utilities (`aiUtils`, `cacheUtils`, `rateLimiter`, `errors`, `langchainUtils`)
- ✅ All prompts (`priorityDetection`, `threadSummarization`, `actionItemExtraction`)

### UI Components (All Complete)
- ✅ `SummaryModal.js` - Full modal with all sections
- ✅ `ActionItemsList.js` - List with filtering/sorting/actions
- ✅ `ActionItemsModal.js` - Modal wrapper with cache support
- ✅ `AIInsightsPanel.js` - Bottom sheet with 5 feature buttons
- ✅ `TypeBadge.js`, `PriorityBadge.js` - Visual indicators
- ✅ `ErrorToast.js` - Error notifications

### Client Services (All Complete)
- ✅ `services/aiService.js` - All 5 AI feature client functions

---

## PR 20: Global Summary Migration (4-6 hours)

**Strategy:** Create wrapper function that calls existing `summarizeThread` for multiple chats, then merge results.

### Tasks

#### 1. Create watermark tracking service (NEW) ✓
- [x] Create `services/watermarkService.js` (~100 lines)
- [x] Export `getUserWatermarks(userId)` - fetch from `/users/{userId}/aiCache/watermarks`
- [x] Export `updateWatermarks(userId, watermarks)` - bulk update
- [x] Export `getUnreadChatsWithMessages(userId, watermarks)` - returns `{chatId: [messages]}`
- [x] This is the ONLY new service needed

#### 2. Create Cloud Function wrapper: summarizeUnread (ADAPT) ✓
- [x] Create `functions/summarizeUnread.js` (~150 lines)
- [x] **Reuse existing:** Import all logic from `summarizeThread.js`
- [x] New behavior:
  ```javascript
  exports.summarizeUnread = onCall(async (request) => {
    const userId = request.auth.uid;
    
    // 1. Get watermarks
    const watermarks = await getUserWatermarks(userId);
    
    // 2. Fetch unread messages per chat (delta)
    const unreadByChat = await getUnreadChatsWithMessages(userId, watermarks);
    
    if (Object.keys(unreadByChat).length === 0) {
      return { hasUnread: false };
    }
    
    // 3. FOR EACH CHAT: Call existing summarizeThread logic
    const chatSummaries = [];
    for (const [chatId, messages] of Object.entries(unreadByChat)) {
      // Reuse existing buildMessageContext, call OpenAI
      const summary = await generateSummaryForChat(chatId, messages);  // Extract from summarizeThread
      chatSummaries.push({ chatId, ...summary });
    }
    
    // 4. Merge all summaries into one
    const merged = mergeSummaries(chatSummaries);
    
    // 5. Update watermarks, cache, return
    await updateWatermarks(userId, newWatermarks);
    return { hasUnread: true, ...merged };
  });
  ```
- [x] Extract reusable logic from `summarizeThread.js` into helper functions
- [x] NO need to rewrite prompts or context building - reuse existing!

#### 3. Add trigger on app open (NEW) ✓
- [x] Modify `app/_layout.js`
- [x] Add AppState listener:
  ```javascript
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        await handleAppOpen();  // NEW function
      }
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, [appState]);
  
  const handleAppOpen = async () => {
    const result = await summarizeUnreadGlobal();  // NEW client function
    if (result.success && result.data.hasUnread) {
      setGlobalSummary(result.data);
      setShowGlobalSummaryModal(true);
    }
  };
  ```
- [x] ~50 lines added to root layout

#### 4. Adapt SummaryModal for global use (MINIMAL CHANGES) ✓
- [x] **Keep existing** `components/SummaryModal.js` - it already works!
- [x] Add ONE new prop: `isGlobal` (boolean)
- [x] If `isGlobal`, show chat names next to action items/decisions:
  ```javascript
  {summary.actionItems.map(item => (
    <View key={item.id}>
      <Text>{item.task}</Text>
      {isGlobal && <Text style={styles.chatBadge}>{item.chatName}</Text>}
    </View>
  ))}
  ```
- [x] ~20 lines changed, rest stays the same

#### 5. Add client function (NEW) ✓
- [x] In `services/aiService.js`, add ONE function:
  ```javascript
  export async function summarizeUnreadGlobal(forceRefresh = false) {
    const callable = httpsCallable(functions, 'summarizeUnread');
    const result = await callable({ forceRefresh });
    return { success: true, data: result.data };
  }
  ```
- [x] ~20 lines added

#### 6. Test ✓
- [x] Send messages across 3 chats, close app, reopen
- [x] Verify: Modal appears with merged summary
- [x] Verify: Delta processing works (doesn't re-process old messages)

### Summary of Changes
- **1 new service** (watermarkService.js ~100 lines)
- **1 new Cloud Function** (summarizeUnread.js ~150 lines, mostly reusing existing logic)
- **1 component modification** (SummaryModal.js +20 lines)
- **1 layout modification** (app/_layout.js +50 lines)
- **1 service function** (aiService.js +20 lines)
- **Total new code:** ~340 lines (rest is refactoring existing)

### Time Estimate: 4-6 hours

---

## PR 21: Priority Ordering Migration (4-5 hours)

**Strategy:** Add lightweight local scoring, use existing `analyzePriorities` in batch mode.

### Tasks

#### 1. Create priority scoring service (NEW) ✓
- [x] Create `services/priorityService.js` (~150 lines)
- [x] Export `calculateLocalScore(chat)` - instant lightweight scoring
- [x] Export `calculateFinalScore(localScore, aiSignals)` - combine with AI
- [x] Export `shouldRunAI(localScore, unreadCount)` - threshold check
- [x] No need to modify existing AI logic!

#### 2. Modify analyzePriorities to support batch (SMALL CHANGE) ✓
- [x] In `functions/analyzePriorities.js`:
- [x] Change signature to accept EITHER `chatId` OR `chats: [{chatId, messages}]`:
  ```javascript
  exports.analyzePriorities = onCall(async (request) => {
    const { chatId, chats, messageCount = 30 } = request.data;
    
    // Existing per-chat logic (keep as-is)
    if (chatId) {
      // ... existing code unchanged
    }
    
    // NEW batch logic (reuses existing prompt/context building)
    if (chats) {
      const results = [];
      for (const chat of chats) {
        const analysis = await analyzeChat(chat.chatId, chat.messages);  // Extract from existing
        results.push({ chatId: chat.chatId, ...analysis });
      }
      return { batchResults: results };
    }
  });
  ```
- [x] ~30 lines added to existing function, rest unchanged

#### 3. Add chat list sorting (MODIFY EXISTING) ✓
- [x] In `app/(tabs)/index.js` (home screen):
- [x] Add sorting logic before rendering:
  ```javascript
  const [sortedChats, setSortedChats] = useState([]);
  
  useEffect(() => {
    if (!chats.length) return;
    
    (async () => {
      // 1. Calculate local scores (instant)
      const withLocalScores = chats.map(chat => ({
        ...chat,
        localScore: calculateLocalScore(chat)
      }));
      
      // 2. Identify high-priority candidates
      const needsAI = withLocalScores.filter(c => shouldRunAI(c.localScore, c.unreadCount));
      
      // 3. Get AI signals (batch call, reuses existing function)
      if (needsAI.length > 0) {
        const aiResult = await analyzePriorities(null, {
          chats: needsAI.map(c => ({ chatId: c.chatID, messages: c.recentMessages }))
        });
        // Combine scores
      }
      
      // 4. Sort by final score
      const sorted = withScores.sort((a, b) => b.priorityScore - a.priorityScore);
      setSortedChats(sorted);
    })();
  }, [chats]);
  ```
- [x] ~80 lines added, existing rendering logic unchanged

#### 4. Add visual indicators (MODIFY EXISTING) ✓
- [x] In `components/ChatListItem.js`:
- [x] Add TWO new props: `isUrgent`, `isUnread`
- [x] Apply bold style if unread:
  ```javascript
  <Text style={[styles.chatName, isUnread && { fontWeight: 'bold' }]}>
  ```
- [x] Add red "!" badge if urgent:
  ```jsx
  {isUrgent && (
    <View style={styles.urgentBadge}>
      <Text style={styles.urgentIcon}>!</Text>
    </View>
  )}
  ```
- [x] ~30 lines added to existing component

#### 5. Add client function (SMALL ADDITION) ✓
- [x] In `services/aiService.js`, modify existing `analyzePriorities`:
  ```javascript
  export async function analyzePriorities(chatId, options = {}) {
    // Existing per-chat logic (keep)
    if (chatId) {
      // ... existing code
    }
    
    // NEW batch support
    if (options.chats) {
      const callable = httpsCallable(functions, 'analyzePriorities');
      const result = await callable({ chats: options.chats });
      return { success: true, data: result.data };
    }
  }
  ```
- [x] ~15 lines added to existing function

### Summary of Changes
- **1 new service** (priorityService.js ~150 lines)
- **1 Cloud Function modification** (analyzePriorities.js +30 lines)
- **1 screen modification** (app/(tabs)/index.js +80 lines)
- **1 component modification** (ChatListItem.js +30 lines)
- **1 service modification** (aiService.js +15 lines)
- **Total new code:** ~305 lines

### Time Estimate: 4-5 hours

---

## PR 22: Global Action Items & Search Tabs (6-8 hours)

**Strategy:** Reuse 100% of existing components, just change data source and add tabs.

### Tasks

#### 1. Update bottom navigation (SIMPLE) ✓
- [x] In `app/(tabs)/_layout.js`:
- [x] Add TWO new tab screens:
  ```jsx
  <Tabs.Screen name="action-items" options={{title: "Actions", ...}} />
  <Tabs.Screen name="search" options={{title: "Search", ...}} />
  ```
- [x] ~10 lines added

#### 2. Create action-items tab (REUSE EXISTING) ✓
- [x] Create `app/(tabs)/action-items.js` (~150 lines)
- [x] **Import and use existing `ActionItemsList` component - zero changes needed!**
  ```javascript
  export default function ActionItemsScreen() {
    const [items, setItems] = useState([]);
    
    useEffect(() => {
      // Query GLOBAL collection instead of per-chat
      const q = query(
        collection(db, 'actionItems'),  // NOT subcollection
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return unsubscribe;
    }, []);
    
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Action Items</Text>
        
        {/* REUSE EXISTING COMPONENT - NO CHANGES! */}
        <ActionItemsList
          actionItems={items}
          onViewMessage={jumpToMessage}
          onMarkComplete={updateStatus}
          onMarkPending={updateStatus}
        />
      </SafeAreaView>
    );
  }
  ```
- [x] Existing `ActionItemsList` already has filtering/sorting - reuse as-is!

#### 3. Modify extractActionItems to write globally (TINY CHANGE) ✓
- [x] In `functions/extractActionItems.js`:
- [x] Change Firestore write location from subcollection to global:
  ```javascript
  // OLD (per-chat): /chats/{chatId}/actionItems/{itemId}
  const ref = db.collection('chats').doc(chatId).collection('actionItems').doc();
  
  // NEW (global): /actionItems/{itemId} with userId field
  const ref = db.collection('actionItems').doc();
  await ref.set({
    ...item,
    userId,     // ADD THIS
    chatId,     // Keep for context
    chatName,   // ADD THIS
    // ... rest unchanged
  });
  ```
- [x] ~5 lines changed, rest stays the same
- [x] Existing prompt, logic, UI - all unchanged!

#### 4. Create search tab (NEW SCREEN, REUSE FUNCTION) ✓
- [x] Create `app/(tabs)/search.js` (~250 lines)
- [x] **Reuse existing `smartSearch` function from aiService.js - zero function changes!**
- [x] Just need UI wrapper:
  ```javascript
  export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    
    const handleSearch = async () => {
      // REUSE EXISTING smartSearch function - NO CHANGES!
      const result = await smartSearch(null, query, { global: true });
      if (result.success) setResults(result.data.results);
    };
    
    return (
      <SafeAreaView>
        <TextInput value={query} onChangeText={setQuery} />
        <TouchableOpacity onPress={handleSearch}>Search</TouchableOpacity>
        
        <FlatList
          data={results}
          renderItem={({item}) => (
            <SearchResultCard result={item} onPress={() => jumpToMessage(item)} />
          )}
        />
      </SafeAreaView>
    );
  }
  ```

#### 5. Modify smartSearch to support global (TINY CHANGE) ✓
- [x] In `functions/smartSearch.js`:
- [x] Add support for `global: true` option:
  ```javascript
  exports.smartSearch = onCall(async (request) => {
    const { chatId, query, global } = request.data;
    
    // Existing per-chat logic (keep)
    if (chatId) {
      // ... existing code unchanged
    }
    
    // NEW global logic (reuses existing prompt/parsing)
    if (global) {
      // Fetch messages across all user's chats
      const messages = await fetchAllUserMessages(userId, 500);
      // ... rest reuses existing search logic
    }
  });
  ```
- [x] ~30 lines added, existing logic unchanged

#### 6. Create SearchResultCard component (NEW, SIMPLE) ✓
- [x] Create `components/SearchResultCard.js` (~80 lines)
- [x] Simple card layout - no complex logic needed

### Summary of Changes
- **1 navigation modification** (app/(tabs)/_layout.js +10 lines)
- **1 new screen** (action-items.js ~150 lines, but REUSES existing ActionItemsList 100%)
- **1 new screen** (search.js ~250 lines)
- **1 new component** (SearchResultCard.js ~80 lines)
- **2 Cloud Function tiny changes** (extractActionItems.js +5 lines, smartSearch.js +30 lines)
- **Total new code:** ~525 lines (mostly UI wrappers for existing components)

### Time Estimate: 6-8 hours

---

## PR 23: Polish & Optimization (3-4 hours)

**Strategy:** Enhance existing components with small additions.

### Tasks

#### 1. Add one-tap actions to SummaryModal (ENHANCE) ✓
- [x] In existing `components/SummaryModal.js`:
- [x] Add quick action buttons to action items:
  ```jsx
  <View style={styles.quickActions}>
    <TouchableOpacity onPress={() => markComplete(item.id)}>
      <Text>✓ Done</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => jumpToChat(item.chatId)}>
      <Text>→ View</Text>
    </TouchableOpacity>
  </View>
  ```
- [x] ~30 lines added to existing component

#### 2. Add priority tooltip to ChatListItem (ENHANCE) ✓
- [x] In existing `components/ChatListItem.js`:
- [x] Add long-press handler that shows modal:
  ```jsx
  <TouchableOpacity onLongPress={() => setShowTooltip(true)}>
    {/* existing content */}
  </TouchableOpacity>
  
  <Modal visible={showTooltip} transparent>
    <View style={styles.tooltip}>
      <Text>Priority Score: {priorityScore}/100</Text>
      <Text>• {signals.hasUnansweredQuestion && "Unanswered question"}</Text>
      {/* ... more signals */}
    </View>
  </Modal>
  ```
- [x] ~50 lines added to existing component

#### 3. Performance optimization (REVIEW) ✓
- [x] Add `useMemo` to expensive calculations
- [x] Add `React.memo` to list items
- [x] ~20 lines of memoization wrappers

#### 4. Testing ✓
- [x] Test all features end-to-end
- [x] Profile performance
- [x] Check memory usage

### Summary of Changes
- **2 component enhancements** (SummaryModal +30 lines, ChatListItem +50 lines)
- **Performance wrappers** (+20 lines)
- **Total new code:** ~100 lines

### Time Estimate: 3-4 hours

---

## Total Implementation Summary

### Code Changes Summary
- **New files:** 5 (~830 lines total)
  - watermarkService.js (~100)
  - priorityService.js (~150)
  - summarizeUnread.js (~150)
  - action-items.js (~150)
  - search.js (~250)
  - SearchResultCard.js (~80)

- **Modified files:** 6 (~280 lines added)
  - analyzePriorities.js (+30)
  - extractActionItems.js (+5)
  - smartSearch.js (+30)
  - SummaryModal.js (+50)
  - ChatListItem.js (+80)
  - app/(tabs)/index.js (+80)
  - aiService.js (+35)
  - app/_layout.js (+50)

- **Reused unchanged:** 12+ files
  - All existing Cloud Functions (core logic)
  - ActionItemsList, ActionItemsModal, TypeBadge, PriorityBadge
  - All utilities (caching, rate limiting, errors)
  - All prompts
  - All existing client services

### Total New/Modified Code: ~1,110 lines (vs. ~10,000+ if building from scratch)

### Time Estimate
- PR20: 4-6 hours (watermarks + global summary wrapper)
- PR21: 4-5 hours (priority scoring + chat sorting)
- PR22: 6-8 hours (tabs + screens using existing components)
- PR23: 3-4 hours (polish)
- **Total: 17-23 hours** (was 28-36 in original plan)

### Key Principle: **Adapt, Don't Rebuild**
Every task focuses on:
1. ✅ **Reusing** existing Cloud Functions (just add batch/global support)
2. ✅ **Reusing** existing UI components (minimal prop changes)
3. ✅ **Reusing** existing services (add wrapper functions)
4. ✅ **Reusing** existing infrastructure (caching, rate limiting, etc.)

---

**Document Version:** 2.0 (Migration-Focused)  
**Last Updated:** October 23, 2025  
**Status:** Ready for Efficient Implementation  
**Note:** This plan maximizes code reuse and minimizes new development

