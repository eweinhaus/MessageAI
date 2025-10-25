# System Patterns & Architecture

## High-Level Architecture

### Three-Layer System
```
┌─────────────────────────────────────────┐
│   Client Layer (React Native + Expo)   │
│  • UI Components                        │
│  • Zustand State Management             │
│  • SQLite Local Database                │
│  • Real-Time Listeners                  │
└─────────────────────────────────────────┘
              ↕ (Firebase SDK)
┌─────────────────────────────────────────┐
│    Cloud Layer (Firebase)               │
│  • Firestore (source of truth)          │
│  • Authentication                       │
│  • Cloud Functions (push notifications) │
│  • Cloud Messaging (FCM)                │
└─────────────────────────────────────────┘
```

## Major Architectural Evolution

### Global AI Architecture Shift (October 23, 2025)

**Major Pivot**: From per-chat AI features to global, proactive intelligence across all conversations.

**Rationale**:
- Better aligned with "Remote Team Professional" persona needs
- Demonstrates system-level thinking and product maturity
- More impressive technically (cross-chat analysis, priority scoring, delta processing)
- Meets rubric requirements with integrated approach

**New Architecture**:
1. **Global Summary on App Open** - Auto-popup summarizing ALL unread messages
2. **AI Priority Chat Ordering** - Chat list sorted by importance, not recency
3. **Global Action Items Tab** - New bottom tab for all commitments across chats
4. **Global Smart Search Tab** - Two-stage semantic search across all messages
5. **Background Priority Detection** - Real-time urgency analysis as messages arrive

**Technical Innovations**:
- **Delta processing**: Only analyze new messages since last watermark
- **Hybrid priority scoring**: Lightweight local score + selective AI analysis
- **Two-stage search**: Fast initial results, then refined accuracy
- **Progressive loading**: Show cached instantly, refresh in background
- **Cost optimization**: Aggressive caching (15min summary, 6hr priorities)

**Removed Features** (replaced with global approach):
- ❌ Per-chat AI Insights Panel → Global summary modal
- ❌ Separate Decision Tracking page → Action Items filter
- ❌ Individual chat prioritization → Global priority scoring

## Core Design Patterns
### 0. Watermark-Based Delta Processing (New in PR20)

**Pattern**: Per-user watermarks track last processed message per chat → only analyze new messages → merge results globally.

**Implementation**:
- Watermarks stored at `/users/{userId}/aiCache/watermarks` as `{ [chatId]: lastMillis }` with `updatedAt`
- On foreground/background, callable `summarizeUnread`:
  1) Read watermarks (returns empty if first run)
  2) Query `timestamp > watermark` per chat (limit 50 per chat)
  3) Use thread summarization on delta messages only
  4) Merge into single summary with chat badges
  5) Update watermarks to latest message timestamp
  6) Cache under user scope with type `summaryGlobal` (15min TTL)

**Client UX**:
- Root layout listens to AppState; throttled (60s) check to avoid spam
- Shows `SummaryModal` with `isGlobal=true` and chat badges

**Cost Controls**:
- Only processes unread messages (watermark-based)
- 50 message limit per chat prevents token overflow
- 15min cache TTL reduces redundant calls
- Batch queries across multiple chats
- Rate limit: 5 operations/hour per user

**Benefits**:
- ✅ **Incremental processing**: Only new messages analyzed
- ✅ **Cost effective**: No redundant API calls
- ✅ **Real-time awareness**: Always current with latest messages
- ✅ **Cross-chat intelligence**: Global view of all conversations

### 1. Hybrid Priority Scoring (New in PR21)

**Pattern**: Local priority calculation (instant) + selective AI analysis → combined scoring for intelligent chat ordering.

**Implementation**:
- **Local Scoring** (instant, no API calls):
  - Unread count: 30% weight (capped at 10+ messages)
  - Recency: 20% weight (decays over 24 hours)
  - Response priority: 15% weight (boost if someone else sent last message)
  - Question bonus: 0.5 boost if unanswered question from someone else
  - Score range: -0.2 to 1.0

- **AI Analysis** (selective, cached):
  - Only runs for high-priority candidates (localScore > 0.5 OR unreadCount > 5)
  - Analyzes ALL unanalyzed messages (up to 1000 total) for urgency signals
  - Cached 6 hours with forceRefresh option
  - Rate limited: 200 operations/hour per user

- **Combined Scoring**:
  - Base: Local score (instant)
  - Boost: +0.4 for any urgent messages, +0.2 for multiple urgent
  - Final range: -0.2 to 2.0 (capped)

**Client Integration**:
- `priorityService.js` provides `calculateCombinedScore()` and `sortChatsByPriority()`
- Chat list automatically reorders based on priority scores
- Urgent chats show red badges and surface to top
- Automatic recalculation on app open and new messages (30s throttle)

**Cost Optimization**:
- Only 20-30% of chats analyzed by AI (selective approach)
- 6-hour cache reduces redundant API calls
- Local scoring provides 70% of priority value instantly
- Batch analysis for multiple chats reduces round trips

**Benefits**:
- ✅ **Instant responsiveness**: Local scoring provides immediate priority
- ✅ **Intelligent ordering**: AI detects subtle urgency signals (questions, deadlines, decisions)
- ✅ **Cost effective**: Selective AI analysis saves 70% of API calls
- ✅ **Always current**: Automatic recalculation on new messages
- ✅ **User-centric**: Prioritizes conversations needing response


### 2. Offline-First Architecture

**Pattern**: Local-first with cloud sync

**Implementation**:
- SQLite stores all messages and chat metadata locally
- Firestore is the authoritative source of truth
- On conflict, Firestore always wins
- App reads from SQLite for instant UI
- Background sync keeps data consistent

**Benefits**:
- Instant UI responsiveness
- Works completely offline
- Survives app crashes
- Reduces Firestore reads (cost optimization)

### 3. Optimistic UI Updates

**Pattern**: Update UI immediately, sync later

**Flow**:
```
User Action (send message)
  ↓
Generate local messageID (UUID)
  ↓
Write to SQLite (syncStatus: 'pending')
  ↓
Update Zustand state → UI shows message instantly
  ↓
Async: Write to Firestore
  ↓
On success: Update SQLite (syncStatus: 'synced')
  ↓
Update Zustand state → UI shows confirmation
  ↓
On failure: Update SQLite (syncStatus: 'failed')
  ↓
Update Zustand state → UI shows retry option
```

**Benefits**:
- Instant feedback for users
- No waiting for server confirmation
- Clear visual states (sending → sent → delivered → read)
- Graceful error handling

### 4. Real-Time Sync with Listeners

**Pattern**: Firestore listeners for live updates

**Setup**:
```javascript
// Chat list listener
onSnapshot(
  query(
    collection(db, 'chats'),
    where('participantIDs', 'array-contains', currentUserID)
  ),
  (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      // Write to SQLite
      // Update Zustand state
      // UI re-renders automatically
    });
  }
);

// Message listener per chat
onSnapshot(
  query(
    collection(db, `chats/${chatID}/messages`),
    orderBy('timestamp', 'asc')
  ),
  (snapshot) => {
    // Handle new messages
    // Update local database
    // Trigger UI updates
  }
);
```

**Listener Lifecycle**:
- Establish on component mount
- Cleanup on unmount to prevent leaks
- Automatically reconnect on network recovery
- Handle errors gracefully

### 5. Message Queue & Retry Logic

**Pattern**: Exponential backoff with max retries

**Queue Processing**:
```javascript
async function processPendingMessages() {
  const pending = await db.getPendingMessages();
  
  for (const message of pending) {
    if (message.retryCount >= 5) {
      await db.updateMessageSyncStatus(
        message.messageID,
        'failed',
        message.retryCount
      );
      continue;
    }
    
    const delay = Math.min(
      Math.pow(2, message.retryCount) * 1000,
      30000
    ); // 1s, 2s, 4s, 8s, 16s, max 30s
    
    await sleep(delay);
    
    try {
      await sendToFirestore(message);
      await db.updateMessageSyncStatus(
        message.messageID,
        'synced',
        message.retryCount
      );
    } catch (error) {
      await db.updateMessageSyncStatus(
        message.messageID,
        'pending',
        message.retryCount + 1
      );
    }
  }
}
```

**Triggers**:
- Network comes online (NetInfo listener)
- App returns to foreground
- Manual retry from failed message UI

### 6. Push Notifications (Dual Token Support)

**Pattern**: Cloud Function with automatic token type detection

**Implementation** (October 21, 2025):
```javascript
// Detect token type and route to appropriate service
async function sendPushNotification(token, notification, data) {
  const isExpoToken = token.startsWith("ExponentPushToken[");
  
  if (isExpoToken) {
    // Send via Expo Push Service (for Expo Go)
    return sendExpoNotification(token, notification, data);
  } else {
    // Send via Firebase Cloud Messaging (for standalone builds)
    return sendFCMNotification(token, notification, data);
  }
}

// Expo Push Service (exp.host API)
function sendExpoNotification(expoPushToken, notification, data) {
  const message = {
    to: expoPushToken,
    sound: "default",
    title: notification.title,
    body: notification.body,
    data: data,
    priority: "high",
    channelId: "messages",
  };
  
  // POST to https://exp.host/--/api/v2/push/send
  // Returns {data: {status: 'ok'}} on success
}

// Firebase Cloud Messaging
async function sendFCMNotification(fcmToken, notification, data) {
  const payload = {
    notification: { title, body },
    data: stringifiedData, // All values must be strings
    token: fcmToken,
    android: { priority: "high", notification: { channelId: "messages" } },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  };
  
  return admin.messaging().send(payload);
}
```

**Token Management**:
```javascript
// Client: Register token on app startup
async function registerToken(userID) {
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: '12be9046-fac8-441c-aa03-f047cfed9f72',
  });
  
  await updateUserProfile(userID, { fcmToken: token.data });
}

// Cloud Function: Triggered on message creation
exports.onMessageCreated = onDocumentCreated(
  "chats/{chatID}/messages/{messageID}",
  async (event) => {
    // Get recipient tokens from Firestore
    // Detect token type
    // Send via appropriate service
    // Handle invalid tokens (remove from Firestore)
  }
);
```

**Notification Flow**:
```
[User A sends message]
        ↓
[Firestore: /chats/{chatID}/messages/{messageID} created]
        ↓
[Cloud Function triggered]
        ↓
[Get recipient FCM tokens from Firestore]
        ↓
[For each token: Detect type (Expo vs FCM)]
        ↓
    ┌───────┴───────┐
    ↓               ↓
[Expo Token]   [FCM Token]
    ↓               ↓
[exp.host API] [FCM API]
    ↓               ↓
[Device receives push]
        ↓
[App in foreground → Show banner]
[App in background → Show system notification]
        ↓
[User taps → Navigate to chat]
```

**Client-Side Listeners**:
```javascript
// Notification received listener (handles both foreground and background)
Notifications.addNotificationReceivedListener((notification) => {
  const {title, body, data} = notification.request.content;
  
  // Show in-app banner
  showBanner({
    title,
    body,
    onPress: () => router.push(`/chat/${data.chatID}`),
  });
});

// Tap notification listener
Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  router.push(`/chat/${data.chatID}`);
});
```

**Key Features**:
- ✅ **Dual Support**: Works with both Expo Go (Expo tokens) and standalone builds (FCM tokens)
- ✅ **Automatic Detection**: Token type detected by prefix check
- ✅ **Graceful Fallback**: Invalid tokens removed from Firestore
- ✅ **Duplicate Prevention**: Client tracks displayed notifications (Set with 60s TTL)
- ✅ **In-App Banner**: Slide-in animation, auto-dismiss after 3s
- ✅ **Tap-to-Navigate**: Opens specific chat when tapped
- ✅ **Group Support**: Sends to all members except sender

**Why Dual Support?**:
- Expo Go uses Expo Push Service (can't use native FCM)
- Standalone builds can use either (FCM is production-standard)
- Automatic detection makes transition seamless
- Same Cloud Function works for both environments

### 7. Presence Tracking

**Pattern**: Firestore with heartbeat + staleness detection

**Implementation** (Updated October 21, 2025):
```javascript
// Initialize presence with heartbeat
function initializePresence(userID) {
  // Set user online immediately
  setUserOnline(userID);
  
  // Set up heartbeat to keep presence fresh (every 25 seconds)
  heartbeatInterval = setInterval(() => {
    setUserOnline(userID);
  }, 25000);
}

// Check if presence is stale (> 45 seconds old)
function isPresenceStale(lastSeenTimestamp) {
  if (!lastSeenTimestamp) return true;
  const timeSinceUpdate = Date.now() - lastSeenTimestamp;
  return timeSinceUpdate > 45000; // 45 seconds
}

// Subscribe with automatic staleness detection
function subscribeToPresence(userID, callback) {
  return onSnapshot(userRef, (docSnap) => {
    let isOnline = data.isOnline || false;
    const lastSeenTimestamp = data.lastSeenTimestamp?.toMillis() || null;
    
    // If marked online but presence is stale, treat as offline
    if (isOnline && isPresenceStale(lastSeenTimestamp)) {
      isOnline = false;
    }
    
    callback(isOnline, lastSeenTimestamp);
  });
}
```

**Presence States**:
- `isOnline: true` - App in foreground, heartbeat active
- `isOnline: false` - App backgrounded or explicitly set offline
- `lastSeenTimestamp` - Last heartbeat time, updated every 25-30 seconds
- **Stale detection**: If `isOnline: true` but no update in 45s → treat as offline

**Key Improvements** (October 21, 2025):
- ✅ **Heartbeat system**: Keeps presence fresh every 25 seconds
- ✅ **Staleness detection**: Auto-detects force-quit apps (45s timeout)
- ✅ **Throttling**: Max 1 write per 30 seconds to minimize costs
- ✅ **UI consistency**: All components prioritize `isOnline` flag over timestamp

**Why not Firebase Realtime Database?**
- Firestore-only solution is simpler (no additional service)
- Heartbeat + staleness achieves similar results
- Can add RTDB later if needed

**Updated Timing** (October 22, 2025):
- Heartbeat: Every 8 seconds (was 25s) - 3x faster
- Throttle: Max 1 write per 10 seconds (was 30s)
- Staleness: 20 seconds timeout (was 45s)
- Result: 3x faster updates, 3x more Firestore writes
- Trade-off: Better UX at cost of higher Firestore usage

### 8. Typing Indicators

**Pattern**: Ephemeral real-time status updates via Firestore subcollection

**Implementation** (October 22, 2025):
```javascript
// Firestore structure (ephemeral, no SQLite persistence)
/chats/{chatId}/typing/{userId}
  - isTyping: boolean
  - timestamp: serverTimestamp()
  - displayName: string

// Throttling to prevent spam
TYPING_THROTTLE = 1000ms   // Max 1 update per second
TYPING_TIMEOUT = 3000ms    // Consider stale after 3 seconds

// Client-side management
- useTyping hook manages subscription and auto-cleanup
- Triggers on text input change
- Auto-clears after 3 seconds of inactivity
- Clears on message send
- Clears on component unmount
```

**Display Logic** (Priority order in ChatHeader):
1. **Typing indicators** (highest priority)
   - 1 user: "John is typing..."
   - 2 users: "John and Sarah are typing..."
   - 3+ users: "3 people are typing..."
2. **Member count** (for groups, when no typing)
   - "5 members"
3. **Last seen status** (for 1:1, when no typing)
   - "Online" / "Last seen 5m ago"

**Key Features**:
- ✅ Real-time typing indicators in chat headers
- ✅ Throttled updates (1 write/second per user)
- ✅ Auto-cleanup after 3 seconds of inactivity
- ✅ Multiple users typing supported
- ✅ Works in 1:1 and group chats
- ✅ No SQLite persistence (ephemeral data only)
- ✅ Excludes current user from typing list
- ✅ Stale indicator detection and cleanup

**Firestore Cost**:
- ~1 write per second per actively typing user
- ~100-500 writes per active chat session per user
- Minimal cost for MVP scale (< $0.50 per 1000 active users)

**Why ephemeral subcollection?**
- Typing is transient - doesn't need persistence
- Subcollection allows multiple users typing simultaneously
- Document per user prevents write conflicts
- Automatic cleanup via timestamp staleness detection
- No impact on main chat/message documents

### 9. Two-Stage Semantic Search (New in PR22)

**Pattern**: Fast initial search (10 messages per chat) → deep refinement (100 messages per chat) → merged results with relevance scoring.

**Implementation**:
- **Stage 1 (Fast)**: Query 10 messages per chat across 50 chats maximum
  - Uses semantic similarity for initial filtering
  - Returns results within 1-2 seconds
  - Shows immediate feedback to user

- **Stage 2 (Deep)**: Automatically runs after Stage 1 completes
  - Analyzes 100 messages per relevant chat (top 10 from Stage 1)
  - More comprehensive context for better relevance scoring
  - Takes 3-5 seconds but runs in background

- **Client UX**:
  - Search input triggers both stages automatically
  - Shows "Refining results..." indicator during Stage 2
  - Displays results with relevance badges (90%+ = green, 70%+ = orange, <70% = gray)
  - Each result shows chat name, message text, sender, timestamp, and AI reasoning

**Search Features**:
- **Semantic understanding**: Finds messages by meaning, not just keywords
- **Cross-chat search**: Searches all user's chats simultaneously via collection group queries
- **Relevance scoring**: AI determines how well each result matches query intent
- **Context preservation**: Shows which chat and when message was sent
- **Navigation**: Tap result to jump directly to message in chat with highlight

**Cost Controls**:
- Stage 1: 10 messages/chat × 50 chats = 500 messages max
- Stage 2: 100 messages/chat × 10 relevant chats = 1,000 messages max
- Rate limit: 400 searches/hour per user
- 6-hour cache for similar queries

**Benefits**:
- ✅ **Fast initial results**: User sees relevant messages within 1-2 seconds
- ✅ **High accuracy**: Deep analysis ensures quality matches and relevance scoring
- ✅ **Cross-conversation discovery**: Find related messages across different chats
- ✅ **Context-aware**: Understands conversational context and user intent
- ✅ **Progressive enhancement**: Fast feedback with background refinement

## Data Flow Patterns

### Send Message Flow
```
[User Types] → [Tap Send Button]
              ↓
[Generate messageID] → [Create message object]
              ↓
[Write SQLite] → [Update Zustand] → [UI shows message]
    (pending)
              ↓
         [Network Check]
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
[Online]            [Offline]
    ↓                   ↓
[Write Firestore]   [Queue for later]
    ↓                   ↓
[Update SQLite]     [Show offline banner]
  (synced)              ↓
    ↓            [Wait for network]
[Update UI]             ↓
 (sent ✓)        [Auto-process queue]
    ↓                   ↓
[Listener fires]   [Write Firestore]
    ↓                   ↓
[Recipient receives] [Update SQLite]
    ↓                   ↓
[Update delivered]  [Update UI]
    ↓
[Recipient views]
    ↓
[Update readBy]
    ↓
[Sender sees read receipt]
```

### Receive Message Flow
```
[Message written to Firestore]
              ↓
[onSnapshot listener fires]
              ↓
[Parse message data]
              ↓
[Write to local SQLite]
              ↓
[Update Zustand state]
              ↓
[UI re-renders with new message]
              ↓
[Cloud Function triggers]
              ↓
[Send FCM notification]
              ↓
[Device receives push]
              ↓
[Show system notification (background) or in-app toast (foreground)]
              ↓
[User views message]
              ↓
[Mark as read in Firestore]
              ↓
[Sender's listener fires]
              ↓
[Update read receipt UI]
```

## Component Architecture

### Directory Structure
```
app/                    # Expo Router screens
  (auth)/              # Auth stack (login, signup)
  (tabs)/              # Main app tabs (home)
  chat/                # Chat detail screens
  contacts/            # Contact picker
  _layout.js           # Root layout

components/            # Reusable UI components
  Avatar.js
  MessageBubble.js
  MessageList.js
  MessageInput.js
  ChatListItem.js
  OfflineBanner.js
  NotificationBanner.js

services/              # Business logic layer
  auth.js              # Authentication
  firestore.js         # Firestore operations
  messageService.js    # Message send/receive
  presenceService.js   # Online/offline tracking
  notificationService.js # Push notifications

db/                    # Local database layer
  database.js          # SQLite initialization
  messageDb.js         # Message CRUD operations

store/                 # State management (Zustand)
  userStore.js         # Current user state
  chatStore.js         # Chat list state
  messageStore.js      # Messages by chat

utils/                 # Helper functions
  avatarUtils.js       # Initial generation, colors
  networkStatus.js     # Network detection
  offlineQueue.js      # Queue processor
  syncManager.js       # Sync logic

config/
  firebaseConfig.js    # Firebase initialization
```

### Component Communication Pattern

**Zustand for State Management**:
```javascript
// Define store
const useMessageStore = create((set, get) => ({
  messagesByChat: {},
  addMessage: (chatID, message) => {
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatID]: [...(state.messagesByChat[chatID] || []), message]
      }
    }));
  }
}));

// Use in components
function MessageList({ chatID }) {
  const messages = useMessageStore(
    (state) => state.messagesByChat[chatID] || []
  );
  
  return messages.map((msg) => <MessageBubble key={msg.messageID} message={msg} />);
}
```

## Data Models

### User
```javascript
{
  userID: string,           // Firebase Auth UID
  email: string,
  displayName: string,
  isOnline: boolean,
  lastSeenTimestamp: timestamp,
  fcmToken: string,         // For push notifications
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Chat (1:1)
```javascript
{
  chatID: string,           // Composite: sorted userIDs joined
  type: '1:1',
  participantIDs: [string, string],
  participantNames: [string, string],
  lastMessageText: string,
  lastMessageTimestamp: timestamp,
  lastMessageSenderID: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Chat (Group)
```javascript
{
  chatID: string,           // UUID
  type: 'group',
  groupName: string,
  memberIDs: [string],      // 3+ members
  memberNames: [string],
  createdBy: string,
  lastMessageText: string,
  lastMessageTimestamp: timestamp,
  lastMessageSenderID: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Message (Firestore)
```javascript
{
  messageID: string,        // UUID
  chatID: string,
  senderID: string,
  senderName: string,       // Denormalized for easy display
  text: string,
  timestamp: timestamp,
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'read',
  readBy: [userID],
  createdAt: timestamp
}
```

### Message (SQLite)
```javascript
{
  messageID: string,        // Primary key
  chatID: string,           // Indexed
  senderID: string,
  senderName: string,
  text: string,
  timestamp: number,        // Indexed
  deliveryStatus: string,
  readBy: string,           // JSON stringified array
  syncStatus: 'synced' | 'pending' | 'syncing' | 'failed',
  retryCount: number,
  lastSyncAttempt: number,
  createdAt: number
}
```

## Key Technical Decisions

### Why SQLite + Firestore?
- **SQLite**: Fast local reads, works offline, survives app restart
- **Firestore**: Authoritative source, real-time sync, cross-device persistence
- **Together**: Best of both worlds - instant UI + reliable sync

### Why Zustand?
- Lightweight (1kb)
- No boilerplate
- Works great with React hooks
- Easy to debug
- No provider wrapper needed

### Why Expo Router?
- File-based routing (intuitive)
- Deep linking built-in
- Type-safe navigation
- Web support (future expansion)

### Why Cloud Functions for Notifications?
- Keep FCM tokens secure (not in client)
- Server-side logic for notification rules
- Can check user online status before sending
- Scales automatically

### Why Initial-Based Avatars (MVP)?
- Zero backend complexity
- Instant generation
- Consistent colors per user
- Good enough for MVP
- Profile pictures in Phase 2

## Anti-Patterns to Avoid

### ❌ Don't: Store pending messages only in memory
**Why**: Lost on app crash
**Do**: Always write to SQLite first

### ❌ Don't: Wait for Firestore confirmation to show message
**Why**: Feels slow, bad UX
**Do**: Show optimistically, update state on confirmation

### ❌ Don't: Poll for new messages
**Why**: Drains battery, wastes network
**Do**: Use Firestore real-time listeners

### ❌ Don't: Keep all listeners active always
**Why**: Memory leaks, wasted resources
**Do**: Subscribe on mount, unsubscribe on unmount

### ❌ Don't: Sync full chat history every time
**Why**: Slow, expensive
**Do**: Load from SQLite first, sync incrementally

### ❌ Don't: Update presence on every network packet
**Why**: Spam Firestore writes, costs money
**Do**: Throttle to max 1 update per 30 seconds

### ❌ Don't: Update local state before Firestore write completes (CRITICAL)
**Why**: Creates race condition - if Firestore write fails, local state becomes inconsistent
**Do**: Update local state ONLY after successful Firestore write
**How**:
```javascript
// ❌ WRONG - Race condition
if (message.deliveryStatus === 'sent') {
  normalized.deliveryStatus = 'delivered';  // Local first
  await updateDoc(messageRef, { deliveryStatus: 'delivered' });  // Then Firestore
}

// ✅ CORRECT - Atomic operation
if (message.deliveryStatus === 'sent') {
  await updateDoc(messageRef, { deliveryStatus: 'delivered' });  // Firestore first
  normalized.deliveryStatus = 'delivered';  // Then local (only on success)
}
```
**Pattern**: Firestore writes should complete successfully before updating local state
**Impact**: Guarantees state consistency across devices and prevents duplicate updates
**Context**: Fixed in delivery status tracking (October 24, 2025)

### ❌ Don't: Use colors without importing them (CRITICAL)
**Why**: Causes `ReferenceError: Property 'colors' doesn't exist` at runtime
**Do**: Always add `import colors from '../constants/colors'` when using color constants
**How**: 
- Use default import: `import colors from '../constants/colors'`
- Use lowercase properties: `colors.primary`, `colors.text`, `colors.background`
- See `.cursor/rules/color-imports.mdc` for complete reference
**Context**: This is a recurring issue that has been fixed multiple times (October 22, 2025)

### ❌ Don't: Initialize Firebase services without app instance (CRITICAL)
**Why**: Causes authentication errors - `context.auth` is undefined in Cloud Functions
**Do**: Always pass the Firebase app instance when initializing services
**How**:
```javascript
// ❌ WRONG - Creates disconnected instance
const functions = getFunctions();

// ✅ CORRECT - Connected to app, shares auth state
import app from '../config/firebaseConfig';
const functions = getFunctions(app);
```
**Pattern**: Initialize once at module level, reuse everywhere
**Services affected**: `getFunctions`, `getAuth`, `getFirestore`, `getStorage`
**Context**: Fixed in PR18 after "User must be authenticated" errors (October 22, 2025)

### ❌ Don't: Omit flex: 1 on Modal content containers (CRITICAL)
**Why**: ScrollView content becomes invisible - parent container doesn't define available space
**Do**: Always add `flex: 1` to the parent View containing a ScrollView in Modals
**How**:
```javascript
// ❌ WRONG - ScrollView content invisible
<Modal visible={visible}>
  <View style={styles.modalContainer}>
    <View style={styles.modalContent}>  {/* Missing flex: 1 */}
      <View style={styles.header}>...</View>
      <ScrollView>...</ScrollView>  {/* Won't render properly */}
      <View style={styles.actions}>...</View>
    </View>
  </View>
</Modal>

// ✅ CORRECT - ScrollView calculates layout properly
<Modal visible={visible}>
  <View style={styles.modalContainer}>
    <View style={{...styles.modalContent, flex: 1}}>  {/* flex: 1 added */}
      <View style={styles.header}>...</View>
      <ScrollView style={{flex: 1}}>...</ScrollView>
      <View style={styles.actions}>...</View>
    </View>
  </View>
</Modal>
```
**Pattern**: Modal layout hierarchy requires explicit flex values
**Symptoms**: Modal renders header and footer buttons, but content area is empty
**Context**: Fixed in PR18 SummaryModal - content was present but not visible (October 23, 2025)
**Related**: Apply same pattern to any bottom sheet or full-screen modal with scrollable content

### ❌ Don't: Pass boolean to functions with object destructuring parameters (CRITICAL)
**Why**: Causes TypeError - cannot destructure properties from boolean
**Do**: Always pass object with named parameters when function signature uses destructuring
**How**:
```javascript
// ❌ WRONG - TypeError: cannot destructure from boolean
export async function summarizeUnreadGlobal({forceRefresh = false, mode = "auto"} = {}) { ... }
const result = await summarizeUnreadGlobal(false);  // WRONG!

// ✅ CORRECT - Pass object with named parameters
const result = await summarizeUnreadGlobal({ forceRefresh: false });
const result = await summarizeUnreadGlobal({ forceRefresh: true, mode: "rich" });
const result = await summarizeUnreadGlobal();  // OK - uses defaults
```
**Pattern**: Check function signature for destructured parameters `{param1, param2}`
**Impact**: Runtime crash on function call
**Context**: Fixed in app lifecycle global summary calls (October 24, 2025)

### ❌ Don't: Forget to cleanup timers in React components (HIGH-IMPACT)
**Why**: Causes setState-on-unmounted-component warnings and potential memory leaks
**Do**: Always store timer refs and clear them in useEffect cleanup
**How**:
```javascript
// ❌ WRONG - Timer not cleaned up
const [highlighted, setHighlighted] = useState(false);
const highlight = () => {
  setHighlighted(true);
  setTimeout(() => setHighlighted(false), 2000);  // Leaks if unmounted
};

// ✅ CORRECT - Timer tracked and cleaned up
const timeoutRef = useRef(null);
const [highlighted, setHighlighted] = useState(false);

const highlight = () => {
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  setHighlighted(true);
  timeoutRef.current = setTimeout(() => {
    setHighlighted(false);
    timeoutRef.current = null;
  }, 2000);
};

useEffect(() => () => {
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
}, []);
```
**Pattern**: Store timer ID in ref, clear on new timer and unmount
**Impact**: Prevents React warnings and memory leaks
**Context**: Fixed in MessageList highlight animation (October 24, 2025)

### ❌ Don't: Override animated background colors directly (VISUAL REGRESSION)
**Why**: Replaces underlying color (urgent red, own blue) during animation
**Do**: Use absolutely-positioned overlay with animated opacity
**How**:
```javascript
// ❌ WRONG - Replaces bubble color
<Animated.View style={[
  styles.bubble,
  { backgroundColor: isHighlighted ? highlightColor : bubbleColor }
]}>

// ✅ CORRECT - Overlay preserves underlying color
<View style={[styles.bubble, styles.bubbleColor]}>
  {isHighlighted && (
    <Animated.View pointerEvents="none" style={[
      StyleSheet.absoluteFill,
      { backgroundColor: highlightColor, borderRadius: 18 }
    ]} />
  )}
  <Text>...</Text>
</View>
```
**Pattern**: Use overlay for temporary visual effects, preserve base styles
**Impact**: Urgent messages stay red during highlight, better UX
**Context**: Fixed in MessageBubble highlight animation (October 24, 2025)

## UI Responsiveness & Screen Compatibility

### SafeAreaView Implementation

**Critical Pattern**: All screens MUST use SafeAreaView to respect device safe areas (notches, status bars, home indicators).

#### When SafeAreaView is Required:
1. **Login/Auth screens** - No navigation header
2. **Modal screens** - Custom full-screen modals
3. **Screens without Expo Router headers** - Custom layouts

#### When SafeAreaView is Automatic:
1. **Expo Router Stack screens** - Header handles safe areas
2. **Tab Navigator screens** - Tabs handle bottom safe area
3. **Nested navigators** - Parent handles safe areas

#### Implementation Pattern:
```javascript
import { SafeAreaView, View, StyleSheet } from 'react-native';

export default function MyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Content */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff', // Match container background
  },
  container: {
    flex: 1,
    // Your layout styles
  },
});
```

### Screen Compatibility Matrix

**CRITICAL**: Always use `react-native-safe-area-context` SafeAreaView with `edges` prop for fine control.

| Screen | SafeAreaView | Edges | Reason |
|--------|--------------|-------|--------|
| Login | ✅ Required | ['top', 'bottom'] | No header, custom layout |
| Contact Picker | ✅ Required | ['top', 'bottom'] | Modal style screen |
| Home (Chat List) | ✅ Required | ['bottom'] | Tab header handles top, need bottom |
| Chat Detail | ✅ Required | ['bottom'] | Stack header handles top, need bottom |
| Group Members | ❌ Not needed | N/A | Stack navigator fully handles it |

**Key Learning**: Even with Expo Router headers, **always** add SafeAreaView with `edges={['bottom']}` for consistency across all iPhone models (13, 14, 15).

### Device Testing Requirements

**Must test on**:
- iPhone with notch (iPhone X+, 13, 14, 15)
- iPhone without notch (SE, 8)
- Android with notch
- Android without notch
- Tablets (iPad, Android tablet)

**Key checks**:
- Status bar doesn't overlap content
- Navigation bar doesn't block buttons
- Keyboard doesn't cover input fields
- Content is fully scrollable
- Safe area insets respected

### Responsive Design Guidelines

1. **Flexible layouts**: Use `flex: 1` instead of fixed heights
2. **Percentage widths**: `width: '90%'` for containers
3. **MaxWidth constraints**: `maxWidth: 600` for readability
4. **Minimum touch targets**: 44x44 points (iOS), 48x48 dp (Android)
5. **Scalable fonts**: Use relative sizes, test with accessibility settings
6. **KeyboardAvoidingView**: Required for screens with text input

### Common UI Issues & Fixes

#### Issue: Content cut off at top (iPhone notch)
**Fix**: Add SafeAreaView from `react-native-safe-area-context` with `edges` prop

#### Issue: Keyboard covers input
**Fix**: Use KeyboardAvoidingView + ScrollView

#### Issue: FlatList items have no keys
**Fix**: Always provide `keyExtractor` with fallback:
```javascript
keyExtractor={(item, index) => item.id || `item-${index}`}
```

#### Issue: Zustand selector causes infinite loops
**Fix**: Use custom equality check:
```javascript
const data = useStore(
  (state) => state.data,
  (a, b) => a === b // Custom equality
);
```

#### Issue: Timestamps show "NaN" or "undefined"
**Fix**: Always validate timestamps before formatting:
```javascript
const validTimestamp = timestamp && !isNaN(timestamp) ? timestamp : Date.now();
```

#### Issue: SQLite duplicate insertion errors
**Fix**: Use `INSERT OR REPLACE` and validate data before insertion:
```javascript
if (!message.messageID || !message.chatID || !message.text) {
  console.warn('[SQLite] Skipping invalid message');
  return;
}
```

### Testing Checklist

Before deploying any UI changes:
- [ ] Test on iPhone 13+ (notch)
- [ ] Test on Android (various screen sizes)
- [ ] Test in light mode
- [ ] Test in dark mode (future)
- [ ] Test with large text accessibility setting
- [ ] Test landscape orientation
- [ ] Test keyboard interactions
- [ ] Verify no content is cut off
- [ ] Verify no overlapping UI elements

