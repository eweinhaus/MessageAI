# MessageAI

A React Native messaging application that combines production-quality messaging infrastructure with intelligent AI features powered by OpenAI GPT-4.

## 🎯 Project Overview

MessageAI is a real-time messaging app built with React Native and Firebase, enhanced with AI capabilities for remote team professionals. The app demonstrates:

- **Phase 1 (MVP - Complete)**: Production-grade messaging with offline-first architecture
- **Phase 2 (In Progress)**: AI features including thread summarization, action item extraction, smart search, priority detection, and decision tracking

## 🚀 Features

### MVP Features (Complete ✅)
- Real-time one-on-one and group chat
- Offline message queuing with automatic sync
- Message persistence (survives app restarts)
- Optimistic UI updates
- Read receipts and delivery status
- Online/offline presence tracking
- Typing indicators
- Foreground push notifications
- Email/password authentication

### AI Features (Phase 2 - In Development)
- 🧠 Thread Summarization (RAG pipeline)
- ✅ Action Item Extraction
- 🔍 Smart Semantic Search
- 🚨 Priority Detection
- 📋 Decision Tracking

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** v8 or higher (comes with Node.js)
- **Expo CLI**: `npm install -g expo-cli`
- **Firebase CLI**: `npm install -g firebase-tools`
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))
- **Firebase Project** (see setup below)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd MessageAI
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

### 3. Firebase Setup

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing: `MessageAI-dev`)
3. Enable the following services:
   - **Authentication** (Email/Password provider)
   - **Firestore Database**
   - **Cloud Functions**
   - **Cloud Messaging** (for push notifications)

#### Configure Firebase in App
1. In Firebase Console, go to Project Settings > General
2. Add a Web app and copy the configuration
3. Update `config/firebaseConfig.js` with your credentials

#### Login to Firebase CLI
```bash
firebase login
firebase use <your-project-id>
```

### 4. OpenAI API Setup

MessageAI uses OpenAI GPT-4 for AI features. You need to configure your API key for both local development and deployed Cloud Functions.

#### Step 1: Obtain OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key (starts with `sk-proj-...` or `sk-...`)

#### Step 2: Local Development Setup

Create a `.env` file in the **root directory**:

```bash
# /MessageAI/.env
OPENAI_API_KEY='sk-proj-...'
```

Create a `.env` file in the **functions directory**:

```bash
# /MessageAI/functions/.env
OPENAI_API_KEY='sk-proj-...'
```

⚠️ **Important**: These `.env` files are gitignored and should NEVER be committed to version control.

#### Step 3: Firebase Deployment Configuration

**⚠️ Note**: Firebase is deprecating `functions.config()` in March 2026. We use `.env` files for both local and deployed environments.

For Cloud Functions v2 (which this project uses), the `/functions/.env` file will be automatically uploaded during deployment. No additional configuration needed!

**Legacy method** (deprecated, but still works until March 2026):
```bash
firebase functions:config:set openai.api_key="sk-proj-..."
```

#### Step 4: Verify Configuration

Test that your OpenAI API key works:

```bash
cd functions
node -e "require('dotenv').config(); console.log('API Key:', process.env.OPENAI_API_KEY ? '✅ Found' : '❌ Not Found')"
cd ..
```

You should see: `API Key: ✅ Found`

### 5. Environment Variables Summary

After setup, you should have:

```
/MessageAI/
  ├── .env                    # Root .env (for app-level configs)
  │   └── OPENAI_API_KEY='sk-...'
  ├── functions/
  │   └── .env                # Functions .env (for Cloud Functions)
  │       └── OPENAI_API_KEY='sk-...'
  └── .gitignore              # Ensures .env files are not tracked
```

## 🏃 Running the App

### Start Development Server

```bash
npx expo start
```

This will open Expo Dev Tools. You can then:
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Scan QR code with Expo Go app on physical device

### Run Cloud Functions Locally (Emulator)

```bash
cd functions
npm run serve
```

This starts the Firebase emulator suite for local testing of Cloud Functions.

### Deploy Cloud Functions

```bash
cd functions
npm run deploy
# or
firebase deploy --only functions
```

**Note**: Your `/functions/.env` file will be automatically uploaded with Cloud Functions v2.

## 📁 Project Structure

```
/MessageAI/
├── app/                      # Expo Router screens
│   ├── (auth)/              # Authentication screens
│   ├── (tabs)/              # Main app tabs
│   ├── chat/                # Chat detail screens
│   └── contacts/            # Contact picker
├── components/              # Reusable UI components
├── services/                # Business logic (auth, firestore, messaging)
├── db/                      # SQLite local database
├── store/                   # Zustand state management
├── utils/                   # Helper functions
├── hooks/                   # Custom React hooks
├── config/                  # Firebase configuration
├── functions/               # Firebase Cloud Functions
│   ├── index.js            # Main Cloud Functions entry
│   ├── utils/              # AI utilities (Step 3+)
│   └── prompts/            # AI prompt templates (Step 3+)
├── memory-bank/            # Project context and documentation
└── planning/               # Project planning and tasks
```

## 🧪 Testing

### Create Test Users

Use the app to create test accounts:

```
Email: test1@example.com
Password: password123

Email: test2@example.com
Password: password123
```

Or use the script:

```bash
node scripts/createTestUser.js
```

### Test on Physical Devices

For best results, test on physical devices:
1. Install Expo Go app
2. Scan QR code from `npx expo start`
3. Test messaging between 2+ devices

## 🔐 Security Notes

- **Never commit `.env` files** - They contain sensitive API keys
- **Never commit Firebase service account keys**
- **Firestore security rules**: Currently open for development, will be secured in Phase 2
- **OpenAI API costs**: Monitor usage at [OpenAI Usage Dashboard](https://platform.openai.com/usage)

## 🐛 Troubleshooting

### OpenAI API Errors

**Error**: `Error: OpenAI API key not found`
- **Solution**: Verify `/functions/.env` exists and contains `OPENAI_API_KEY`

**Error**: `401 Unauthorized`
- **Solution**: API key is invalid. Generate a new one at platform.openai.com

**Error**: `429 Rate Limit Exceeded`
- **Solution**: You've hit OpenAI's rate limits. Wait or upgrade your plan

### Firebase CLI Errors

**Error**: `Authentication Error`
- **Solution**: Run `firebase login` to authenticate

**Error**: `Permission denied`
- **Solution**: Verify you're using the correct project with `firebase use <project-id>`

**Error**: `functions.config() deprecated warning`
- **Solution**: This is expected. We use `.env` files which are the modern approach

### Build/Deploy Errors

**Error**: `Cannot find module 'openai'`
- **Solution**: Run `npm install` in the `/functions` directory

**Error**: `.env file not found during deployment`
- **Solution**: Ensure `/functions/.env` exists. Cloud Functions v2 automatically uploads it

## 📚 Additional Documentation

- **Memory Bank**: See `/memory-bank/` for project context, patterns, and architecture
- **Planning**: See `/planning/` for PRD, task lists, and implementation guides
- **Scripts**: See `/scripts/README.md` for utility scripts (test users, data cleanup, etc.)

## 🎯 Current Status

- ✅ **MVP Complete**: All core messaging features working
- 🔄 **Phase 2 In Progress**: PR16 - AI Infrastructure Setup
  - ✅ Step 1: Dependencies installed
  - ✅ Step 2: OpenAI API credentials configured
  - 🔄 Step 3: AI utilities module (next)

## 📝 License

This is a sprint project for demonstration purposes.

## 🤝 Contributing

This is a personal sprint project. See `/memory-bank/` for development context.

---

**Built with**: React Native • Expo • Firebase • OpenAI GPT-4 • Langchain

**Last Updated**: October 22, 2025

