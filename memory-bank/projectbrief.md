# MessageAI - Project Brief

## Overview
MessageAI is a React Native messaging application that combines production-quality messaging infrastructure (similar to WhatsApp) with intelligent AI features powered by LLMs. The project is a one-week sprint with a hard MVP deadline followed by AI feature development.

## Core Objectives

### Primary Goal
Build a reliable, real-time messaging app that handles online/offline scenarios gracefully, then enhance it with AI capabilities tailored to a specific user persona.

### Success Criteria
1. **MVP (24-hour hard gate)**: Production-quality messaging infrastructure with:
   - One-on-one and group chat (3+ users)
   - Real-time message delivery
   - Message persistence (survives app restarts)
   - Optimistic UI updates
   - Online/offline status indicators
   - Read receipts
   - Foreground push notifications
   - User authentication

2. **Phase 2**: AI features for chosen persona (5 required + 1 advanced)

## Philosophy
**"A simple, reliable messaging app with truly useful AI features beats any feature-rich app with flaky message delivery or gimmicky AI."**

## Key Scope Decisions

### MVP Includes ✅
- Text-only messaging
- Initial-based avatars
- Basic group chat
- Online status (no typing indicators)
- Foreground push notifications
- Offline message queuing
- Message persistence (SQLite + Firestore)
- Optimistic UI updates

### MVP Excludes ❌ (Deferred to Phase 2)
- Background push notifications
- Typing indicators
- Profile picture uploads
- Image/media messages
- Message editing/deletion
- Message reactions
- All AI features

## Project Timeline
- **MVP Deadline**: Tuesday EOD (24 hours from start)
- **Early Submission**: Friday (4 days)
- **Final Submission**: Sunday (7 days)

## Target Metrics (MVP)
- **Message Delivery Rate**: 100% (no lost messages)
- **Delivery Time**: < 2 seconds on good network
- **Offline Reliability**: Messages queue and send when connectivity returns
- **App Stability**: Zero message loss on crash/restart
- **Push Notification Delivery**: 90%+ in foreground
- **Read Receipt Accuracy**: Reflects actual user engagement

## Persona Selection (Phase 2)
Must choose ONE persona for AI features:
1. **Remote Team Professional** - Drowning in threads, needs summarization
2. **International Communicator** - Language barriers, needs translation
3. **Busy Parent/Caregiver** - Schedule juggling, needs calendar extraction
4. **Content Creator/Influencer** - Hundreds of DMs, needs categorization

Each persona requires 5 core AI features + 1 advanced capability.

## Non-Negotiables
1. **Reliability over features** - Message delivery must be 100% reliable
2. **Offline support** - App must function gracefully offline
3. **Data persistence** - No data loss on crash/restart
4. **Real-time sync** - Messages appear within 2 seconds
5. **Test on physical devices** - Simulators don't represent real performance

## Deliverables
1. GitHub repository with comprehensive README
2. Demo video (5-7 minutes) showing all features
3. Deployed application (Expo Go link)
4. Persona Brainlift (1-page document)
5. Social post (X/LinkedIn with demo)

