# PR 11: Push Notifications Deployment Guide

## Overview
This guide covers deploying Cloud Functions for push notifications in the MessageAI app.

## Prerequisites

1. **Firebase CLI Installed**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Authentication**
   ```bash
   firebase login
   ```

3. **Firebase Project**
   - Ensure you're using the correct Firebase project (MessageAI-dev)
   - Project must be on the Blaze (pay-as-you-go) plan for Cloud Functions

## Deployment Steps

### 1. Verify Project Configuration

Check your Firebase project ID in `.firebaserc`:
```bash
cat .firebaserc
```

If the project ID is not correct, update it:
```bash
firebase use --add
# Select your project from the list
```

### 2. Install Cloud Functions Dependencies

```bash
cd functions
npm install
cd ..
```

### 3. Deploy Cloud Functions

Deploy only the functions:
```bash
firebase deploy --only functions
```

This will deploy the `onMessageCreated` function that sends push notifications when messages are created.

### 4. Verify Deployment

After deployment, you should see output like:
```
✔  functions: Finished running predeploy script.
✔  functions[onMessageCreated(us-central1)]: Successful create operation.
Function URL: https://us-central1-messageai-dev.cloudfunctions.net/onMessageCreated
```

### 5. Check Function in Firebase Console

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project (MessageAI-dev)
3. Navigate to Functions section
4. Verify `onMessageCreated` function is listed and deployed

### 6. Test the Function

#### Method 1: Send a Message in the App
1. Open app on two devices
2. User A sends message to User B
3. Check Firebase Console > Functions > Logs to see function execution

#### Method 2: Manually Create a Message in Firestore
1. Go to Firestore Database in Firebase Console
2. Navigate to `chats/{chatID}/messages`
3. Add a new document with required fields
4. Check function logs for execution

## Monitoring

### View Function Logs

```bash
# Real-time logs
firebase functions:log --only onMessageCreated

# Or in Firebase Console
# Functions > onMessageCreated > Logs tab
```

### Check for Errors

Look for these in the logs:
- `[onMessageCreated] New message from {sender}` - Function triggered
- `[onMessageCreated] Sending notifications to X recipient(s)` - Recipients identified
- `[onMessageCreated] Successfully sent notification` - FCM sent
- `[onMessageCreated] Error sending notification` - FCM failed

## Troubleshooting

### Issue: "Firebase project not found"
**Solution:** 
```bash
firebase use --add
# Select correct project
```

### Issue: "Billing account not configured"
**Solution:** 
- Cloud Functions require Blaze plan
- Enable billing in Firebase Console > Settings > Usage and billing

### Issue: "Function deployment failed"
**Solution:**
1. Check Node.js version (must be 18)
   ```bash
   node --version
   ```
2. Verify all dependencies installed:
   ```bash
   cd functions && npm install && cd ..
   ```
3. Check for syntax errors in `functions/index.js`

### Issue: "FCM token not found for user"
**Solution:**
- Ensure notification permissions are granted on client device
- Verify FCM token is saved to Firestore `/users/{userID}/fcmToken`
- Check client app logs for token registration

### Issue: "Invalid FCM token"
**Solution:**
- Tokens can expire or become invalid
- Client should re-register token on app startup
- Consider implementing token refresh logic

## Cost Estimation

Cloud Functions costs (Blaze plan):
- **Invocations:** First 2 million/month free
- **Compute time:** First 400,000 GB-seconds/month free
- **Networking:** First 5 GB/month free

For MVP testing with <10 users:
- **Expected cost:** $0/month (within free tier)

## Security Notes

1. **Firestore Security Rules:** Currently open for MVP. Secure in PR 16.
2. **FCM Token Protection:** Tokens stored in Firestore, only accessible by authenticated users
3. **Function Triggers:** Only triggered by Firestore writes (not public HTTP)

## Next Steps After Deployment

1. **Test foreground notifications** (see PR11_TESTING_GUIDE.md)
2. **Monitor function execution** in Firebase Console
3. **Check FCM delivery rates** (should be >90%)
4. **Verify notification behavior** on iOS and Android
5. **Test with multiple recipients** (group chats)

## Rollback (if needed)

If deployment causes issues:
```bash
# Delete the function
firebase functions:delete onMessageCreated

# Re-deploy previous version (if you have git history)
git checkout <previous-commit>
firebase deploy --only functions
```

## References

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Cloud Messaging (FCM)](https://firebase.google.com/docs/cloud-messaging)
- [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
