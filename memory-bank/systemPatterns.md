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

## Core Design Patterns

### 1. Offline-First Architecture

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

### 2. Optimistic UI Updates

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

### 3. Real-Time Sync with Listeners

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

### 4. Message Queue & Retry Logic

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

### 5. Push Notifications (Dual Token Support)

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
[App in background → System notification (Phase 2)]
        ↓
[User taps → Navigate to chat]
```

**Client-Side Listeners**:
```javascript
// Foreground notification listener
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

### 6. Presence Tracking

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
- 45-second delay for force-quit detection is acceptable for MVP
- Can add RTDB later if needed

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
[Show in-app toast (foreground only)]
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

