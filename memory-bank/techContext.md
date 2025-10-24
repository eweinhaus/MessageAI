# Technical Context

## Technology Stack

### Frontend / Mobile Client

#### React Native + Expo
- **Version**: Latest stable Expo SDK
- **Why**: Cross-platform (iOS/Android), fast development, hot reload
- **Development Tool**: Expo Go for testing
- **Production**: EAS Build for final builds

#### Expo Router
- **Purpose**: File-based navigation
- **Benefits**: 
  - Intuitive route structure (pages in app/ directory)
  - Deep linking built-in
  - Type-safe navigation
  - Web support ready

#### State Management: Zustand
- **Why Zustand over Redux/MobX**:
  - Minimal boilerplate (~1KB)
  - No provider wrappers
  - Works seamlessly with React hooks
  - Easy to debug and test
  - Supports middleware for persistence

#### Local Database: Expo SQLite
- **Purpose**: Offline-first data persistence
- **Use Cases**:
  - Message cache (instant UI load)
  - Offline message queue
  - Chat metadata cache
  - Sync status tracking
- **Schema**: Relational tables with indexes on chatID and timestamp

#### Network Detection: @react-native-community/netinfo
- **Purpose**: Monitor network connectivity
- **Capabilities**:
  - Detect online/offline transitions
  - Network type (WiFi, cellular, none)
  - Internet reachability checks
- **Integration**: Triggers queue processing on reconnect

#### Push Notifications: Expo Notifications
- **MVP Scope**: Foreground only
- **Phase 2**: Background/killed app notifications
- **Integration**: Works with Firebase Cloud Messaging (FCM)

### Backend / Cloud Services

#### Firebase Authentication
- **Method**: Google Sign-In
- **Features**:
  - OAuth 2.0 authentication
  - Session management
  - Token auto-refresh
  - onAuthStateChanged listener
  - Secure credential storage
- **User Flow**: Sign up → Login → Session persists → Auto-refresh tokens

#### Firebase Firestore
- **Role**: Source of truth for all data
- **Collections**:
  ```
  /users/{userID}
    - Profile, presence, FCM token
  
  /chats/{chatID}
    - Chat metadata (1:1 and groups)
    
  /chats/{chatID}/messages/{messageID}
    - Individual messages
  ```
- **Real-Time**: Uses onSnapshot listeners for live updates
- **Security**: Rules implemented in Phase 2 (PR 16)
- **Indexes**: Composite indexes for complex queries

#### Firebase Cloud Functions
- **Language**: Node.js 22 (JavaScript)
- **Runtime**: Cloud Functions v2 (2nd Gen)
- **Region**: us-central1
- **Functions**:
  1. **onMessageCreated** (Firestore trigger) ✅ DEPLOYED
     - Triggers when message written to `/chats/{chatID}/messages/{messageID}`
     - Gets recipient FCM tokens from Firestore
     - **Dual token support** (October 21, 2025):
       - Detects Expo push tokens (`ExponentPushToken[...]`)
       - Detects native FCM tokens
       - Routes to appropriate service automatically
     - Sends push notifications via:
       - **Expo Push Service** (exp.host API) for Expo Go
       - **Firebase Cloud Messaging** for standalone builds
     - Handles invalid tokens (removes from Firestore)
     - Logs delivery status and errors
     - Excludes sender from notification recipients
     - Supports both 1:1 and group chats
  
  2. **AI Functions** (Phase 2, callable)
     - aiAssistant: Process queries with LLM
     - translateMessage: Real-time translation
     - extractActionItems: Parse conversation for tasks
     - summarizeThread: Summarize last N messages
     - summarizeUnread: Global unread delta summarization (PR20)

#### Push Notifications (Dual System)
- **MVP**: Foreground notifications (in-app banner) ✅ COMPLETE
- **Architecture**: 
  - **Expo Go**: Uses Expo Push Service (exp.host API)
  - **Standalone**: Uses Firebase Cloud Messaging (FCM)
  - **Automatic Detection**: Cloud Function detects token type
- **Client Components**:
  - `services/notificationService.js` - Token registration and listeners
  - `components/NotificationBanner.js` - In-app UI with animations
  - `app/_layout.js` - Setup on app initialization
- **Features**:
  - Token registration on app startup
  - In-app banner (slide-in, auto-dismiss after 3s)
  - Tap-to-navigate to specific chat
  - Duplicate prevention (60s TTL)
  - Works with both Expo Go and native builds
- **Token Management**: 
  - Stored in user's Firestore document (`fcmToken` field)
  - Project ID: `12be9046-fac8-441c-aa03-f047cfed9f72`
- **Phase 2**: Background and killed app notifications

### Development Tools

#### Version Control: Git + GitHub
- **Branching Strategy**: Feature branches, PR-based workflow
- **Commit Convention**: Conventional commits (feat:, fix:, docs:, etc.)
- **Protected Branches**: Main branch requires PR reviews

#### Development Environment
- **Node.js**: v18+ required
- **npm**: Package manager
- **Expo CLI**: For running development server
- **Firebase CLI**: For deploying Cloud Functions

#### Testing Tools (Phase 2)
- **Unit Tests**: Jest + React Native Testing Library (Functions v2 handlers require `.call({data}, data, context)` invocation in tests; some internal traces may need harness shims.)
- **Integration Tests**: Firebase Emulators
- **E2E Tests**: Detox (optional)
- **CI/CD**: GitHub Actions

#### Monitoring & Error Tracking (Phase 2)
- **Error Tracking**: Sentry
- **Analytics**: Firebase Analytics
- **Performance**: Firebase Performance Monitoring

## Technical Constraints

### MVP Constraints

#### No Backend Code (Yet)
- Firebase handles all backend logic initially
- Cloud Functions added in PR 11 (push notifications)
- No custom server, no REST API

#### Text-Only Messages
- No images, videos, or file attachments
- No voice messages
- Plain text only
- Media support in Phase 2

#### Foreground Notifications Only
- Background notifications complex (requires native configuration)
- Foreground sufficient for MVP validation
- Full implementation in Phase 2

#### Initial-Based Avatars
- No profile picture uploads
- Generated from display name (e.g., "John Doe" → "JD")
- Consistent colors based on userID hash
- Profile pictures in Phase 2

#### No Typing Indicators (MVP)
- Adds complexity to presence system
- Not critical for MVP validation
- Implemented in Phase 2

### Platform Requirements

#### Minimum OS Versions
- **iOS**: 13.0+
- **Android**: API level 21+ (Android 5.0)

#### Device Capabilities Required
- Internet connection (WiFi or cellular)
- Push notification support
- Local storage (SQLite)

#### Not Required (MVP)
- Camera access
- Photo library access
- Contacts permission
- Location services

### Performance Targets

#### App Startup
- Cold start: < 3 seconds
- Warm start: < 1 second
- UI interactive: < 2 seconds

#### Message Delivery
- Good network: < 2 seconds end-to-end
- Poor network (3G): < 10 seconds
- Offline queue: < 5 seconds after reconnect

#### UI Responsiveness
- Message input: < 16ms response (60fps)
- Scroll performance: Smooth 60fps
- No jank on image load

#### Data Sync
- Initial sync on app launch: < 5 seconds
- Incremental sync: < 1 second per message
- Full chat history load: < 3 seconds

### Scalability Considerations

#### Current Scale (MVP)
- Expected users: 2-10 (testing/demo)
- Messages per user: < 1000
- Active chats per user: < 10
- Group size: 3-10 members

#### Phase 2 Scale
- Expected users: 100-1000
- Messages per user: < 10,000
- Active chats per user: < 50
- Group size: 3-50 members

#### Firestore Cost Optimization
- Read from SQLite cache first
- Use listeners efficiently (unsubscribe when not needed)
- Throttle presence updates (max 1 per 30s)
- Pagination for large chat histories
- Composite indexes to reduce query cost

## Development Setup

### Prerequisites
```bash
# Node.js (v18+)
node --version  # v18.0.0+

# npm
npm --version   # 8.0.0+

# Expo CLI (global)
npm install -g expo-cli

# Firebase CLI (for Cloud Functions)
npm install -g firebase-tools
```

### Project Initialization
```bash
# Create Expo project
npx create-expo-app@latest messageai --template blank

# Navigate to project
cd messageai

# Install dependencies
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npx expo install firebase
npx expo install expo-sqlite
npx expo install zustand
npx expo install expo-notifications expo-device
npm install @react-native-community/netinfo
npm install react-native-uuid
```

### Firebase Setup
1. Create Firebase project at console.firebase.google.com (Project: "MessageAI-dev")
2. Enable services:
   - Authentication (Google provider)
   - Firestore Database
   - Cloud Messaging (iOS and Android)
3. Add web app, copy config credentials
4. Create `config/firebaseConfig.js` with credentials
5. Initialize Firebase in app

### Environment Variables
```bash
# Create .env file
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Add to .gitignore
.env
```

### Running Development Server
```bash
# Start Expo development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android

# Run on physical device via Expo Go
# Scan QR code with Expo Go app
```

### Testing on Physical Devices
1. Install Expo Go app (iOS/Android)
2. Ensure device on same network as development machine
3. Scan QR code from Expo Dev Tools
4. App loads and hot reloads on code changes

### Deploying Cloud Functions
```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Deploy to Firebase
firebase deploy --only functions

# View logs
firebase functions:log
```

## Dependencies

### Core Dependencies (MVP)
```json
{
  "expo": "~XX.0.0",
  "react": "XX.X.X",
  "react-native": "XX.X.X",
  "expo-router": "~X.X.X",
  "firebase": "^10.X.X",
  "expo-sqlite": "~XX.X.X",
  "zustand": "^4.X.X",
  "expo-notifications": "~XX.X.X",
  "@react-native-community/netinfo": "^11.X.X",
  "react-native-uuid": "^2.X.X"
}
```

### Dev Dependencies
```json
{
  "@babel/core": "^7.X.X",
  "typescript": "^5.X.X" (optional)
}
```

### Cloud Functions Dependencies
```json
{
  "firebase-functions": "^4.X.X",
  "firebase-admin": "^12.X.X"
}
```

### Phase 2 Dependencies (AI)
```json
{
  "ai": "^X.X.X",
  "@ai-sdk/openai": "^X.X.X",
  "langchain": "^X.X.X",
  "@langchain/openai": "^X.X.X"
}
```

## Known Issues & Limitations

### Current Limitations (By Design)
1. **Foreground notifications only** - Background requires native config (Phase 2)
2. **Text-only messages** - No media support yet
3. **No message editing/deletion** - Deferred to Phase 2
4. **No typing indicators** - Adds complexity
5. **Initial-based avatars** - No profile pictures yet
6. **Firestore forbids undefined values** - Always normalize/sanitize objects before writes (conditional assignments or JSON stringify/parse) to avoid errors.
7. **AI cache envelope** - Use `{ type, result, metadata }` for AI caches; for user-scoped caches, use `userId` as the key and access data via `cached.result.*`.

### Recently Completed (October 21, 2025)
1. ✅ **Foreground push notifications** - Working with dual token support
2. ✅ **Online/offline presence** - Heartbeat + staleness detection
3. ✅ **Read receipts** - Viewability-based tracking
4. ✅ **Delivery status** - Full message lifecycle tracking
5. ✅ **Offline queue** - Automatic retry with exponential backoff

### Common Issues (To Watch For)
1. **SQLite initialization timing** - Must complete before first read
2. **Listener cleanup** - Memory leaks if not unsubscribed
3. **Network race conditions** - Handle rapid online/offline transitions
4. **Token expiry** - Implement auto-refresh (PR 17)
5. **Queue processing on crash** - Test thoroughly

### Platform-Specific Quirks
- **iOS**: Push notification permissions required explicitly
- **Android**: Notification channels must be configured
- **Expo Go**: Limited to Expo SDK features (no custom native code)

## Future Technical Debt

### To Address in Phase 2
1. Firestore security rules (currently wide open)
2. Message pagination (loading all messages per chat)
3. Image compression and thumbnails
4. Full-text search (currently basic SQL LIKE)
5. End-to-end encryption
6. Background task handling
7. Offline media sync
8. Voice/video calls (future)

### Nice-to-Haves
1. React Native (bare) for more control
2. Custom native modules for performance
3. WebSocket fallback for real-time sync
4. CDN for media files
5. Redis cache for Cloud Functions
6. GraphQL for flexible queries

