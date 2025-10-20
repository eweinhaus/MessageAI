// Sync Manager - Sync data between Firestore and SQLite
/**
 * Handles syncing data from Firestore (source of truth) to SQLite (local cache)
 * Firestore always wins on conflicts
 */

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { insertChat, updateChat, insertMessage } from '../db/messageDb';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Sync all chats for a user from Firestore to SQLite
 * @param {string} userID - Current user's ID
 * @returns {Promise<Array>} Array of chat objects
 */
export async function syncChatsFromFirestore(userID) {
  try {
    console.log(`[SyncManager] Syncing chats for user ${userID}...`);
    
    // Query chats where user is a participant (1:1 chats)
    const chatsQuery1 = query(
      collection(db, 'chats'),
      where('participantIDs', 'array-contains', userID)
    );
    
    // Query chats where user is a member (group chats)
    const chatsQuery2 = query(
      collection(db, 'chats'),
      where('memberIDs', 'array-contains', userID)
    );

    // Execute both queries in parallel
    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(chatsQuery1),
      getDocs(chatsQuery2)
    ]);

    // Combine results and deduplicate
    const chatMap = new Map();
    
    snapshot1.forEach(doc => {
      const chatData = { ...doc.data(), chatID: doc.id };
      chatMap.set(doc.id, chatData);
    });
    
    snapshot2.forEach(doc => {
      const chatData = { ...doc.data(), chatID: doc.id };
      chatMap.set(doc.id, chatData);
    });

    const chats = Array.from(chatMap.values());

    // Write each chat to SQLite
    for (const chat of chats) {
      await insertChat({
        chatID: chat.chatID,
        type: chat.type,
        participantIDs: chat.participantIDs || [],
        participantNames: chat.participantNames || [],
        memberIDs: chat.memberIDs || [],
        memberNames: chat.memberNames || [],
        groupName: chat.groupName || null,
        createdBy: chat.createdBy || null,
        lastMessageText: chat.lastMessageText || null,
        lastMessageTimestamp: chat.lastMessageTimestamp?.toMillis?.() || chat.lastMessageTimestamp || null,
        lastMessageSenderID: chat.lastMessageSenderID || null,
        createdAt: chat.createdAt?.toMillis?.() || chat.createdAt || Date.now(),
        updatedAt: chat.updatedAt?.toMillis?.() || chat.updatedAt || Date.now(),
      });
    }

    // Store last sync timestamp
    await AsyncStorage.setItem(
      `lastChatSync_${userID}`,
      Date.now().toString()
    );

    console.log(`[SyncManager] Synced ${chats.length} chats`);
    return chats;
  } catch (error) {
    console.error('[SyncManager] Error syncing chats:', error);
    throw error;
  }
}

/**
 * Sync messages for a specific chat from Firestore to SQLite
 * @param {string} chatID - Chat ID
 * @param {Object} options - Options { since: timestamp, limit: number }
 * @returns {Promise<Array>} Array of message objects
 */
export async function syncMessagesForChat(chatID, options = {}) {
  try {
    const { since = null, limit = 100 } = options;
    
    console.log(`[SyncManager] Syncing messages for chat ${chatID}...`);

    // Build query
    let messagesQuery = query(
      collection(db, `chats/${chatID}/messages`),
      orderBy('timestamp', 'asc')
    );

    // Add limit
    if (limit) {
      messagesQuery = query(messagesQuery, firestoreLimit(limit));
    }

    // Execute query
    const snapshot = await getDocs(messagesQuery);

    const messages = [];
    
    for (const doc of snapshot.docs) {
      const messageData = { ...doc.data(), messageID: doc.id };
      
      // Apply local reconciliation logic
      const reconciledMessage = await reconcileMessage(messageData, chatID);
      
      if (reconciledMessage) {
        messages.push(reconciledMessage);
      }
    }

    // Store last sync timestamp for this chat
    await AsyncStorage.setItem(
      `lastMessageSync_${chatID}`,
      Date.now().toString()
    );

    console.log(`[SyncManager] Synced ${messages.length} messages for chat ${chatID}`);
    return messages;
  } catch (error) {
    console.error('[SyncManager] Error syncing messages:', error);
    throw error;
  }
}

/**
 * Reconcile a message from Firestore with local SQLite data
 * Firestore always wins on conflicts
 * @param {Object} firestoreMsg - Message data from Firestore
 * @param {string} chatID - Chat ID
 * @returns {Promise<Object>} Reconciled message object
 */
async function reconcileMessage(firestoreMsg, chatID) {
  try {
    // Convert Firestore timestamps to milliseconds
    const message = {
      messageID: firestoreMsg.messageID,
      chatID: chatID,
      senderID: firestoreMsg.senderID,
      senderName: firestoreMsg.senderName,
      text: firestoreMsg.text,
      timestamp: firestoreMsg.timestamp?.toMillis?.() || firestoreMsg.timestamp || Date.now(),
      deliveryStatus: firestoreMsg.deliveryStatus || 'sent',
      readBy: firestoreMsg.readBy || [],
      syncStatus: 'synced', // Mark as synced since it came from Firestore
      retryCount: 0,
      lastSyncAttempt: Date.now(),
      createdAt: firestoreMsg.createdAt?.toMillis?.() || firestoreMsg.createdAt || Date.now(),
    };

    // Write to SQLite (INSERT OR REPLACE handles both new and existing messages)
    await insertMessage(message);

    return message;
  } catch (error) {
    console.error('[SyncManager] Error reconciling message:', error);
    return null;
  }
}

/**
 * Mark sync as complete for a chat
 * Stores the last sync timestamp
 * @param {string} chatID - Chat ID
 * @returns {Promise<void>}
 */
export async function markSyncComplete(chatID) {
  try {
    await AsyncStorage.setItem(
      `lastMessageSync_${chatID}`,
      Date.now().toString()
    );
    console.log(`[SyncManager] Marked sync complete for chat ${chatID}`);
  } catch (error) {
    console.error('[SyncManager] Error marking sync complete:', error);
  }
}

/**
 * Get last sync timestamp for a chat
 * @param {string} chatID - Chat ID
 * @returns {Promise<number|null>} Last sync timestamp or null
 */
export async function getLastSyncTimestamp(chatID) {
  try {
    const timestamp = await AsyncStorage.getItem(`lastMessageSync_${chatID}`);
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    console.error('[SyncManager] Error getting last sync timestamp:', error);
    return null;
  }
}

/**
 * Perform a full sync for a user
 * Syncs all chats and recent messages
 * @param {string} userID - Current user's ID
 * @returns {Promise<Object>} Sync results { chats, messages }
 */
export async function performFullSync(userID) {
  try {
    console.log(`[SyncManager] Starting full sync for user ${userID}...`);
    
    // Step 1: Sync all chats
    const chats = await syncChatsFromFirestore(userID);
    
    // Step 2: Sync messages for each chat (most recent 50 messages per chat)
    const messagePromises = chats.slice(0, 10).map(chat => 
      syncMessagesForChat(chat.chatID, { limit: 50 })
    );
    
    const messagesArrays = await Promise.all(messagePromises);
    const totalMessages = messagesArrays.reduce((sum, arr) => sum + arr.length, 0);
    
    console.log(`[SyncManager] Full sync complete: ${chats.length} chats, ${totalMessages} messages`);
    
    return {
      chats,
      messageCount: totalMessages,
    };
  } catch (error) {
    console.error('[SyncManager] Error performing full sync:', error);
    throw error;
  }
}

