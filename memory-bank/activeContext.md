# Active Context

## Current Status
**Phase**: PR 7 Implementation Complete - Testing & Debugging  
**Date**: October 21, 2025  
**Next Milestone**: PR 7 Manual Testing, then PR 8 (Message Sending)  
**Firebase Project**: MessageAI-dev

## Recent Fixes (October 21, 2025)
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
- ✅ **PR 6**: Contact Picker & New Chat Creation - COMPLETE (awaiting manual tests) ⏳
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
6. ✅ **PR 6**: Contact Picker & New Chat Creation - DONE (needs manual testing)
7. **PR 7**: Chat Detail Screen & Message Display (NEXT)
   - Create MessageBubble component
   - Create MessageList component
   - Build chat detail screen with Firestore listener
   - Display messages in correct order with proper styling

### Today's Goal
Test **PR 6** on physical device, then proceed to **PR 7: Chat Detail Screen & Message Display**.

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
1. **Manual Testing PR 6**: Test contact picker and chat creation on physical device with multiple users
2. **Chat Detail Screen**: Message display with bubbles and real-time updates (PR 7)
3. **Message Input**: Text input component with send button (PR 8)
4. **Message Sending**: Implement full offline queue with retry logic (PR 8)
5. **Read Receipts**: Track and display message read status (PR 9)

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
1. PR 6 fully implemented - contact picker and chat creation complete
2. Users can create 1:1 and group chats with duplicate prevention
3. Optimistic UI updates when creating chats
4. Chat detail screen placeholder ready to be replaced
5. Ready to implement PR 7: Chat Detail Screen & Message Display
6. Need to test PR 6 on physical device with multiple test users

