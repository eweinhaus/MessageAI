// Message Service - Client-side message sending and management
import uuid from 'react-native-uuid';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { insertMessage, updateMessage, updateMessageSyncStatus } from '../db/messageDb';
import { updateChatLastMessage } from './firestore';
import useMessageStore from '../store/messageStore';
import useChatStore from '../store/chatStore';
import { getCurrentNetworkStatus } from '../utils/networkStatus';
import { analyzePriorities } from './aiService';

/**
 * Send a message with optimistic UI updates
 * Writes to SQLite immediately, updates UI, then syncs to Firestore
 * 
 * @param {string} chatID - Chat ID
 * @param {string} senderID - Sender user ID
 * @param {string} senderName - Sender display name
 * @param {string} text - Message text
 * @returns {Promise<Object>} Message object
 */
export async function sendMessage(chatID, senderID, senderName, text) {
  const messageID = uuid.v4();
  const timestamp = Date.now();
  
  // Clean text: trim whitespace and remove any trailing newlines
  const cleanedText = text?.trim() || text;
  
  // Create message object
  const message = {
    messageID,
    chatID,
    senderID,
    senderName,
    text: cleanedText,
    timestamp,
    deliveryStatus: 'sending',
    readBy: [],
    createdAt: timestamp,
    syncStatus: 'pending',
    retryCount: 0,
    lastSyncAttempt: null,
  };

  try {
    console.log(`[MessageService] Sending message ${messageID} to chat ${chatID}`);
    
    // 1. Write to SQLite immediately (optimistic UI)
    await insertMessage(message);
    
    // 2. Update Zustand store (UI updates instantly)
    useMessageStore.getState().addMessage(chatID, message);
    
    // 3. Async: Write to Firestore (only when online)
    try {
      const networkStatus = await getCurrentNetworkStatus();

      if (!networkStatus.isOnline) {
        console.log('[MessageService] Device offline, skipping immediate Firestore write');
        // Ensure message remains pending so queue can process later
        await updateMessageSyncStatus(messageID, 'pending', 0);
        useMessageStore.getState().updateMessage(chatID, messageID, {
          syncStatus: 'pending',
          deliveryStatus: 'sending',
        });
      } else {
        await writeToFirestore(message);

        // Success: Update sync status
        await updateMessageSyncStatus(messageID, 'synced', 0);

        // Update delivery status to 'sent'
        await updateMessage(messageID, { deliveryStatus: 'sent' });

        // Update Zustand store with new status
        useMessageStore.getState().updateMessage(chatID, messageID, {
          syncStatus: 'synced',
          deliveryStatus: 'sent',
        });

        // IMMEDIATE PRIORITY ANALYSIS
        // Analyze the chat for urgent messages after sending
        try {
          console.log(`[MessageService] Triggering immediate priority analysis for chat ${chatID}`);
          await analyzePriorities(chatID, {
            messageCount: 10, // Analyze last 10 messages for context
            forceRefresh: true, // Always get fresh results
          });
          console.log(`[MessageService] Priority analysis complete for chat ${chatID}`);
        } catch (error) {
          // Silently handle priority analysis errors - don't disrupt message sending
          console.warn(`[MessageService] Priority analysis failed for chat ${chatID}:`, error);
        }

        console.log(`[MessageService] Message ${messageID} sent successfully`);
      }
    } catch (error) {
      console.error(`[MessageService] Failed to send message ${messageID}:`, error);

      // Mark as pending (will be retried by queue processor)
      await updateMessageSyncStatus(messageID, 'pending', 1);

      // Update UI to show pending state
      useMessageStore.getState().updateMessage(chatID, messageID, {
        syncStatus: 'pending',
        deliveryStatus: 'sending',
      });
    }
    
    return message;
  } catch (error) {
    console.error('[MessageService] Error in sendMessage:', error);
    throw error;
  }
}

/**
 * Write message to Firestore
 * @param {Object} message - Message object
 * @returns {Promise<void>}
 */
async function writeToFirestore(message) {
  try {
    const messageRef = doc(db, 'chats', message.chatID, 'messages', message.messageID);
    
    // Prepare message data for Firestore
    const timestampValue = Timestamp.fromMillis(message.timestamp);
    const createdAtValue = message.createdAt ? Timestamp.fromMillis(message.createdAt) : serverTimestamp();

    const firestoreMessage = {
      messageID: message.messageID,
      chatID: message.chatID,
      senderID: message.senderID,
      senderName: message.senderName,
      text: message.text,
      // Preserve original client timestamp using Firestore Timestamp for cross-device ordering
      timestamp: timestampValue,
      deliveryStatus: 'sent',
      readBy: [],
      createdAt: createdAtValue,
      clientTimestamp: message.timestamp, // Additional safeguard for ordering/debugging
    };
    
    // Write to Firestore (merge to prevent overwrites if race condition)
    await setDoc(messageRef, firestoreMessage, { merge: true });
    
    // Update chat's last message
    await updateChatLastMessage(
      message.chatID,
      message.text,
      timestampValue,
      message.senderID
    );
    
    console.log(`[MessageService] Wrote message ${message.messageID} to Firestore`);
  } catch (error) {
    console.error('[MessageService] Error writing to Firestore:', error);
    throw error;
  }
}

/**
 * Retry a failed message
 * Resets retry count and triggers queue processing
 * 
 * @param {string} messageID - Message ID to retry
 * @param {string} chatID - Chat ID
 * @returns {Promise<boolean>} Success status
 */
export async function retryFailedMessage(messageID, chatID) {
  try {
    console.log(`[MessageService] Retrying message ${messageID}`);
    
    // Reset retry count and sync status
    await updateMessageSyncStatus(messageID, 'pending', 0);
    
    // Update UI
    useMessageStore.getState().updateMessage(chatID, messageID, {
      syncStatus: 'pending',
      deliveryStatus: 'sending',
    });
    
    // Import and trigger queue processor
    const { processPendingMessages } = await import('../utils/offlineQueue');
    await processPendingMessages();
    
    return true;
  } catch (error) {
    console.error('[MessageService] Error retrying message:', error);
    return false;
  }
}

/**
 * Export writeToFirestore for use by offline queue
 */
export { writeToFirestore };

