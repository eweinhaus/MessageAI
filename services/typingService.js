// Typing Service - Track user typing status in chats
import { doc, setDoc, deleteDoc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Throttle typing updates to max 1 per second
const lastTypingUpdate = {};
const TYPING_THROTTLE = 1000; // 1 second
const TYPING_TIMEOUT = 3000; // 3 seconds - consider stale after this

/**
 * Set user as typing in a chat
 * Throttled to prevent excessive Firestore writes
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID
 * @param {string} displayName - User's display name
 * @returns {Promise<void>}
 */
export async function setTyping(chatId, userId, displayName) {
  try {
    if (!chatId || !userId || !displayName) {
      console.warn('[Typing] Missing required parameters');
      return;
    }
    
    const now = Date.now();
    const key = `${chatId}-${userId}`;
    const lastUpdate = lastTypingUpdate[key] || 0;
    
    // Throttle to prevent spam (max 1 update per second)
    if (now - lastUpdate < TYPING_THROTTLE) {
      return;
    }
    
    lastTypingUpdate[key] = now;
    
    const typingRef = doc(db, `chats/${chatId}/typing`, userId);
    await setDoc(typingRef, {
      isTyping: true,
      timestamp: serverTimestamp(),
      displayName,
    });
    
    console.log(`[Typing] Set ${displayName} as typing in chat ${chatId}`);
  } catch (error) {
    // Handle permission errors gracefully
    const isPermissionError = 
      error.code === 'permission-denied' || 
      error.message?.includes('Missing or insufficient permissions');
    
    if (isPermissionError) {
      console.warn(`[Typing] Permission denied when setting typing status`);
    } else {
      console.error('[Typing] Error setting typing status:', error);
    }
  }
}

/**
 * Clear typing status for a user
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function clearTyping(chatId, userId) {
  try {
    if (!chatId || !userId) {
      console.warn('[Typing] Missing required parameters for clearTyping');
      return;
    }
    
    const typingRef = doc(db, `chats/${chatId}/typing`, userId);
    await deleteDoc(typingRef);
    console.log(`[Typing] Cleared typing status for user ${userId} in chat ${chatId}`);
  } catch (error) {
    // Silently handle 'not-found' errors (doc already deleted)
    if (error.code !== 'not-found') {
      console.error('[Typing] Error clearing typing status:', error);
    }
  }
}

/**
 * Subscribe to typing indicators in a chat
 * Filters out current user and automatically cleans up stale indicators
 * @param {string} chatId - Chat ID
 * @param {string} currentUserId - Current user's ID (to exclude from list)
 * @param {Function} callback - Callback with array of typing users: [{ userId, displayName }]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTyping(chatId, currentUserId, callback) {
  if (!chatId || !currentUserId) {
    console.warn('[Typing] Missing required parameters for subscription');
    return () => {};
  }
  
  const typingRef = collection(db, `chats/${chatId}/typing`);
  
  const unsubscribe = onSnapshot(
    typingRef,
    (snapshot) => {
      const typingUsers = [];
      const now = Date.now();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const userId = doc.id;
        
        // Skip current user (don't show own typing indicator)
        if (userId === currentUserId) return;
        
        // Check if typing status is stale
        const timestamp = data.timestamp?.toMillis?.() || 0;
        const age = now - timestamp;
        
        if (age < TYPING_TIMEOUT) {
          // Active typing indicator
          typingUsers.push({
            userId,
            displayName: data.displayName || 'Someone',
          });
        } else {
          // Stale indicator - clean it up
          console.log(`[Typing] Cleaning up stale typing indicator for ${userId}`);
          clearTyping(chatId, userId).catch(console.error);
        }
      });
      
      callback(typingUsers);
    },
    (error) => {
      console.error('[Typing] Error in typing listener:', error);
      callback([]);
    }
  );
  
  return unsubscribe;
}

/**
 * Helper to check if typing status is stale
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {boolean} True if stale
 */
export function isTypingStale(timestamp) {
  if (!timestamp) return true;
  return Date.now() - timestamp > TYPING_TIMEOUT;
}

