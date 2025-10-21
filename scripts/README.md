# Firebase Test User Setup

## Quick Method: Use the App

The easiest way is to create users directly in the app:

1. Start the app: `npx expo start --ios`
2. On the login screen, sign up with:
   - Email: `test1@example.com`
   - Password: `password123`
3. Repeat for more users (test2@, test3@, etc.)

## Using the Script

If you want to create multiple users at once:

### Setup

1. **Download Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project: **MessageAI-dev**
   - Go to Project Settings (gear icon) > Service Accounts
   - Click "Generate new private key"
   - Save as `scripts/serviceAccountKey.json`

2. **Install Firebase Admin SDK**:
   ```bash
   npm install firebase-admin --save-dev
   ```

3. **Run the script**:
   ```bash
   node scripts/createTestUser.js
   ```

### What It Creates

5 test users:
- test1@example.com (Alice Johnson)
- test2@example.com (Bob Smith)
- test3@example.com (Charlie Davis)
- test4@example.com (Diana Martinez)
- test5@example.com (Ethan Wilson)

All with password: `password123`

## Manual Creation (Firebase Console)

### Step 1: Create Auth User

1. Go to Firebase Console > Authentication > Users
2. Click "Add user"
3. Enter email and password
4. Note the UID

### Step 2: Create Firestore Profile

1. Go to Firestore Database > users collection
2. Add document with ID = UID from step 1
3. Add fields:
   ```
   userID: [UID]
   email: test1@example.com
   displayName: Test User 1
   isOnline: false
   lastSeenTimestamp: [timestamp]
   fcmToken: null
   createdAt: [timestamp]
   updatedAt: [timestamp]
   ```

## Testing

After creating users, you can:

1. **Login on Device 1**: test1@example.com
2. **Login on Device 2**: test2@example.com
3. **Create chat**: Between test1 and test2
4. **Test features**:
   - Send messages
   - See online status
   - View read receipts
   - Test presence updates

## Security Note

⚠️ **IMPORTANT**: Add `serviceAccountKey.json` to `.gitignore`!

```bash
echo "scripts/serviceAccountKey.json" >> .gitignore
```

Never commit your service account key to git!

