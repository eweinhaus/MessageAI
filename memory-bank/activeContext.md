# Active Context

## Current Status
**Phase**: PR 5 Complete - Home Screen & Chat List Implemented  
**Date**: October 20, 2025  
**Next Milestone**: MVP (Tuesday EOD)  
**Firebase Project**: MessageAI-dev

## What We Just Did
- ✅ **PR 1**: Project Setup & Firebase Configuration - COMPLETE
- ✅ **PR 2**: Firebase Authentication - COMPLETE
- ✅ **PR 3**: Firestore Schema & Network Detection - COMPLETE
- ✅ **PR 4**: SQLite Local Database & Sync Strategy - COMPLETE
- ✅ **PR 5**: Home Screen & Chat List - COMPLETE & TESTED ✅
  - Created utils/timeUtils.js for timestamp formatting and text truncation
  - Implemented components/ChatListItem.js with avatar, name, preview, timestamp
  - Built complete home screen (app/(tabs)/index.js) with:
    - Instant load from SQLite cache
    - Firestore real-time listeners (dual queries for 1:1 and group chats)
    - Pull-to-refresh functionality
    - Empty state with "Start Chatting" button
    - Loading states
  - Updated tab layout with styled header and "New Chat" button
  - Created placeholder screens for PR 6 and PR 7
  - All code compiles without linter errors
  - **Manual testing complete on physical device:**
    - ✅ Real-time updates from Firestore working
    - ✅ Chat list displays correctly with avatars and previews
    - ✅ Pull-to-refresh syncs data
    - ✅ Navigation works to placeholder screens

## Current Work Focus

### Immediate Next Steps
1. ✅ **PR 1**: Project Setup - DONE
2. ✅ **PR 2**: Firebase Authentication - DONE
3. ✅ **PR 3**: Firestore Schema & Network Detection - DONE
4. ✅ **PR 4**: SQLite Local Database & Sync Strategy - DONE
5. ✅ **PR 5**: Home Screen & Chat List - DONE
6. **PR 6**: Contact Picker & New Chat Creation (NEXT)
   - Fetch all users from Firestore
   - Create contact list with search
   - Handle 1:1 chat creation
   - Handle group chat creation with group name modal
   - Check for existing chats before creating duplicates

### Today's Goal
Complete **PR 6: Contact Picker & New Chat Creation** from task list.

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
1. **Time Constraint**: MVP deadline is aggressive (24 hours)
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

## What Needs Attention
1. **Contact Picker**: Need screen to browse users and create chats (PR 6)
2. **Chat Creation Logic**: Implement 1:1 and group chat creation with duplicate prevention (PR 6)
3. **Chat Detail Screen**: Message display with bubbles and real-time updates (PR 7)
4. **Message Input**: Text input component with send button (PR 8)
5. **Message Sending**: Implement full offline queue with retry logic (PR 8)

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

### PR 6 Checklist (Contact Picker & New Chat Creation)
- [ ] Fetch all users from Firestore (exclude current user)
- [ ] Create ContactListItem component
- [ ] Create contact picker screen with search
- [ ] Implement user selection (single or multiple)
- [ ] Handle 1:1 chat creation (check for existing chat first)
- [ ] Create GroupNameModal for group chats
- [ ] Handle group chat creation
- [ ] Test chat creation and navigation
- [ ] Commit: "feat: implement contact picker and new chat creation"

### Success Criteria for PR 6
- Contact list loads all registered users
- Search filters contacts correctly
- Can select 1 user and create 1:1 chat
- Duplicate 1:1 chat prevention works
- Can select 2+ users and create group chat
- Group name modal prompts for group name
- New chats appear in home screen immediately

## Context for Next Session
When resuming:
1. Home screen is fully functional with real-time updates
2. SQLite cache loads chats instantly
3. Navigation structure is in place (placeholders ready)
4. Need to implement contact picker and chat creation logic
5. Proceed to PR 6: Contact Picker & New Chat Creation

