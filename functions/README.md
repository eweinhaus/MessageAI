# MessageAI Cloud Functions

Firebase Cloud Functions for the MessageAI application.

## Functions

### onMessageCreated

**Trigger:** Firestore document creation  
**Path:** `chats/{chatID}/messages/{messageID}`  
**Purpose:** Send push notifications to message recipients

**Flow:**
1. Triggered when a new message is created in Firestore
2. Retrieves chat metadata to identify recipients
3. Fetches FCM tokens for each recipient (except sender)
4. Sends FCM notification with message preview
5. Logs success/failure for monitoring

**Notification Payload:**
```javascript
{
  notification: {
    title: "Sender Name",
    body: "Message text (truncated to 80 chars)"
  },
  data: {
    chatID: "chat123",
    messageID: "msg456",
    senderID: "user789",
    type: "new_message"
  }
}
```

## Development

### Install Dependencies
```bash
npm install
```

### Test Locally (with Firebase Emulator)
```bash
npm run serve
```

### Deploy to Firebase
```bash
npm run deploy
```

### View Logs
```bash
npm run logs
```

## Dependencies

- `firebase-functions` - Cloud Functions SDK
- `firebase-admin` - Admin SDK for Firestore and FCM

## Environment

- **Node.js:** 18
- **Runtime:** Node.js on Firebase Cloud Functions

## Error Handling

The function includes comprehensive error handling:
- Missing chat documents
- Missing user documents
- Invalid FCM tokens
- FCM delivery failures

All errors are logged to Cloud Functions logs for debugging.

## Monitoring

Monitor function execution in Firebase Console:
1. Go to Firebase Console
2. Navigate to Functions
3. Click on `onMessageCreated`
4. View Logs tab for execution details

## Cost Optimization

- Only sends notifications to online recipients (optional)
- Uses batch operations where possible
- Logs important events for debugging
- Fails gracefully on errors (no retries)

## Security

- Function is only triggered by Firestore writes (not public HTTP)
- Uses Firebase Admin SDK with full privileges
- FCM tokens are read from authenticated user documents
- No sensitive data exposed in logs
