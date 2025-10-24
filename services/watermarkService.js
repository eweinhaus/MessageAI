// Watermark Service - Track processed messages for delta-based AI features
/**
 * WATERMARK SCHEMA DOCUMENTATION
 * ================================
 * 
 * /users/{userID}/aiCache/watermarks
 *   - {chatID}: number (timestamp in milliseconds of last processed message)
 *   - updatedAt: timestamp
 * 
 * Watermarks enable delta processing: only analyze new messages since last run
 */

import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

/**
 * Get user's watermarks for all chats
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Map of chatId to timestamp (millis), e.g. { "chat1": 1634567890000 }
 */
export async function getUserWatermarks(userId) {
  try {
    console.log('[WatermarkService] Fetching watermarks for user:', userId);
    const watermarkRef = doc(db, 'users', userId, 'aiCache', 'watermarks');
    const watermarkSnap = await getDoc(watermarkRef);
    
    if (watermarkSnap.exists()) {
      const data = watermarkSnap.data();
      // Remove metadata fields, keep only chatId: timestamp pairs
      const { updatedAt, ...watermarks } = data;
      console.log('[WatermarkService] Found watermarks for', Object.keys(watermarks).length, 'chats');
      return watermarks;
    }
    
    console.log('[WatermarkService] No watermarks found (first run)');
    return {};
  } catch (error) {
    console.error('[WatermarkService] Error fetching watermarks:', error);
    // Return empty object on error to allow processing all messages
    return {};
  }
}

/**
 * Update watermarks for multiple chats
 * @param {string} userId - User ID
 * @param {Object} watermarks - Map of chatId to timestamp (millis)
 * @returns {Promise<void>}
 */
export async function updateWatermarks(userId, watermarks) {
  try {
    console.log('[WatermarkService] Updating watermarks for', Object.keys(watermarks).length, 'chats');
    
    // Filter out undefined values (Firestore doesn't allow them)
    const cleanWatermarks = {};
    for (const [chatId, timestamp] of Object.entries(watermarks)) {
      if (timestamp !== undefined && timestamp !== null) {
        cleanWatermarks[chatId] = timestamp;
      }
    }
    
    const watermarkRef = doc(db, 'users', userId, 'aiCache', 'watermarks');
    
    // Use merge to preserve existing watermarks
    await setDoc(watermarkRef, {
      ...cleanWatermarks,
      updatedAt: Timestamp.now()
    }, { merge: true });
    
    console.log('[WatermarkService] Watermarks updated successfully');
  } catch (error) {
    console.error('[WatermarkService] Error updating watermarks:', error);
    throw error;
  }
}

/**
 * Get unread chats with their new messages (delta since last watermark)
 * @param {string} userId - User ID
 * @param {Object} watermarks - Map of chatId to last processed timestamp
 * @param {Array} userChats - Optional array of chat objects (to avoid re-fetching)
 * @returns {Promise<Object>} Map of chatId to messages array, e.g. { "chat1": [msg1, msg2, ...] }
 */
export async function getUnreadChatsWithMessages(userId, watermarks, userChats = null) {
  try {
    console.log('[WatermarkService] Fetching unread messages for user:', userId);
    
    // If userChats not provided, fetch them
    let chats = userChats;
    if (!chats) {
      const { getAllUserChats } = require('./firestore');
      chats = await getAllUserChats(userId);
    }
    
    console.log('[WatermarkService] Checking', chats.length, 'chats for unread messages');
    
    const unreadByChat = {};
    
    // Process chats in batches of 5 to avoid overwhelming Firestore
    const BATCH_SIZE = 5;
    for (let i = 0; i < chats.length; i += BATCH_SIZE) {
      const batch = chats.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (chat) => {
        const chatId = chat.chatID;
        const watermark = watermarks[chatId] || 0;
        
        try {
          // Query messages newer than watermark
          const messagesRef = collection(db, 'chats', chatId, 'messages');
          const messagesQuery = query(
            messagesRef,
            where('timestamp', '>', Timestamp.fromMillis(watermark)),
            orderBy('timestamp', 'asc'),
            limit(50) // Cap at 50 messages per chat to prevent token overflow
          );
          
          const messagesSnap = await getDocs(messagesQuery);
          
          if (!messagesSnap.empty) {
            const messages = messagesSnap.docs.map(doc => doc.data());
            unreadByChat[chatId] = messages;
            console.log(`[WatermarkService] Found ${messages.length} unread messages in chat ${chatId}`);
          }
        } catch (error) {
          console.warn(`[WatermarkService] Error fetching messages for chat ${chatId}:`, error);
          // Continue with other chats
        }
      }));
    }
    
    const unreadChatCount = Object.keys(unreadByChat).length;
    console.log(`[WatermarkService] Found unread messages in ${unreadChatCount} chat(s)`);
    
    return unreadByChat;
  } catch (error) {
    console.error('[WatermarkService] Error fetching unread messages:', error);
    throw error;
  }
}

/**
 * Get chat name for display purposes
 * @param {Object} chat - Chat object
 * @param {string} userId - Current user ID
 * @returns {string} Chat name
 */
export function getChatName(chat, userId) {
  if (chat.type === 'group') {
    return chat.groupName || 'Group Chat';
  }
  
  // For 1:1 chats, return the other participant's name
  const otherParticipantIndex = chat.participantIDs?.indexOf(userId) === 0 ? 1 : 0;
  return chat.participantNames?.[otherParticipantIndex] || 'Unknown';
}

