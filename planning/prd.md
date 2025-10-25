# MessageAI - Mobile Messaging App
## Product Requirements Document (MVP Phase)

**Version:** 2.0  
**Phase:** MVP - Focused Core Messaging  
**Target Deadline:** Tuesday EOD (Soft)  
**Status:** In Development

---

## 1. Executive Summary

MessageAI is a React Native messaging application that enables real-time one-on-one and group conversations with reliable message delivery, offline support, and full push notifications. The MVP focuses on proven messaging infrastructure—message persistence, real-time sync, optimistic UI updates, and graceful offline handling.

**Core Philosophy:** A simple, reliable messaging experience beats a feature-rich app with flaky delivery.

**Key Scope Decisions:**
- ✅ Full push notifications (background and foreground)
- ✅ Text-only messaging (images/media deferred)
- ✅ Initial-based avatars (profile pictures deferred)
- ✅ Basic group chat (advanced features deferred)
- ✅ Online status with typing indicators

---

## 2. Goals & Success Metrics (MVP)

### Primary Goals
- Deliver production-quality messaging infrastructure
- Prove message reliability across network conditions (online, offline, poor connectivity)
- Enable seamless real-time communication between 2+ users
- Establish foundation for AI features in Phase 2

### Success Metrics
- **Message Delivery Rate:** 100% of sent messages reach recipients (no lost messages)
- **Delivery Time:** Messages appear on recipient device within 2 seconds on good network
- **Offline Reliability:** Messages sent while offline queue and deliver when connectivity returns
- **App Stability:** Zero message loss on app crash/restart
- **Push Notification Delivery:** 90%+ of push notifications delivered (background and foreground)
- **Read Receipt Accuracy:** Read receipts reflect actual user engagement
- **Group Chat Accuracy:** Group messages display correct sender attribution and timestamps

---

## 3. Target Users & Use Cases

### Primary Users
- Remote professionals working across time zones
- Friends and family maintaining long-distance relationships
- Teams coordinating projects asynchronously
- Users on unreliable network connections (3G, intermittent WiFi)

### Use Cases
1. **Real-Time Conversation:** User A sends a message; User B receives it within 2 seconds if online
2. **Offline Resilience:** User goes offline, receives messages in queue, comes back online and syncs all messages
3. **Background/Foreground Activity:** App receives push notification; message appears in chat or shows system notification
4. **Session Recovery:** User force-quits app mid-message; message still sends, chat history preserved
5. **Group Coordination:** Three users discuss plans in group chat with clear message attribution

---

## 4. Core Features & Requirements

### 4.1 User Authentication & Profiles

**Feature:** User Sign-Up, Login, and Profile Management

| Requirement | Details |
|---|---|
| **Sign-Up** | Users create account with email and password. Firebase Auth validates and stores credentials securely. |
| **Login** | Returning users authenticate with email/password. Session persists across app restarts. |
| **Profile Data** | Each user has: unique ID, display name, account creation timestamp. |
| **Avatar Display** | Initial-based avatars generated from display name (e.g., "John Doe" → "JD"). Color assigned based on userID hash. |
| **Online Status** | System tracks user online/offline state. Status syncs to Firestore in real-time. |
| **Persistence** | User remains logged in until explicit logout. |
| **Token Management** | Auth tokens automatically refresh. Handle token expiry gracefully. |

**Acceptance Criteria:**
- User can sign up with valid email/password combination
- Sign-up validates password strength (minimum 8 characters)
- User remains logged in after app restart
- Initial-based avatar displays correctly in chat interface
- User can update display name
- Online status updates within 2 seconds of app foreground/background transitions
- Expired tokens automatically refresh without user intervention

---

### 4.2 One-on-One Messaging

**Feature:** Send, Receive, and Persist Text Messages

| Requirement | Details |
|---|---|
| **Send Message** | User types message and taps send. Message immediately appears in their chat with "sending" state. |
| **Message Delivery** | Message sent to Firestore. Recipient receives in real-time via listener. Sender receives "delivered" confirmation. |
| **Message Display** | Messages appear in chronological order. Sender's messages align right, recipient's align left. Display name and avatar shown above first message in sequence. |
| **Timestamps** | Every message includes precise timestamp (HH:MM AM/PM format). Timestamps visible below each message or message group. |
| **Read Receipts** | When recipient views message, "read" status sent to sender. Sender sees checkmarks: 1 = sent, 2 = delivered, 2 (filled/blue) = read. |
| **Message States** | Visual indicators for sending → sent → delivered → read progression. |
| **Chat History** | Users see full conversation history when opening chat. Oldest messages at top, newest at bottom. |
| **Offline Queuing** | Messages typed while offline queue locally. Send button disabled with "offline" indicator. On reconnect, messages send automatically. |

**Acceptance Criteria:**
- User A sends message to User B; User B receives within 2 seconds (good network)
- Read receipt updates on sender's device when recipient reads
- Chat history persists across app restarts
- Messages sent offline appear in chat history and send when connectivity returns
- No duplicate messages appear after reconnect
- Timestamps are accurate and consistent across devices

---

### 4.3 Group Chat Messaging

**Feature:** Enable Conversations with 3+ Participants

| Requirement | Details |
|---|---|
| **Group Creation** | User A creates group, names it, selects members (2+ others). Group displayed with group name, member count. |
| **Group Display** | Group chat shows name at top. Member count visible. |
| **Message Attribution** | Each message shows sender name and avatar. Consecutive messages from same sender show avatar once (grouped). |
| **Member List** | Users can view all group members with online status. |
| **Message History** | Full conversation history visible in group. Same persistence rules as 1:1 chats. |
| **Real-Time Sync** | All group members receive messages simultaneously (within 2 seconds). Read receipts show per-member status. |
| **Offline in Groups** | Group messages received while offline sync when back online. Message order preserved. |

**Acceptance Criteria:**
- Group created with 3+ members displays all members correctly
- Message from User A in group visible to Users B, C, D within 2 seconds
- Each message shows correct sender attribution
- Read receipts show which members have read the message
- Group chat history persists and syncs across all members' devices
- Group continues to receive messages if one member temporarily offline

**Out of Scope (MVP):**
- Group admin/permissions
- Remove/add members after creation
- Group profile picture
- Group settings/customization

---

### 4.4 Message Persistence & Sync Strategy

**Feature:** Local Storage for Offline Access and Crash Recovery

| Requirement | Details |
|---|---|
| **Source of Truth** | Firestore is the authoritative source for all data. SQLite is a read cache + offline queue. |
| **Local Database** | Expo SQLite stores all messages locally with sync status. |
| **Sync on Startup** | App launches, queries SQLite for chat history (instant UI). Async sync with Firestore to fetch new messages. |
| **Offline Access** | Users can scroll through chat history without internet connection. |
| **Crash Recovery** | If app crashes mid-send or mid-sync, data integrity maintained. Messages not lost. |
| **Message Queue** | Messages waiting to send stored locally with `syncStatus: 'pending'`. Automatically retry on connectivity. |
| **Conflict Resolution** | On sync conflict, Firestore always wins. Overwrite local SQLite data. |
| **Storage Efficiency** | Messages indexed by chat ID and timestamp for fast queries. |

**Sync Status Values:**
- `synced`: Message confirmed in Firestore, matches local
- `pending`: Message queued, waiting to send to Firestore
- `syncing`: Message currently being written to Firestore
- `failed`: Message failed to sync after max retries

**Acceptance Criteria:**
- User A sends message, receives delivery confirmation, closes app
- User A reopens app; message appears with "delivered" status instantly (from SQLite), then syncs with Firestore
- User A sends message while offline, goes online; message sends and shows "delivered"
- If app force-quit during send, message eventually sends (either in session or next session)
- App doesn't duplicate messages after sync
- Sync conflicts resolve in favor of Firestore data

---

### 4.5 Optimistic UI Updates

**Feature:** Instant Message Appearance Before Server Confirmation

| Requirement | Details |
|---|---|
| **Instant Appearance** | When user taps send, message appears in chat immediately with "sending" state. No wait for server response. |
| **State Progression** | Message progresses: sending → sent → delivered → read as confirmations arrive. |
| **Visual Feedback** | Clear indicators (checkmarks, color changes, or spinner) show message state. |
| **Rollback on Failure** | If send fails (network error), message shows error state with retry button. User can tap to retry. |
| **No Flashing** | Message doesn't disappear/reappear. State updates smoothly. |
| **Retry Logic** | Failed messages can be retried manually. Automatic retry happens on reconnect (up to 5 attempts). |

**Acceptance Criteria:**
- User types message and taps send; message appears in chat instantly
- Sender sees "sending" indicator briefly, then updates to "sent"
- If send fails, message shows error and retry option
- No duplicate messages appear after retry
- State transitions are smooth without UI flashing

---

### 4.6 Online/Offline Status & Network Detection

**Feature:** Real-Time Presence Indicators and Network Monitoring

| Requirement | Details |
|---|---|
| **User Status Indicator** | In 1:1 chat header, show green dot (online) or gray dot (offline) next to recipient's name. |
| **Presence Sync** | User's online status updates in Firestore when app goes foreground/background using `onDisconnect()` handlers. |
| **Presence Optimization** | Use Firestore real-time listeners with ephemeral presence data. Minimize writes (max 1 per 30 seconds). |
| **Accuracy** | Status reflects actual app state (not just device network state). App backgrounded = offline in UI. |
| **Group Status** | In group chats, show online status for all members in member list. |
| **Network Detection** | App continuously monitors network connectivity using `@react-native-community/netinfo`. |
| **Network Status UI** | Show persistent banner at top of screen when offline: "No internet connection. Messages will send when online." |
| **Auto-Reconnect** | When network returns, automatically trigger sync and process message queue. |

**Network States:**
- `online`: Connected to internet, can reach Firebase
- `offline`: No internet connection
- `limited`: Connected but can't reach Firebase (e.g., captive portal)

**Acceptance Criteria:**
- User A sends message to User B; status shows green online indicator
- User B closes app; User A sees offline indicator within 5 seconds
- Status updates correctly when app moves to/from background
- Offline banner appears immediately when network lost
- Message queue automatically processes when network returns
- App gracefully handles switching between WiFi/cellular

---

### 4.7 Push Notifications (Background and Foreground)

**Feature:** Alert Users to Incoming Messages While App is Open

| Requirement | Details |
|---|---|
| **Push Trigger** | When message sent to recipient, Cloud Function triggers push notification to recipient's device. |
| **Foreground Behavior** | While app in foreground, notification appears as in-app banner/toast with sender name and message preview. |
| **Background Behavior** | While app in background or killed, notification appears as system notification with badge count and sound. |
| **Notification Content** | Shows sender name and message preview (first 80 characters). |
| **Tap Action** | Tapping notification navigates to that chat (if not already there). |
| **Silent Fail** | If push notification fails, message still delivered in-app via real-time listener. Push is nice-to-have, not critical. |
| **FCM Token Management** | FCM token stored in user's Firestore document. Token refreshed when expired. |
| **Permission Handling** | Request notification permission on first app launch. Gracefully handle if denied. |

**Out of Scope (MVP):**
- Notification badges (iOS badge count)
- Notification center persistence (Android notification history)
- Custom notification sounds
- Notification grouping

**Acceptance Criteria:**
- User A sends message to User B while B has app open; User B sees in-app notification
- Tapping notification navigates to relevant chat
- Notification shows sender name and message preview
- App continues to work if notification permission denied

---

### 4.8 Chat List (Home Screen)

**Feature:** Display All Active Conversations

| Requirement | Details |
|---|---|
| **Chat List Display** | Home screen shows list of all 1:1 and group chats user is in. |
| **Recent First** | Chats sorted by most recent message timestamp (top = newest). |
| **Chat Preview** | Each chat shows: initial-based avatar, name, preview of last message (first 50 characters), timestamp of last message. |
| **Unread Indicator** | Show badge with unread message count on chat tile. |
| **Tap to Open** | Tapping chat tile opens that conversation. |
| **New Chat** | Button to start new 1:1 chat or create group. Opens contact/member picker. |
| **Empty State** | If no chats, show "Start a conversation!" with prominent New Chat button. |
| **Pull to Refresh** | User can pull down to manually refresh chat list (triggers sync). |

**Acceptance Criteria:**
- Chat list displays all user's active conversations in correct order
- Most recent chat appears at top
- Each chat shows correct last message preview
- Unread badge shows correct count
- Tapping chat opens correct conversation
- Pull-to-refresh updates list

---

### 4.9 Contact/Member Picker

**Feature:** Select Users for New Chats or Groups

| Requirement | Details |
|---|---|
| **Contact List** | Show all registered users (except self). Display name and initial-based avatar. |
| **Search** | Search by name to find contacts. Case-insensitive, supports partial matches. |
| **Selection** | Tap to select user(s). Checkmark indicates selection. |
| **Multiple Selection** | For groups, select 2+ users. At least 3 total (including self) for group chat. |
| **Chat Creation** | After selection, create 1:1 or group chat. Group creation prompts for group name. |
| **Duplicate Prevention** | When creating 1:1 chat, check if chat with this user already exists. If yes, navigate to existing chat. |

**Acceptance Criteria:**
- Contact list loads all users
- Search filters contacts correctly
- User can select multiple contacts for group creation
- Group creation validates minimum 2 additional members (3 total with self)
- Chat created successfully after selection
- Cannot create duplicate 1:1 chats

---

## 5. User Flows

### Flow 1: New User Sign-Up & First Message

```
User A (new) → Sign up with email/password
→ Create profile (name only)
→ Home screen (empty chat list, shows empty state)
→ Tap "New Chat"
→ Search for "User B"
→ Tap User B → Tap "Create Chat"
→ Type message "Hi there!"
→ Tap send
→ Message appears instantly with "sending" indicator
→ [Server confirms] → "sent" indicator
→ [User B online] → message appears on User B's device + in-app notification
→ [User B reads] → checkmark turns blue, User A sees "read"
```

### Flow 2: Offline Message & Recovery

```
User A → Toggles airplane mode (offline)
→ Offline banner appears at top
→ Types message "Are you free tonight?"
→ Taps send
→ Message appears with "pending" indicator
→ Toggle airplane mode off (back online)
→ Offline banner disappears
→ Message automatically sends (user sees "sending" → "sent")
→ [User B receives] → in-app notification + message in chat
→ [User B replies] → User A receives message + notification
```

### Flow 3: Group Chat Coordination

```
User A → Taps "New Chat"
→ Selects members: User B, User C
→ Names group "Weekend Plans"
→ Taps "Create"
→ Types message "Hey, what time should we meet?"
→ All members see message with User A's name/avatar
→ User B types reply, message shows with User B's attribution
→ User C goes offline, comes back online
→ User C sees full conversation history, new messages since they were offline
→ All users see read receipts per member (in member list view)
```

### Flow 4: App Lifecycle & Crash Recovery

```
User A → In active chat with User B
→ Sends message (appears instantly)
→ App crashes before Firestore write completes
→ [Message queued in SQLite with syncStatus: 'pending']
→ User A reopens app
→ App checks for pending messages in SQLite
→ Automatically retries sending
→ Message successfully sent to Firestore
→ User B receives message
```

---

## 6. Technical Architecture

### Tech Stack

**Backend:**
- Firebase Firestore - Real-time database & message persistence
- Firebase Cloud Functions - Serverless backend for push notifications
- Firebase Authentication - User sign-up, login, session management
- Firebase Cloud Messaging (FCM) - Push notifications (background and foreground)

**Mobile Frontend:**
- React Native (Expo)
- Expo Router - File-based navigation
- Expo SQLite - Local message storage & offline persistence
- Expo Notifications - Push notification handling (background and foreground)
- @react-native-community/netinfo - Network status monitoring
- Firebase SDK (Firestore + Auth)
- Zustand - State management
- React Query (optional) - Data fetching and caching

**Development Tools:**
- Firebase Emulators (optional) - Local testing
- Expo Go - Development/testing
- EAS Build - Production builds

### Data Models

#### User
```javascript
{
  userID: string (unique),
  email: string (unique),
  displayName: string,
  isOnline: boolean,
  lastSeenTimestamp: timestamp,
  fcmToken: string (optional),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Message
```javascript
{
  messageID: string (unique),
  chatID: string,
  senderID: string,
  senderName: string, // denormalized for easy display
  text: string,
  timestamp: timestamp,
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'read',
  readBy: [userID], // list of users who've read
  createdAt: timestamp
}
```

#### Message (Local SQLite)
```javascript
{
  messageID: string (primary key),
  chatID: string (indexed),
  senderID: string,
  senderName: string,
  text: string,
  timestamp: number (indexed),
  deliveryStatus: string,
  readBy: string (JSON stringified array),
  syncStatus: 'synced' | 'pending' | 'syncing' | 'failed',
  retryCount: number,
  lastSyncAttempt: number,
  createdAt: number
}
```

#### Chat (1:1)
```javascript
{
  chatID: string (unique),
  type: '1:1',
  participantIDs: [string] (exactly 2),
  participantNames: [string], // denormalized
  lastMessageText: string,
  lastMessageTimestamp: timestamp,
  lastMessageSenderID: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Group Chat
```javascript
{
  chatID: string (unique),
  type: 'group',
  groupName: string,
  memberIDs: [string] (3+),
  memberNames: [string], // denormalized
  createdBy: string,
  lastMessageText: string,
  lastMessageTimestamp: timestamp,
  lastMessageSenderID: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Firestore Structure
```
/users/{userID}
  - Basic user data + online status + fcmToken

/chats/{chatID}
  - Chat metadata (1:1 and groups)
  - Type discriminator field

/chats/{chatID}/messages/{messageID}
  - Individual messages
  - Ordered by timestamp
  - Includes delivery/read status
```

### Key Technical Decisions

**Real-Time Sync:** Firestore listeners subscribed to user's chats. On message creation, listener fires and updates local UI instantly.

**Offline Queuing:** Messages typed offline stored in SQLite with `syncStatus: 'pending'`. On reconnect, queue processed with exponential backoff (1s, 2s, 4s, 8s, max 30s). Max 5 retry attempts.

**Optimistic Updates:** When user sends, message written to SQLite immediately with "sending" state. Async Firestore write follows. On write success, state updated to "sent". On failure, state updated to "failed" with retry option.

**Read Receipts:** When user views chat, app updates `readBy` array in each unread message. Listeners on sender's device see update and UI updates. For groups, read receipts shown per-member in member list.

**Presence Tracking:** User's online status synced to Firestore on app foreground/background using `onDisconnect()` handlers. Status updates throttled (max 1 per 30 seconds) to minimize writes.

**Network Detection:** `@react-native-community/netinfo` monitors connection state. On state change, app updates global `isOnline` state and triggers sync if coming online.

**Auth Token Refresh:** Firebase Auth SDK automatically refreshes tokens. App uses `onAuthStateChanged` listener to detect token changes. On refresh, update any pending API calls.

**Push Notifications (Background & Foreground):** Cloud Function triggers on message creation. Sends FCM notification regardless of app state. Client receives and displays as system notification (background) or in-app toast (foreground).

**Initial-Based Avatars:** Generated client-side from display name. First letter of first name + first letter of last name. Background color generated from hash of userID for consistency.

---

## 7. Testing Scenarios

All scenarios must pass before MVP submission. Test after each relevant PR.

| # | Scenario | Steps | Expected Result |
|---|---|---|---|
| **1** | **Real-Time Message** | User A sends "Hello" to User B on good network | User B receives within 2 seconds; read receipt appears when read |
| **2** | **Offline Send** | User A sends message while offline, goes online | Message sends automatically; User B receives |
| **3** | **Push Notification** | User B has app backgrounded, User A sends message | User B sees system notification with message preview |
| **3a** | **Foreground Notification** | User B has app open in chat list, User A sends message | User B sees in-app notification with message preview |
| **4** | **Force Quit** | User A sends message, app force-quit before confirmation | Message sends on restart; appears in chat history |
| **5** | **Poor Network** | Test with throttled connection (3G simulation) | Messages eventually deliver; no duplicates; UI shows status |
| **6** | **Rapid Fire** | User A sends 20 messages in 10 seconds | All appear in correct order; no loss or duplication |
| **7** | **Group Chat 3-Way** | Users A, B, C in group; A sends message | B and C receive simultaneously; correct attribution shown |
| **8** | **App Restart Persistence** | Send message, restart app | Message in chat history with correct state (sent/delivered/read) |
| **9** | **Online Status** | User A backgrounded, User B viewing 1:1 chat | User B sees User A go offline within 5 seconds |
| **10** | **Chat List Sync** | User A receives message while in different chat | Chat list updates with new message preview and unread badge |

---

## 8. Out of Scope (MVP)

**Deferred to Phase 2:**
- Notification badges and advanced notification features
- Advanced typing features (typing in multiple chats simultaneously)
- Profile picture uploads
- Image/media messages
- Video/audio calls
- End-to-end encryption (E2E)
- File sharing
- Message search/full-text search
- Message editing/deletion
- Reactions/emoji responses
- Stickers/GIFs
- User blocking/reporting
- Link previews
- Message forwarding
- Group admin features
- Add/remove group members
- All AI features

---

## 9. Testing Strategy

### Test After Each PR

**PR Testing Checklist Template:**
```
After completing PR [number]:
[ ] Feature works on physical device
[ ] Feature works offline (if applicable)
[ ] Feature survives app restart
[ ] No console errors
[ ] UI updates smoothly (no flashing)
[ ] Relevant integration test scenarios pass
[ ] Code committed with descriptive message
```

### Integration Testing (Final)

Before submission, run all 10 testing scenarios on physical device. Document results:
- Device model and OS version
- Network conditions
- Screenshots/video of each test
- Any issues or edge cases discovered

### Manual Testing Tools

Create in-app dev menu (accessible via shake gesture):
- View current network status
- View sync queue status (pending messages count)
- Clear local database
- Force sync now
- Simulate offline mode (disable Firestore connection)
- View last 10 sync errors
- Create test messages (bulk)

---

## 10. Deployment & Delivery

### Deployment Target
- **Development:** Expo Go
- **Testing:** EAS Build (internal testing)
- **Backend:** Firebase (auto-deployed)

### Pre-Submission Checklist
- [ ] All 10 testing scenarios pass on physical device
- [ ] No messages lost across 100+ test messages
- [ ] App doesn't crash during any scenario
- [ ] Push notifications work in background and foreground
- [ ] Offline queue processes correctly
- [ ] Code committed to GitHub with comprehensive README
- [ ] Setup instructions tested from scratch (by someone else if possible)
- [ ] Demo video prepared (5-7 min, showing real-time messaging, offline scenario, group chat)
- [ ] Environment variables documented
- [ ] Known issues documented

---

## 11. Success Criteria Summary

An MVP build is **successful** if:

1. ✅ **Two users can reliably exchange messages in real-time** (good network)
2. ✅ **Messages persist across app restarts and offline scenarios**
3. ✅ **Optimistic UI updates work** (message appears instantly before server confirm)
4. ✅ **Group chat with 3+ users functions** with clear attribution
5. ✅ **Offline messages queue and send** when connectivity returns with clear UI feedback
6. ✅ **Push notifications work** in background and foreground
7. ✅ **Read receipts accurately reflect** who's read what
8. ✅ **App doesn't crash or lose data** during lifecycle events
9. ✅ **Network status detection works** with persistent UI indicator
10. ✅ **Code is deployable** via Expo Go with clear setup instructions
11. ✅ **Demo clearly shows** real-time messaging, offline resilience, and group coordination

**If the above are true, you have a production-quality messaging infrastructure that's ready for Phase 2 AI features.**

---

## 12. Implementation Priorities

### Must Have (Core MVP)
1. Auth (sign-up, login, session persistence)
2. 1:1 messaging with real-time sync
3. Message persistence (SQLite + Firestore)
4. Optimistic UI updates
5. Offline queue with retry
6. Read receipts
7. Chat list with unread counts
8. Basic group chat (3+ users)
9. Online/offline status
10. Network detection with UI feedback

### Should Have (Enhanced MVP)
1. Full push notifications (background and foreground)
2. Pull-to-refresh on chat list
3. Initial-based avatars with color
4. Group member list
5. Error states with retry buttons
6. Loading states
7. Empty states

### Nice to Have (If Time Allows)
1. Message timestamp grouping (Today, Yesterday, etc.)
2. Contact search with fuzzy matching
3. Chat search in chat list
4. Unread message divider in chat
5. Scroll-to-bottom button when new messages arrive

---

## Appendix: Key Definitions

**Delivery Status:**
- **Sending:** Message queued or in-flight to server
- **Sent:** Message confirmed received by Firebase
- **Delivered:** Message confirmed received by recipient's device
- **Read:** Message confirmed viewed by recipient

**Sync Status (Local):**
- **Synced:** Local data matches Firestore
- **Pending:** Waiting to sync to Firestore
- **Syncing:** Currently writing to Firestore
- **Failed:** Sync failed after max retries

**Online/Offline:**
- **Online:** App in foreground, connected to internet, can reach Firebase
- **Offline:** App backgrounded OR no internet connection OR can't reach Firebase
- **Limited:** Connected to internet but can't reach Firebase (captive portal, etc.)

**Persistence:**
- **Local Persistence:** Data survives app restart via SQLite
- **Cloud Persistence:** Data survives across devices/sessions in Firestore
- **Source of Truth:** Firestore is always authoritative; SQLite is cache

---

**Document Version:** 2.0  
**Last Updated:** [Current Date]  
**Next Review:** After MVP completion, before Phase 2 planning
