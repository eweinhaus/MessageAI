/**
 * Cloud Functions for MessageAI
 * 
 * This file contains Firebase Cloud Functions that handle push notifications
 * when new messages are created.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * onMessageCreated
 * 
 * Triggers when a new message is created in /chats/{chatID}/messages/{messageID}
 * Sends push notifications to all recipients (except the sender)
 * 
 * Notification payload:
 * - title: Sender's display name
 * - body: Message text (truncated to 80 chars)
 * - data: chatID, messageID, senderID for navigation
 */
exports.onMessageCreated = functions.firestore
  .document('chats/{chatID}/messages/{messageID}')
  .onCreate(async (snapshot, context) => {
    try {
      // Extract parameters from context
      const { chatID, messageID } = context.params;
      
      // Get message data
      const message = snapshot.data();
      const { senderID, senderName, text } = message;
      
      console.log(`[onMessageCreated] New message from ${senderName} in chat ${chatID}`);
      
      // Get chat document to find all participants/members
      const chatRef = admin.firestore().collection('chats').doc(chatID);
      const chatDoc = await chatRef.get();
      
      if (!chatDoc.exists) {
        console.error(`[onMessageCreated] Chat ${chatID} not found`);
        return null;
      }
      
      const chatData = chatDoc.data();
      const { type } = chatData;
      
      // Get recipient IDs based on chat type
      let recipientIDs = [];
      if (type === '1:1') {
        // For 1:1 chats, use participantIDs array
        recipientIDs = chatData.participantIDs || [];
      } else if (type === 'group') {
        // For group chats, use memberIDs array
        recipientIDs = chatData.memberIDs || [];
      }
      
      // Filter out the sender from recipients
      recipientIDs = recipientIDs.filter(id => id !== senderID);
      
      console.log(`[onMessageCreated] Sending notifications to ${recipientIDs.length} recipient(s)`);
      
      if (recipientIDs.length === 0) {
        console.log('[onMessageCreated] No recipients to notify');
        return null;
      }
      
      // Fetch FCM tokens for all recipients
      const usersRef = admin.firestore().collection('users');
      const tokenPromises = recipientIDs.map(async (recipientID) => {
        try {
          const userDoc = await usersRef.doc(recipientID).get();
          if (!userDoc.exists) {
            console.warn(`[onMessageCreated] User ${recipientID} not found`);
            return null;
          }
          
          const userData = userDoc.data();
          const fcmToken = userData.fcmToken;
          
          if (!fcmToken) {
            console.warn(`[onMessageCreated] No FCM token for user ${recipientID}`);
            return null;
          }
          
          return { recipientID, fcmToken };
        } catch (error) {
          console.error(`[onMessageCreated] Error fetching token for ${recipientID}:`, error);
          return null;
        }
      });
      
      const tokenResults = await Promise.all(tokenPromises);
      const validTokens = tokenResults.filter(result => result !== null);
      
      console.log(`[onMessageCreated] Found ${validTokens.length} valid FCM token(s)`);
      
      if (validTokens.length === 0) {
        console.log('[onMessageCreated] No valid FCM tokens found');
        return null;
      }
      
      // Prepare notification payload
      const truncatedText = text.length > 80 ? text.substring(0, 77) + '...' : text;
      
      // Send notifications to all recipients with valid tokens
      const notificationPromises = validTokens.map(async ({ recipientID, fcmToken }) => {
        const payload = {
          notification: {
            title: senderName,
            body: truncatedText,
          },
          data: {
            chatID: chatID,
            messageID: messageID,
            senderID: senderID,
            type: 'new_message',
          },
          token: fcmToken,
        };
        
        try {
          const response = await admin.messaging().send(payload);
          console.log(`[onMessageCreated] Successfully sent notification to ${recipientID}:`, response);
          return { recipientID, success: true };
        } catch (error) {
          console.error(`[onMessageCreated] Error sending notification to ${recipientID}:`, error);
          
          // If the token is invalid, we could remove it from Firestore
          // For now, just log the error
          if (error.code === 'messaging/invalid-registration-token' || 
              error.code === 'messaging/registration-token-not-registered') {
            console.warn(`[onMessageCreated] Invalid token for ${recipientID}, consider removing from Firestore`);
          }
          
          return { recipientID, success: false, error: error.message };
        }
      });
      
      const notificationResults = await Promise.all(notificationPromises);
      
      // Log summary
      const successCount = notificationResults.filter(r => r.success).length;
      const failureCount = notificationResults.filter(r => !r.success).length;
      console.log(`[onMessageCreated] Notification summary: ${successCount} sent, ${failureCount} failed`);
      
      return {
        chatID,
        messageID,
        recipientCount: recipientIDs.length,
        notificationsSent: successCount,
        notificationsFailed: failureCount,
      };
      
    } catch (error) {
      console.error('[onMessageCreated] Unexpected error:', error);
      // Don't throw - we don't want to retry on unexpected errors
      return null;
    }
  });
