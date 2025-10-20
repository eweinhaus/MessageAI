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

### 5. Presence Tracking

**Pattern**: Firestore onDisconnect with throttling

**Implementation**:
```javascript
// On app foreground
function setUserOnline(userID) {
  const userRef = doc(db, 'users', userID);
  
  // Update online status
  updateDoc(userRef, {
    isOnline: true,
    lastSeenTimestamp: serverTimestamp()
  });
  
  // Set up disconnect handler
  onDisconnect(userRef).update({
    isOnline: false,
    lastSeenTimestamp: serverTimestamp()
  });
}

// Throttle updates to max 1 per 30 seconds
const throttledPresenceUpdate = throttle(setUserOnline, 30000);
```

**Presence States**:
- `isOnline: true` - App in foreground, connected
- `isOnline: false` - App backgrounded, disconnected, or force-quit
- `lastSeenTimestamp` - Last activity time for "last seen" feature

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

