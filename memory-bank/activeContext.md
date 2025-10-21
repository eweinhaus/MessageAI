# Active Context

## Current Status
**Phase**: PR 12 Complete - Basic Group Chat Polish ✅  
**Date**: October 21, 2025  
**Next Milestone**: PR 13 (App Lifecycle & Crash Recovery)  
**Firebase Project**: MessageAI-dev

## Recent Accomplishments (October 21, 2025)
- ✅ **PR 12: Basic Group Chat Polish - COMPLETE** 🎉
  - ✅ Added avatar display for group message senders (32px, left-aligned)
  - ✅ Consecutive message grouping with avatar spacer
  - ✅ Member sorting: online first, then alphabetical
  - ✅ Real-time sort updates on presence changes
  - ✅ Gray dot indicators for offline members
  - ✅ Dynamic group initials from first 2 members in header
  - ✅ Member count displayed in group header
  - ✅ Comprehensive documentation created (md_files/PR12_*.md)
- ✅ **PR 11: Foreground Push Notifications - COMPLETE & TESTED** 🎉
  - ✅ Cloud Function supports both Expo push tokens and FCM tokens
  - ✅ Automatic token type detection (`ExponentPushToken[...]` vs native FCM)
  - ✅ Dual notification routing (Expo Push Service + Firebase Cloud Messaging)
  - ✅ In-app notification banner with slide-in animation
  - ✅ Tap-to-navigate functionality
  - ✅ Auto-dismiss after 3 seconds
  - ✅ Token registration on app startup
  - ✅ Tested and working on physical devices
  - ✅ Comprehensive testing guide created (md_files/PR11_TESTING_GUIDE.md)
- ✅ **Fixed presence tracking issues** (Critical bug fixes):
  - ✅ Fixed "Just now" showing instead of "Online" for current user
  - ✅ Fixed force-quit apps showing "Online" indefinitely
  - ✅ Added heartbeat system (25s interval) to keep presence fresh
  - ✅ Added staleness detection (45s timeout) for reliable offline detection
  - ✅ Updated all UI components to prioritize `isOnline` flag
  - ✅ Created comprehensive testing guides
- ✅ Fixed infinite loop in MessageList (Zustand selector)
- ✅ Fixed SQLite error with try-catch wrapper
- ✅ Added SafeAreaView to ALL screens (Login, Contact Picker, Home, Chat Detail)
- ✅ Added validation to skip invalid user documents in Firestore
- ✅ Fixed FlatList key prop warnings with fallback keyExtractor
- ✅ Fixed timestamp display (was showing "undefined NaN, NaN")
- ✅ Added prominent FAB (Floating Action Button) to contact picker
- ✅ Updated systemPatterns.md with UI responsiveness guidelines

## What We Just Did
- ✅ **PR 1**: Project Setup & Firebase Configuration - COMPLETE
- ✅ **PR 2**: Firebase Authentication - COMPLETE
- ✅ **PR 3**: Firestore Schema & Network Detection - COMPLETE
- ✅ **PR 4**: SQLite Local Database & Sync Strategy - COMPLETE
- ✅ **PR 5**: Home Screen & Chat List - COMPLETE & TESTED ✅
- ✅ **PR 6**: Contact Picker & New Chat Creation - COMPLETE ✅
- ✅ **PR 7**: Chat Detail Screen & Message Display - COMPLETE ✅
- ✅ **PR 8**: Send Message with Optimistic UI & Offline Queue - COMPLETE & TESTED ✅
- ✅ **PR 9**: Read Receipts & Delivery Status - COMPLETE ✅
- ✅ **PR 10**: Online/Offline Presence - COMPLETE ✅
- ✅ **PR 11**: Foreground Push Notifications - COMPLETE & TESTED ✅
- ✅ **PR 12**: Basic Group Chat Polish - COMPLETE ✅
  - Modified components/MessageBubble.js:
    - Added Avatar import and rendering for group messages
    - Avatar displays for first message from each sender (32px, left-aligned)
    - Avatar spacer for consecutive grouped messages
    - New styles: messageRow, avatarWrapper, avatarSpacer, messageContent
  - Modified app/chat/members/[chatId].js:
    - Added member sorting (online first, then alphabetical)
    - Sorting maintained on real-time presence updates
    - Added gray dot indicators for offline members
    - Refactored status indicator styles (statusIndicator, onlineIndicator, offlineIndicator)
  - Modified components/ChatHeader.js:
    - Created getGroupInitials() helper function
    - Replaced generic people icon with dynamic initials
    - Shows first letter of first 2 group members
    - New styles: groupAvatarWrapper, groupAvatar, groupInitials
  - Created comprehensive documentation:
    - md_files/PR12_IMPLEMENTATION_SUMMARY.md - Full implementation details
    - md_files/PR12_TESTING_GUIDE.md - 12 comprehensive test scenarios
  - Lines of Code: ~95 added/modified
  - No linter errors
  - Status: Implementation complete, manual testing pending
- ✅ **PR 11**: Foreground Push Notifications - COMPLETE & TESTED (see above for details)
- ✅ **PR 8**: Send Message with Optimistic UI & Offline Queue - COMPLETE & TESTED
  - Created MessageInput component (components/MessageInput.js) with:
    - Multiline text input (expands up to 4 lines, max 2000 chars)
    - Send button with offline detection
    - Disabled state when offline or text empty
    - Network status integration
  - Created message sending service (services/messageService.js) with:
    - `sendMessage()` - optimistic UI with SQLite → Zustand → Firestore flow
    - `writeToFirestore()` - handles Firestore writes with error handling
    - `retryFailedMessage()` - manual retry for failed messages
  - Completed offline queue processor (utils/offlineQueue.js) with:
    - Exponential backoff retry logic (1s, 2s, 4s, 8s, 16s, max 30s)
    - Max 5 retry attempts before marking failed
    - Sequential message processing to preserve order
    - Network state listener for automatic processing on reconnect
    - Prevention of concurrent processing
  - Enhanced MessageBubble component with:
    - Retry button for failed messages (red button below bubble)
    - Failed state styling (⚠ icon in red)
    - Delivery status icon display (○ sending, ✓ sent, ✓✓ delivered/read, ⚠ failed)
  - Integrated into ChatDetailScreen with:
    - MessageInput at bottom with KeyboardAvoidingView
    - handleSendMessage callback
    - Platform-specific keyboard behavior (iOS padding, Android resize)
  - Added color constants: ERROR_COLOR and BACKGROUND_COLOR to constants/colors.js
  - Network listener already wired in app/_layout.js (line 82-101)
  - Created comprehensive testing guide (md_files/PR8_TESTING_GUIDE.md)
  - ~600+ lines of code added
  - No linter errors
- ✅ **PR 9**: Read Receipts & Delivery Status - COMPLETE (October 21, 2025)
  - Modified `app/chat/[chatId].js`:
    - Added delivery status tracking in Firestore listener (lines 90-97)
    - Automatically marks received messages as "delivered"
    - Normalizes readBy arrays from Firestore
  - Modified `components/MessageList.js`:
    - Added viewability tracking with `onViewableItemsChanged` callback
    - Implemented debouncing (500ms timeout) for read receipts
    - Local Set state to prevent duplicate marking
    - Configuration: 60% visible, 300ms minimum view time
    - Only marks other users' messages (not own messages)
    - Imports `markMessageAsRead` from firestore service
  - Modified `components/MessageBubble.js`:
    - Updated to accept and display `readBy` array
    - Blue checkmark styling for read messages (#2196F3, bold)
    - Enhanced `getDeliveryStatusIcon()` function to handle read state
    - Added `deliveryStatusRead` style
  - Created `md_files/PR9_TESTING_GUIDE.md`:
    - 10 comprehensive test scenarios
    - Covers 1:1 chats, group chats, offline sync, debouncing, edge cases
    - Requires 2+ physical devices for testing
  - Delivery status labels:
    - "Sending" (gray)
    - "Sent" (gray)
    - "Delivered" (gray)
    - "Read" (blue, bold)
  - Leveraged existing infrastructure (no changes needed):
    - `services/firestore.js` - `markMessageAsRead()` already implemented
    - `store/messageStore.js` - `markAsRead()` already implemented
    - `db/messageDb.js` - readBy stored as JSON in SQLite
  - ~150 lines of code added
  - No linter errors
  - **Status**: Implementation complete, manual testing pending

### PR 6 Implementation Details (for reference)
  - Created components/ContactListItem.js with avatar, name, email, selection state
  - Created components/GroupNameModal.js with validation and error handling
  - Implemented full contact picker screen (app/contacts/newChat.js) with:
    - User fetching from Firestore (getAllUsers already existed)
    - Search bar filtering by name and email (case-insensitive)
    - Multi-select functionality with visual feedback
    - Selection counter and type indicator (1:1 vs group)
    - Dynamic "Next" button enabled only when users selected
    - 1:1 chat creation with duplicate prevention
    - Group chat creation with name validation
    - Optimistic UI updates (write to SQLite + Zustand immediately)
    - Loading and empty states
  - Enhanced chat detail placeholder to show correct participant names
  - All code compiles without linter errors

## Current Work Focus

### Immediate Next Steps
1. ✅ **PR 1**: Project Setup - DONE
2. ✅ **PR 2**: Firebase Authentication - DONE
3. ✅ **PR 3**: Firestore Schema & Network Detection - DONE
4. ✅ **PR 4**: SQLite Local Database & Sync Strategy - DONE
5. ✅ **PR 5**: Home Screen & Chat List - DONE
6. ✅ **PR 6**: Contact Picker & New Chat Creation - DONE
7. ✅ **PR 7**: Chat Detail Screen & Message Display - DONE
8. ✅ **PR 8**: Send Message with Optimistic UI & Offline Queue - DONE
9. ✅ **PR 9**: Read Receipts & Delivery Status - DONE
10. ✅ **PR 10**: Online/Offline Presence - DONE
11. ✅ **PR 11**: Foreground Push Notifications - DONE
12. ✅ **PR 12**: Basic Group Chat Polish - DONE
13. **PR 13**: App Lifecycle & Crash Recovery (NEXT)
    - Handle app backgrounding and foreground
    - Implement queue recovery on startup
    - Add retry logic with exponential backoff
    - Add logging for debugging

### Today's Goal
**PR 12 complete!** 🎉 Ready to proceed to **PR 13: App Lifecycle & Crash Recovery**.

## Active Decisions & Considerations

### Tech Stack Confirmed
- **Frontend**: React Native with Expo
- **Routing**: Expo Router (file-based navigation)
- **State Management**: Zustand
- **Local Database**: Expo SQLite
- **Backend**: Firebase (Firestore, Auth, Cloud Functions, FCM)
- **Network Detection**: @react-native-community/netinfo
- **Authentication**: Email/Password (primary), Google OAuth (post-MVP)

### Recent Key Decisions

#### Authentication Strategy Change (PR 2)
**Decision**: Use Email/Password authentication for MVP; defer Google OAuth to post-MVP Phase 2

**Rationale**:
- Google OAuth consent screen setup proved time-consuming during MVP sprint
- Email/Password auth is simpler and unblocks development immediately
- Core messaging features are higher priority than OAuth polish
- Google OAuth can be added post-MVP without affecting existing users
- Both auth methods can coexist (users can link accounts later)

**Implementation**:
- Created complete Email/Password auth flow with sign-up/sign-in toggle
- Google OAuth code remains in codebase but unused
- Documentation preserved in `planning/md_files/` for future implementation

**Impact**:
- ✅ Unblocked PR 2 completion, can proceed to PR 3
- ✅ Users can create accounts and test immediately
- ⚠️ Will need to add Google OAuth back post-MVP (estimated 2-3 hours)
- ⚠️ Firestore security rules currently open (will secure in PR 16)

#### Firestore Security Rules (Temporary)
**Decision**: Open Firestore to all authenticated users for MVP development

**Current Rules**:
```javascript
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

**Rationale**:
- Unblocks rapid development and testing
- Sufficient security for MVP testing phase (no production users yet)
- Will implement proper granular rules in PR 16

**Next Steps for Production**:
- PR 16 will add proper rules (users can only read/write their own data)
- Will implement chat participant validation
- Will add rate limiting and abuse prevention

### Architecture Approach
**Offline-First with Firestore as Source of Truth**:
- SQLite serves as read cache + write queue
- Firestore is authoritative source for all data
- On conflict, Firestore always wins
- Optimistic UI updates for instant feedback

### Key Design Decisions

#### Message Sync Strategy
```
Send Flow:
1. Write to SQLite immediately (syncStatus: 'pending')
2. Show in UI instantly (optimistic)
3. Async write to Firestore
4. On success: Update SQLite (syncStatus: 'synced')
5. Update UI with confirmation

Receive Flow:
1. Firestore listener fires
2. Write to SQLite
3. Update Zustand state
4. UI re-renders automatically
```

#### Network Handling
- Use NetInfo for connection detection
- Show persistent banner when offline
- Disable send button while offline
- Auto-process queue on reconnect
- Exponential backoff for retries (1s, 2s, 4s, 8s, 16s, max 30s)
- Max 5 retry attempts, then mark as failed

#### Presence Tracking
- Update on app foreground/background
- Use Firestore onDisconnect() handlers
- Throttle updates (max 1 per 30 seconds)
- Track in /users/{userID} document

## Blockers & Risks

### Current Blockers
None yet - just starting!

### Potential Risks
1. **Time Constraint**: Somewhat constrained for MVP
   - Mitigation: Follow task list strictly, no scope creep
   - Priority: Core messaging over polish

2. **Firebase Setup Complexity**: First-time setup can be tricky
   - Mitigation: Follow documentation carefully
   - Test connection early

3. **Offline Sync Complexity**: Most challenging technical aspect
   - Mitigation: Build incrementally, test after each PR
   - Start with simple cases, handle edge cases later

4. **Testing on Physical Devices**: Emulators don't represent real behavior
   - Mitigation: Test on physical device from day 1
   - Use Expo Go for quick iteration

## What's Working
- ✅ Project setup complete with all dependencies installed
- ✅ Firebase configured and connected
- ✅ Email/Password authentication working
- ✅ Firestore schema and service layer complete
- ✅ Network detection with offline banner
- ✅ SQLite database with full CRUD operations
- ✅ Sync manager for offline-first architecture
- ✅ Automatic data persistence and recovery
- ✅ App lifecycle handling (startup, background, reconnect)
- ✅ Home screen with real-time chat list (tested on physical device)
- ✅ Pull-to-refresh functionality
- ✅ Navigation to chat detail and new chat screens
- ✅ Contact picker with search functionality
- ✅ 1:1 chat creation with duplicate prevention
- ✅ Group chat creation with name validation
- ✅ Optimistic UI updates when creating chats

## What Needs Attention
1. **Group Chat Polish**: Improve group chat UX (PR 12 - NEXT)
2. **App Lifecycle**: Handle crash recovery (PR 13)
3. **UI Polish & Error Handling**: Comprehensive error states (PR 14)
4. **Testing & Documentation**: Final polish before MVP complete (PR 15)

## Questions to Resolve
1. **Persona Selection**: Which user persona will we target for Phase 2 AI features?
   - Can decide after MVP is complete
   - Options: Remote Team Professional, International Communicator, Busy Parent, Content Creator

2. **Testing Strategy**: How will we test with 2+ devices?
   - Expo Go on multiple devices
   - Create test user accounts
   - Test offline scenarios with airplane mode

3. **Demo Approach**: How to capture demo video?
   - Screen recording on devices
   - Show split-screen for real-time sync
   - Record offline scenarios clearly

## Next Session Planning

### PR 7 Checklist (Chat Detail Screen & Message Display)
- [ ] Create MessageBubble component (own vs other styling)
- [ ] Create MessageList component with FlatList
- [ ] Build chat detail screen with proper header
- [ ] Set up Firestore listener for messages
- [ ] Load messages from SQLite on mount
- [ ] Display messages in correct order (oldest to newest)
- [ ] Handle message grouping (consecutive same sender)
- [ ] Show sender info in group chats
- [ ] Create group members screen (basic)
- [ ] Test message display and real-time updates
- [ ] Commit: "feat: implement chat detail screen with message display"

### Success Criteria for PR 7
- Chat detail screen loads for both 1:1 and group chats
- Messages display in correct order
- Own messages align right with blue bubble
- Other messages align left with gray bubble
- Sender name and avatar show in group chats
- Message grouping works correctly
- Empty state shows when no messages

## Context for Next Session
When resuming:
1. **PR 12 fully complete!** 🎉 - Group chat polish implemented
2. Key implementation details:
   - ✅ Avatar display for group message senders (MessageBubble.js)
   - ✅ Member sorting with real-time updates (GroupMembersScreen)
   - ✅ Offline status indicators (gray dots)
   - ✅ Dynamic group initials in header (ChatHeader.js)
   - ✅ Comprehensive testing guide (md_files/PR12_TESTING_GUIDE.md)
3. **Core messaging + group features complete** - MVP nearly done!
4. Ready to implement **PR 13: App Lifecycle & Crash Recovery**
5. 3 PRs remaining for MVP completion (PR 13-15)
6. Next focus: App lifecycle handling, crash recovery, and queue processing

