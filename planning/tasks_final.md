# MessageAI Phase 2 - Task List

**Phase:** Post-MVP Enhancements  
**Focus:** AI features, advanced messaging, and production polish

**Prerequisites:** MVP must be complete and stable before starting Phase 2.

---

## Phase 2A: Security & Production Readiness

### PR 16: Firestore Security Rules

**Objective:** Secure Firestore database with proper access controls.

#### Tasks

- [ ] Write Firestore security rules
  - [ ] Rules for `/users/{userID}`:
    - [ ] Any authenticated user can read any user profile
    - [ ] Users can only write to their own profile
    - [ ] Users can only update specific fields (not userID, email)
  - [ ] Rules for `/chats/{chatID}`:
    - [ ] Only participants can read chat metadata
    - [ ] Only participants can write to chat
    - [ ] Validate chat document structure
  - [ ] Rules for `/chats/{chatID}/messages/{messageID}`:
    - [ ] Only chat participants can read messages
    - [ ] Only authenticated users can create messages
    - [ ] Sender must be in chat participants
    - [ ] Cannot modify messages after creation (except readBy)
    - [ ] Can only add self to readBy array
- [ ] Create `firestore.rules` file:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      // Helper functions
      function isAuthenticated() {
        return request.auth != null;
      }
      
      function isOwner(userID) {
        return request.auth.uid == userID;
      }
      
      function isChatParticipant(chatData) {
        return request.auth.uid in chatData.participantIDs ||
               request.auth.uid in chatData.memberIDs;
      }
      
      // User rules
      match /users/{userID} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated() && isOwner(userID);
        allow update: if isAuthenticated() && isOwner(userID);
        allow delete: if false; // Never allow user deletion via client
      }
      
      // Chat rules
      match /chats/{chatID} {
        allow read: if isAuthenticated() && isChatParticipant(resource.data);
        allow create: if isAuthenticated() && 
                         (request.auth.uid in request.resource.data.participantIDs ||
                          request.auth.uid in request.resource.data.memberIDs);
        allow update: if isAuthenticated() && isChatParticipant(resource.data);
        allow delete: if false; // Soft delete only
        
        // Message subcollection rules
        match /messages/{messageID} {
          allow read: if isAuthenticated() && 
                         isChatParticipant(get(/databases/$(database)/documents/chats/$(chatID)).data);
          allow create: if isAuthenticated() && 
                           request.resource.data.senderID == request.auth.uid &&
                           isChatParticipant(get(/databases/$(database)/documents/chats/$(chatID)).data);
          allow update: if isAuthenticated() && 
                           request.auth.uid in get(/databases/$(database)/documents/chats/$(chatID)).data.participantIDs &&
                           (request.resource.data.readBy.toSet().difference(resource.data.readBy.toSet()).hasOnly([request.auth.uid]));
          allow delete: if false; // Soft delete only
        }
      }
    }
  }
  ```
- [ ] Deploy security rules
  - [ ] `firebase deploy --only firestore:rules`
  - [ ] Verify in Firebase console
- [ ] Test security rules
  - [ ] Use Firebase Emulator to test rules locally
  - [ ] Test unauthorized access (should fail)
  - [ ] Test authorized access (should succeed)
  - [ ] Test edge cases (user not in chat trying to read messages)

#### Testing Checklist
- [ ] Authenticated users can read other user profiles
- [ ] Users cannot write to other users' profiles
- [ ] Non-participants cannot read chat messages
- [ ] Users can only add themselves to readBy arrays
- [ ] All existing app functionality still works

#### Commit
`feat: implement Firestore security rules for production`

---

### PR 17: Auth Token Refresh Handling

**Objective:** Ensure auth tokens refresh automatically and handle expiry gracefully.

#### Tasks

- [ ] Implement token refresh listener
  - [ ] In `services/auth.js`:
    - [ ] Use Firebase Auth's `onIdTokenChanged` listener
    - [ ] When token changes, update any cached tokens
    - [ ] Retry failed requests with new token
- [ ] Handle token expiry errors
  - [ ] Wrap Firestore operations in try-catch
  - [ ] Detect auth/permission errors
  - [ ] If token expired:
    - [ ] Force token refresh
    - [ ] Retry operation
    - [ ] If still fails, log out user
- [ ] Add token refresh to app initialization
  - [ ] In root layout, set up token refresh listener
  - [ ] Force refresh on app foreground if token > 50 minutes old
- [ ] Test token expiry scenarios
  - [ ] Manually expire token (set device time forward)
  - [ ] Attempt Firestore operation
  - [ ] Verify automatic refresh

#### Testing Checklist
- [ ] Token refreshes automatically before expiry
- [ ] App doesn't crash on token expiry
- [ ] User doesn't get logged out unnecessarily
- [ ] Failed operations retry with new token

#### Commit
`feat: implement automatic auth token refresh handling`

---

### PR 18: Error Tracking & Monitoring

**Objective:** Add production error tracking and performance monitoring.

#### Tasks

- [ ] Set up Sentry (or similar)
  - [ ] Create Sentry account
  - [ ] Install Sentry SDK: `npm install @sentry/react-native`
  - [ ] Initialize in app root
  - [ ] Add DSN to environment variables
- [ ] Configure error tracking
  - [ ] Capture JavaScript errors
  - [ ] Capture native errors
  - [ ] Add user context (userID, email)
  - [ ] Add breadcrumbs for debugging
- [ ] Add custom error logging
  - [ ] Wrap critical operations (message send, sync, etc.)
  - [ ] Log to Sentry on failures
  - [ ] Include relevant context (network status, message queue size, etc.)
- [ ] Set up performance monitoring
  - [ ] Track app startup time
  - [ ] Track message send time
  - [ ] Track sync time
  - [ ] Track screen load times
- [ ] Create error dashboard
  - [ ] Configure Sentry alerts (for critical errors)
  - [ ] Set up Slack/email notifications

#### Testing Checklist
- [ ] Errors appear in Sentry dashboard
- [ ] User context shows in error reports
- [ ] Breadcrumbs provide useful debugging info
- [ ] Performance metrics tracked

#### Commit
`feat: add error tracking and performance monitoring`

---

## Phase 2B: Advanced Messaging Features

### PR 19: Typing Indicators

**Objective:** Show when users are typing in real-time.

#### Tasks

- [ ] Extend Firestore schema for typing status
  - [ ] Add `/chats/{chatID}/typing/{userID}` subcollection (ephemeral)
  - [ ] OR use Firestore Realtime Database for better performance
- [ ] Update presence service
  - [ ] In `services/presenceService.js`:
    - [ ] `setUserTyping(chatID, userID, isTyping)` - Write to Firestore/RTDB
    - [ ] Throttle: only send update every 2 seconds max
    - [ ] Auto-clear after 3 seconds of inactivity
- [ ] Add typing detection to message input
  - [ ] In MessageInput component:
    - [ ] On text change, call `setUserTyping(chatID, userID, true)`
    - [ ] Use debounce to call `setUserTyping(chatID, userID, false)` after 3s of no typing
- [ ] Create Typing Indicator component
  - [ ] `components/TypingIndicator.js`:
    - [ ] Shows "User is typing..." below messages
    - [ ] Animated dots (...)
    - [ ] For groups: "User A and User B are typing..."
- [ ] Add typing listener to chat detail
  - [ ] Subscribe to typing status for chat
  - [ ] Update local state when someone starts/stops typing
  - [ ] Show TypingIndicator component
  - [ ] Hide when user stops typing or sends message

#### Testing Checklist
- [ ] User A types, User B sees "User A is typing..."
- [ ] Indicator appears within 1 second
- [ ] Indicator disappears 3 seconds after typing stops
- [ ] Indicator disappears immediately when message sent
- [ ] In groups, shows correct list of typing users
- [ ] Doesn't spam Firestore (check write count)

#### Commit
`feat: implement real-time typing indicators`

---

### PR 20: Profile Pictures & Image Upload

**Objective:** Allow users to upload profile pictures and send images in chats.

#### Tasks

- [ ] Set up Firebase Storage
  - [ ] Enable Firebase Storage in console
  - [ ] Configure storage rules (users can upload to their own folder)
- [ ] Install image picker
  - [ ] `npx expo install expo-image-picker`
- [ ] Create image upload service
  - [ ] `services/imageService.js`:
    - [ ] `uploadProfilePicture(userID, imageUri)` - Upload to Storage, return URL
    - [ ] `uploadChatImage(chatID, imageUri)` - Upload to Storage, return URL
    - [ ] Compress images before upload
    - [ ] Generate thumbnails
- [ ] Add profile picture to user profile
  - [ ] Add `profilePictureURL` field to User model
  - [ ] Create profile edit screen
  - [ ] Allow user to select image from gallery or camera
  - [ ] Upload and save URL to Firestore
- [ ] Update Avatar component
  - [ ] If user has profilePictureURL, show image
  - [ ] Else, show initial-based avatar
  - [ ] Fallback to initials if image fails to load
- [ ] Add image messages
  - [ ] Extend Message model: add `type: 'text' | 'image'`, `imageURL`
  - [ ] Add image picker button to message input
  - [ ] On image selected:
    - [ ] Upload to Storage
    - [ ] Send message with imageURL
  - [ ] Update MessageBubble to display images
    - [ ] Show image with loading state
    - [ ] Tap image to view full-screen
  - [ ] Create image viewer modal/screen

#### Testing Checklist
- [ ] User can upload profile picture
- [ ] Profile picture displays in chat list, chat header, message bubbles
- [ ] User can send image in chat
- [ ] Image appears in chat for all participants
- [ ] Image persists and loads from cache
- [ ] Tap image opens full-screen view
- [ ] Images compressed appropriately (not huge file sizes)

#### Commit
`feat: add profile pictures and image messaging`

---

### PR 21: Message Editing & Deletion

**Objective:** Allow users to edit or delete their own messages.

#### Tasks

- [ ] Extend Message model
  - [ ] Add fields: `isEdited: boolean`, `editedAt: timestamp`, `isDeleted: boolean`, `deletedAt: timestamp`
- [ ] Add edit/delete options to MessageBubble
  - [ ] Long-press message shows action sheet
  - [ ] Options: Edit, Delete, Copy (for own messages)
  - [ ] Options: Copy (for others' messages)
- [ ] Implement message editing
  - [ ] Show edit modal with text input (pre-filled with current text)
  - [ ] On save:
    - [ ] Update Firestore message doc
    - [ ] Set `isEdited: true`, `editedAt: now`
    - [ ] Update SQLite
  - [ ] In MessageBubble, show "(edited)" label if isEdited
- [ ] Implement message deletion
  - [ ] Confirm deletion (alert)
  - [ ] On confirm:
    - [ ] Update Firestore: set `isDeleted: true`, `deletedAt: now`, clear text
    - [ ] OR hard delete from Firestore
    - [ ] Update SQLite
  - [ ] In MessageBubble, show "Message deleted" in gray if isDeleted
- [ ] Update security rules
  - [ ] Users can update their own messages (text, isEdited, editedAt)
  - [ ] Users can delete their own messages

#### Testing Checklist
- [ ] Long-press message shows action sheet
- [ ] Can edit own messages
- [ ] Edited message shows "(edited)" label
- [ ] Edited message syncs to all participants
- [ ] Can delete own messages
- [ ] Deleted message shows "Message deleted"
- [ ] Cannot edit/delete others' messages

#### Commit
`feat: implement message editing and deletion`

---

### PR 22: Message Reactions

**Objective:** Allow users to react to messages with emojis.

#### Tasks

- [ ] Extend Message model
  - [ ] Add `reactions: { [emoji]: [userID] }` field
  - [ ] Example: `{ "👍": ["userA", "userB"], "❤️": ["userC"] }`
- [ ] Add reaction picker to MessageBubble
  - [ ] Long-press or tap reaction button shows emoji picker
  - [ ] Common reactions: 👍 ❤️ 😂 😮 😢 🎉
- [ ] Implement add reaction
  - [ ] On emoji selected:
    - [ ] Update Firestore message: add userID to emoji array
    - [ ] Use `arrayUnion` for atomic update
    - [ ] Update SQLite
- [ ] Implement remove reaction
  - [ ] Tap existing reaction to remove
  - [ ] Update Firestore: remove userID from emoji array
  - [ ] Use `arrayRemove`
- [ ] Display reactions on MessageBubble
  - [ ] Show reactions below message
  - [ ] Format: 👍 3 ❤️ 1
  - [ ] Highlight user's own reactions
  - [ ] Tap reaction to see who reacted

#### Testing Checklist
- [ ] Can add reaction to message
- [ ] Reaction syncs to all participants
- [ ] Multiple users can react with same emoji
- [ ] Can remove own reaction
- [ ] Reactions display correctly below message
- [ ] Tap reaction shows list of users who reacted

#### Commit
`feat: implement message reactions`

---

### PR 23: Background Push Notifications & Notification Badges

**Objective:** Send push notifications when app is backgrounded or killed. Show badge count.

#### Tasks

- [ ] Update Cloud Function
  - [ ] In `functions/index.js`:
    - [ ] Check if recipient is online AND app in foreground
    - [ ] If backgrounded or killed, send push notification
    - [ ] If foreground, skip push (real-time listener handles)
- [ ] Configure notification channels (Android)
  - [ ] Create notification channel for messages
  - [ ] Set importance level (high for messages)
- [ ] Handle background notifications
  - [ ] In `services/notificationService.js`:
    - [ ] Listen for notifications when app backgrounded
    - [ ] Update badge count
    - [ ] Store notification in local cache
- [ ] Implement badge count
  - [ ] Calculate total unread messages across all chats
  - [ ] Update app icon badge using Expo Notifications
  - [ ] Clear badge when user opens chat
- [ ] Handle notification taps (background)
  - [ ] When app opened via notification:
    - [ ] Navigate to correct chat
    - [ ] Mark messages as read
- [ ] Add notification settings screen
  - [ ] Allow user to enable/disable notifications
  - [ ] Allow user to mute specific chats

#### Testing Checklist
- [ ] User A sends message to User B (app backgrounded)
- [ ] User B receives push notification
- [ ] Notification shows in notification center
- [ ] Badge count updates on app icon
- [ ] Tap notification opens app to correct chat
- [ ] Badge clears when chat opened
- [ ] App killed: notification still received

#### Commit
`feat: implement background push notifications and badge counts`

---

### PR 24: Advanced Group Features

**Objective:** Group admin, member management, group settings.

#### Tasks

- [ ] Extend Group Chat model
  - [ ] Add `adminIDs: [userID]` (can have multiple admins)
  - [ ] Add `groupPictureURL: string`
  - [ ] Add `settings: { muteNotifications: boolean }`
- [ ] Implement group admin features
  - [ ] Designate creator as admin
  - [ ] Add "Make Admin" option in member list (admin only)
  - [ ] Add "Remove Member" option (admin only)
  - [ ] Add "Leave Group" option (all users)
  - [ ] If last admin leaves, promote random member
- [ ] Create group settings screen
  - [ ] Edit group name (admin only)
  - [ ] Upload group picture (admin only)
  - [ ] Mute notifications toggle
  - [ ] Leave group button
- [ ] Implement add members to existing group
  - [ ] "Add Members" button in member list (admin only)
  - [ ] Opens contact picker
  - [ ] On select, add to group memberIDs
  - [ ] Send system message: "User A added User B"
- [ ] Implement remove member
  - [ ] Admin can remove member
  - [ ] Update memberIDs in Firestore
  - [ ] Send system message: "User A removed User B"
- [ ] Add system messages
  - [ ] Message type: 'system'
  - [ ] Display differently (centered, gray, italic)
  - [ ] Examples: "User A created the group", "User B left", "User C was added"

#### Testing Checklist
- [ ] Group creator is admin
- [ ] Admin can add/remove members
- [ ] Admin can change group name and picture
- [ ] Non-admin cannot access admin features
- [ ] System messages display correctly
- [ ] Member list updates when members added/removed

#### Commit
`feat: implement advanced group features and admin controls`

---

### PR 25: Message Search

**Objective:** Search messages across all chats.

#### Tasks

- [ ] Create search screen
  - [ ] `app/search.js`:
    - [ ] Search bar at top
    - [ ] Results list below
- [ ] Implement search in SQLite
  - [ ] In `db/messageDb.js`:
    - [ ] `searchMessages(query)` - Full-text search on message text
    - [ ] Return messages with chatID, sender, snippet
    - [ ] Order by relevance or recency
- [ ] Create search result item component
  - [ ] Shows: sender name, message snippet (with query highlighted), chat name, timestamp
  - [ ] Tap to navigate to that message in chat
- [ ] Add search button to home screen
  - [ ] Header button to open search screen
- [x] Implement jump-to-message in chat
  - [x] When navigating from search result:
    - [x] Load chat (scrolls to recent messages)
    - [x] Highlight specific message briefly
- [ ] Add search filters (optional)
  - [ ] Filter by chat
  - [ ] Filter by sender
  - [ ] Filter by date range

#### Testing Checklist
- [ ] Search returns relevant messages
- [ ] Search is case-insensitive
- [ ] Tap result navigates to correct chat and message
- [ ] Message highlights when jumped to
- [ ] Search is fast (< 500ms for 1000+ messages)

#### Commit
`feat: implement message search across all chats`

---

## Phase 2C: AI Features (Post-Security)

**Prerequisites:** Choose a user persona from directions.md and implement all 5 required AI features + 1 advanced feature.

### PR 26: AI Infrastructure Setup

**Objective:** Set up AI integration with LLM provider and agent framework.

#### Tasks

- [ ] Choose LLM provider
  - [ ] OpenAI (GPT-4) OR Anthropic (Claude)
  - [ ] Create API key
  - [ ] Add to Cloud Functions environment variables
- [ ] Install AI SDK
  - [ ] In `functions/`: `npm install ai @ai-sdk/openai` (or `@ai-sdk/anthropic`)
  - [ ] OR install LangChain: `npm install langchain @langchain/openai`
- [ ] Create AI service in Cloud Functions
  - [ ] `functions/aiService.js`:
    - [ ] Initialize LLM client
    - [ ] Create helper functions for prompting
    - [ ] Implement function calling setup
- [ ] Create RAG pipeline
  - [ ] Function to retrieve conversation history from Firestore
  - [ ] Format as context for LLM
  - [ ] Implement chunking for long conversations
- [ ] Create AI callable function
  - [ ] `functions/index.js`:
    - [ ] Export `aiAssistant` callable function
    - [ ] Accept: userID, chatID, query
    - [ ] Return: AI response
- [ ] Test AI integration
  - [ ] Call from client
  - [ ] Verify LLM responds correctly

#### Testing Checklist
- [ ] Cloud Function deploys successfully
- [ ] Can call AI function from client
- [ ] LLM returns coherent responses
- [ ] RAG retrieves correct conversation history
- [ ] Function calling works (if implemented)

#### Commit
`feat: set up AI infrastructure with LLM and RAG pipeline`

---

### PR 27-31: Implement 5 Required AI Features for Chosen Persona

**Note:** These PRs depend on your chosen persona. Below are templates for each persona's required features.

#### Option A: Remote Team Professional

**PR 27: Thread Summarization**
- [ ] Add "Summarize" button to chat header
- [ ] On tap: fetch last N messages, send to LLM with prompt
- [ ] Display summary in modal or special message
- [ ] Cache summaries to reduce API calls

**PR 28: Action Item Extraction**
- [ ] Analyze conversation for action items (tasks, todos, deadlines)
- [ ] Display as list with checkboxes
- [ ] Allow export to calendar or reminders

**PR 29: Smart Search**
- [ ] Enhance search with semantic search using embeddings
- [ ] Natural language queries: "When did we discuss the deadline?"
- [ ] Return relevant messages even without exact keyword match

**PR 30: Priority Message Detection**
- [ ] Automatically flag important messages (urgent requests, questions directed at user)
- [ ] Show priority badge in chat list
- [ ] Separate section for priority messages

**PR 31: Decision Tracking**
- [ ] Detect decisions made in conversations
- [ ] "We decided to launch on Friday"
- [ ] Create decision log, show in sidebar or separate screen

#### Option B: International Communicator

**PR 27: Real-Time Translation (Inline)**
- [ ] Detect message language
- [ ] Translate to user's preferred language
- [ ] Show translation below original message
- [ ] Tap to toggle original/translated

**PR 28: Language Detection & Auto-Translate**
- [ ] Auto-detect when conversation switches languages
- [ ] Offer to translate all messages in that language
- [ ] Remember preference per contact

**PR 29: Cultural Context Hints**
- [ ] Analyze messages for cultural references, idioms
- [ ] Show tooltip with explanation
- [ ] Example: "Break a leg" → "Good luck (theater idiom)"

**PR 30: Formality Level Adjustment**
- [ ] Before sending, offer to adjust tone (formal/casual)
- [ ] Rewrite message with AI
- [ ] User can approve or edit

**PR 31: Slang/Idiom Explanations**
- [ ] Long-press message to get explanation
- [ ] LLM explains slang, idioms, colloquialisms
- [ ] Works for any language

#### Option C: Busy Parent/Caregiver

**PR 27: Smart Calendar Extraction**
- [ ] Detect dates, times, events in messages
- [ ] "Soccer practice on Saturday at 2pm"
- [ ] Suggest adding to calendar
- [ ] One-tap to create calendar event

**PR 28: Decision Summarization**
- [ ] For group chats (family, school parents), summarize decisions
- [ ] "We decided: potluck on Friday, everyone brings a dish"
- [ ] Show at top of chat or in summary view

**PR 29: Priority Message Highlighting**
- [ ] Flag messages that need response or action
- [ ] Questions directed at you, RSVP requests, deadlines
- [ ] Show priority badge

**PR 30: RSVP Tracking**
- [ ] Detect RSVP requests in group chats
- [ ] "Can you make it to the party?"
- [ ] Track who responded yes/no/maybe
- [ ] Show summary

**PR 31: Deadline/Reminder Extraction**
- [ ] Detect deadlines in messages
- [ ] "Field trip forms due by Wednesday"
- [ ] Create reminder, show in app or export to reminders

#### Option D: Content Creator/Influencer

**PR 27: Auto-Categorization**
- [ ] Classify incoming DMs: fan message, business inquiry, spam, urgent
- [ ] Use LLM to analyze and categorize
- [ ] Filter view by category

**PR 28: Response Drafting in Creator's Voice**
- [ ] Learn creator's writing style from past messages (RAG)
- [ ] Suggest responses to common questions
- [ ] User can edit before sending

**PR 29: FAQ Auto-Responder**
- [ ] Detect common questions
- [ ] Auto-respond with saved answer
- [ ] "Where can I buy your merch?" → Link
- [ ] User can review and approve auto-responses

**PR 30: Sentiment Analysis**
- [ ] Analyze fan messages for sentiment (positive, negative, neutral)
- [ ] Flag negative/concerning messages for review
- [ ] Show sentiment trends over time

**PR 31: Collaboration Opportunity Scoring**
- [ ] Detect business inquiries, collab requests
- [ ] Score based on: sender credibility, offer details, relevance
- [ ] Highlight high-value opportunities

---

### PR 32: Advanced AI Capability (Choose 1)

**Option A: Multi-Step Agent**
- [ ] Build autonomous agent that can perform multi-step tasks
- [ ] Example: Plan team offsite (check availability, suggest dates, book restaurant)
- [ ] Use function calling to interact with calendar, maps, etc.
- [ ] Agent reports progress and asks for confirmation at key steps

**Option B: Proactive Assistant**
- [ ] Agent monitors conversations and proactively suggests actions
- [ ] Example: Detects scheduling discussion, suggests meeting times
- [ ] Runs in background, sends notification when suggestion ready
- [ ] User can approve or dismiss

**Option C: Context-Aware Smart Replies**
- [ ] Learns user's communication style and frequent responses
- [ ] Suggests context-appropriate quick replies
- [ ] Adapts based on: sender, time of day, conversation topic, user's past responses
- [ ] Works across languages (for International Communicator)

**Option D: Intelligent Data Extraction**
- [ ] Extract structured data from conversations
- [ ] Example: Pull contact info, addresses, phone numbers, links, dates
- [ ] Store in user's personal knowledge base
- [ ] Searchable and exportable

---

### PR 33: AI Chat Interface

**Objective:** Dedicated AI assistant chat where users can query their messages.

#### Tasks

- [ ] Create special AI assistant chat
  - [ ] System chat (not a real user)
  - [ ] Icon: robot or sparkle
  - [ ] Always appears at top of chat list
- [ ] Build AI chat screen
  - [ ] Similar to regular chat, but messages are queries/responses
  - [ ] Input placeholder: "Ask me anything about your messages..."
- [ ] Implement AI query handling
  - [ ] User sends query: "What did Sarah say about the meeting?"
  - [ ] Send to Cloud Function with RAG context
  - [ ] LLM answers based on conversation history
  - [ ] Display answer in chat
- [ ] Add AI action buttons
  - [ ] Quick actions: "Summarize today's messages", "Show action items", "Translate last message"
  - [ ] Tap button sends pre-defined query
- [ ] Show sources
  - [ ] AI response includes source messages
  - [ ] Tap to jump to source message in original chat

#### Testing Checklist
- [ ] AI chat appears in chat list
- [ ] Can send queries and receive responses
- [ ] Responses are relevant and accurate
- [ ] Quick action buttons work
- [ ] Can navigate to source messages

#### Commit
`feat: implement AI chat interface for querying messages`

---

## Phase 2D: Production Polish

### PR 34: Performance Optimization

**Objective:** Optimize app for speed and efficiency.

#### Tasks

- [ ] Optimize Firestore queries
  - [ ] Add composite indexes where needed
  - [ ] Limit query results (pagination)
  - [ ] Use `limit()` for chat list and message list
- [ ] Implement message pagination
  - [ ] Load last 50 messages on chat open
  - [ ] Load more on scroll to top
  - [ ] Cache loaded messages
- [ ] Optimize image loading
  - [ ] Use image caching library: `expo-image`
  - [ ] Lazy load images as user scrolls
  - [ ] Load thumbnails first, full-res on tap
- [ ] Reduce re-renders
  - [ ] Memoize components with React.memo
  - [ ] Use useMemo and useCallback where appropriate
  - [ ] Optimize Zustand selectors
- [ ] Optimize SQLite queries
  - [ ] Add indexes on frequently queried columns
  - [ ] Batch inserts/updates
  - [ ] Use transactions for multi-row operations
- [ ] Reduce bundle size
  - [ ] Tree-shake unused dependencies
  - [ ] Use `expo-asset` for bundling large assets
  - [ ] Lazy load screens with React.lazy

#### Testing Checklist
- [ ] App startup time < 2 seconds
- [ ] Chat list loads instantly
- [ ] Message list scrolls smoothly (60fps)
- [ ] No jank when loading images
- [ ] Memory usage stable (no leaks)
- [ ] Bundle size < 50MB

#### Commit
`perf: optimize app performance and reduce bundle size`

---

### PR 35: End-to-End Encryption (E2E)

**Objective:** Implement E2E encryption for messages.

#### Tasks

- [ ] Choose encryption library
  - [ ] Signal Protocol (via `@signalapp/libsignal-client`)
  - [ ] OR simpler: `react-native-crypto` with AES
- [ ] Implement key exchange
  - [ ] Generate key pair for each user
  - [ ] Store public key in Firestore
  - [ ] Store private key securely (device keychain)
  - [ ] Implement Diffie-Hellman key exchange for 1:1 chats
- [ ] Encrypt messages before sending
  - [ ] In message service, encrypt text before writing to Firestore
  - [ ] Store encrypted text in Firestore
  - [ ] Store plaintext in local SQLite only
- [ ] Decrypt messages on receive
  - [ ] Fetch encrypted message from Firestore
  - [ ] Decrypt with shared key
  - [ ] Store plaintext in SQLite
  - [ ] Display in UI
- [ ] Handle group encryption
  - [ ] Generate group key
  - [ ] Encrypt with each member's public key
  - [ ] Members decrypt group key with private key
- [ ] Add E2E indicator
  - [ ] Show lock icon in chat header when E2E active
  - [ ] Show warning if E2E fails

#### Testing Checklist
- [ ] Messages encrypted in Firestore (cannot read in console)
- [ ] Messages decrypt correctly on recipient device
- [ ] Group messages encrypted for all members
- [ ] E2E works across app reinstalls (key backup/restore)

#### Commit
`feat: implement end-to-end encryption for messages`

---

### PR 36: Comprehensive Testing Suite

**Objective:** Add automated tests for critical functionality.

#### Tasks

- [ ] Set up Jest and React Native Testing Library
  - [ ] `npm install --save-dev jest @testing-library/react-native`
- [ ] Write unit tests
  - [ ] Test auth service functions
  - [ ] Test Firestore service functions
  - [ ] Test message queue logic
  - [ ] Test avatar utils
  - [ ] Test network status detection
- [ ] Write integration tests
  - [ ] Test full message send flow
  - [ ] Test offline queue processing
  - [ ] Test sync logic
- [ ] Write component tests
  - [ ] Test MessageBubble rendering
  - [ ] Test ChatListItem rendering
  - [ ] Test MessageInput behavior
- [ ] Set up E2E tests (optional, using Detox)
  - [ ] Test sign-up flow
  - [ ] Test login flow
  - [ ] Test send message flow
  - [ ] Test create chat flow
- [ ] Add CI/CD pipeline
  - [ ] GitHub Actions or similar
  - [ ] Run tests on every commit
  - [ ] Block merge if tests fail

#### Testing Checklist
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Test coverage > 70%
- [ ] CI/CD pipeline runs successfully

#### Commit
`test: add comprehensive test suite with CI/CD`

---

### PR 37: Accessibility (A11y)

**Objective:** Make app accessible to users with disabilities.

#### Tasks

- [ ] Add accessibility labels
  - [ ] Label all buttons and interactive elements
  - [ ] Use `accessibilityLabel` prop
- [ ] Add accessibility hints
  - [ ] Explain what happens when button tapped
  - [ ] Use `accessibilityHint` prop
- [ ] Support screen readers
  - [ ] Test with VoiceOver (iOS) and TalkBack (Android)
  - [ ] Ensure all content readable
- [ ] Support dynamic font sizes
  - [ ] Use `Text` components with dynamic sizing
  - [ ] Test with large text settings
- [ ] Add keyboard navigation
  - [ ] Ensure all actions accessible via keyboard (for users with motor disabilities)
- [ ] Support high contrast mode
  - [ ] Test in high contrast settings
  - [ ] Ensure text readable
- [ ] Add haptic feedback
  - [ ] Vibrate on message send, receive
  - [ ] Respect user's haptic settings

#### Testing Checklist
- [ ] App usable with VoiceOver/TalkBack
- [ ] All buttons have labels
- [ ] Supports large text sizes
- [ ] Supports high contrast mode
- [ ] Keyboard navigation works

#### Commit
`feat: improve accessibility with screen reader and keyboard support`

---

### PR 38: App Store / Play Store Preparation

**Objective:** Prepare app for public release.

#### Tasks

- [ ] Create app icons
  - [ ] Design icons for all sizes (iOS, Android)
  - [ ] Use `expo-icon` or design tool
- [ ] Create splash screen
  - [ ] Design splash screen
  - [ ] Configure in `app.json`
- [ ] Write app description
  - [ ] Short description (80 chars)
  - [ ] Full description (4000 chars)
  - [ ] List features, benefits
- [ ] Take screenshots
  - [ ] 5-8 screenshots for App Store
  - [ ] Show key features: chat list, message screen, AI features
  - [ ] Use multiple device sizes
- [ ] Create promo video (optional)
  - [ ] 30-second preview video
  - [ ] Show app in action
- [ ] Configure app privacy details
  - [ ] Data collected: email, messages, profile data
  - [ ] Data usage: app functionality
  - [ ] Privacy policy URL
- [ ] Set up app versioning
  - [ ] Version 1.0.0 for initial release
  - [ ] Follow semantic versioning
- [ ] Build production app
  - [ ] iOS: `eas build --platform ios`
  - [ ] Android: `eas build --platform android`
- [ ] Submit for review
  - [ ] iOS: Submit to App Store Connect
  - [ ] Android: Submit to Google Play Console

#### Deliverables
- [ ] App icons
- [ ] Screenshots
- [ ] App description
- [ ] Privacy policy
- [ ] Production builds (IPA, APK)

#### Commit
`chore: prepare app for App Store and Play Store release`

---

## Phase 2 Completion Checklist

Before considering Phase 2 complete:

### Security
- [ ] Firestore security rules implemented and tested
- [ ] Auth token refresh handling robust
- [ ] End-to-end encryption working (if implemented)

### Advanced Messaging
- [ ] Typing indicators work
- [ ] Profile pictures and image messages supported
- [ ] Message editing and deletion functional
- [ ] Message reactions implemented
- [ ] Background push notifications working
- [ ] Advanced group features (admin, member management)
- [ ] Message search functional

### AI Features
- [ ] All 5 required AI features implemented for chosen persona
- [ ] 1 advanced AI capability working
- [ ] AI chat interface functional
- [ ] AI features tested with real conversations
- [ ] AI responses are relevant and accurate

### Production Polish
- [ ] Performance optimized (fast, smooth, efficient)
- [ ] Error tracking and monitoring set up
- [ ] Comprehensive test suite passing
- [ ] Accessibility features implemented
- [ ] App Store / Play Store ready

### Documentation
- [ ] Updated README with all Phase 2 features
- [ ] API documentation for Cloud Functions
- [ ] User guide for AI features
- [ ] Privacy policy published

---

**Congratulations! You've built a production-ready messaging app with AI features. Ship it!** 🚀

