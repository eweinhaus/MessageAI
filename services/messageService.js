// Message Service - Client-side message sending and management
import uuid from 'react-native-uuid';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { insertMessage, updateMessage, updateMessageSyncStatus } from '../db/messageDb';
import { updateChatLastMessage } from './firestore';
import useMessageStore from '../store/messageStore';
import useChatStore from '../store/chatStore';

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
  
  // Create message object
  const message = {
    messageID,
    chatID,
    senderID,
    senderName,
    text,
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
    
    // 3. Async: Write to Firestore
    try {
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
      
      console.log(`[MessageService] Message ${messageID} sent successfully`);
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
    const firestoreMessage = {
      messageID: message.messageID,
      chatID: message.chatID,
      senderID: message.senderID,
      senderName: message.senderName,
      text: message.text,
      timestamp: serverTimestamp(), // Use server timestamp for consistency
      deliveryStatus: 'sent',
      readBy: [],
      createdAt: serverTimestamp(),
    };
    
    // Write to Firestore (merge to prevent overwrites if race condition)
    await setDoc(messageRef, firestoreMessage, { merge: true });
    
    // Update chat's last message
    await updateChatLastMessage(
      message.chatID,
      message.text,
      serverTimestamp(),
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

