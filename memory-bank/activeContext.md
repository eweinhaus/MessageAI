# Active Context

## Current Status
**Phase**: PR 4 Complete - SQLite Database & Sync Strategy Implemented  
**Date**: October 20, 2025  
**Next Milestone**: MVP (Tuesday EOD)  
**Firebase Project**: MessageAI-dev

## What We Just Did
- ✅ **PR 1**: Project Setup & Firebase Configuration - COMPLETE
- ✅ **PR 2**: Firebase Authentication - COMPLETE
- ✅ **PR 3**: Firestore Schema & Network Detection - COMPLETE
- ✅ **PR 4**: SQLite Local Database & Sync Strategy - COMPLETE
  - Created db/database.js with schema initialization (messages & chats tables)
  - Implemented db/messageDb.js with 11 CRUD functions for SQLite operations
  - Built utils/syncManager.js for bidirectional Firestore ↔ SQLite sync
  - Created utils/offlineQueue.js skeleton (full implementation in PR8)
  - Integrated database initialization in root layout with loading states
  - Set up automatic sync on app startup and network reconnect
  - Implemented offline-first architecture: SQLite cache + Firestore source of truth
  - All code compiles without linter errors

## Current Work Focus

### Immediate Next Steps
1. ✅ **PR 1**: Project Setup - DONE
2. ✅ **PR 2**: Firebase Authentication - DONE
3. ✅ **PR 3**: Firestore Schema & Network Detection - DONE
4. ✅ **PR 4**: SQLite Local Database & Sync Strategy - DONE
5. **PR 5**: Home Screen & Chat List (NEXT)
   - Create Avatar component
   - Create ChatListItem component
   - Build home screen with chat list
   - Set up Firestore real-time listeners
   - Implement pull-to-refresh
   - Add new chat button

### Today's Goal
Complete **PR 5: Home Screen & Chat List** from task list.

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

## What Needs Attention
1. **UI Components**: Need to build Avatar, ChatListItem, and home screen
2. **Real-time Listeners**: Need to set up Firestore onSnapshot for live updates
3. **Contact Picker**: Need screen to browse users and create chats
4. **Message Display**: Need chat detail screen with message bubbles
5. **Message Sending**: Need to implement full offline queue in PR8

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

### PR 5 Checklist (Home Screen & Chat List)
- [ ] Create Avatar component with initials and colors
- [ ] Create ChatListItem component with preview
- [ ] Build home screen with FlatList
- [ ] Set up Firestore real-time listeners for chats
- [ ] Implement pull-to-refresh
- [ ] Add new chat button navigation
- [ ] Test real-time updates
- [ ] Commit: "feat: implement home screen with chat list"

### Success Criteria for PR 5
- Home screen displays chat list (even if empty)
- Chats load instantly from SQLite cache
- Firestore listener updates UI in real-time
- Pull-to-refresh triggers manual sync
- New chat button navigates to contact picker
- Avatar displays correct initials and colors

## Context for Next Session
When resuming:
1. SQLite database is initialized and ready
2. Sync manager loads data on startup
3. Zustand chatStore is populated from SQLite
4. Need to build UI components to display the data
5. Proceed to PR 5: Home Screen & Chat List

