// Presence Service - Track user online/offline status
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

/**
 * Update user's online status in Firestore
 * @param {string} userID - User ID
 * @param {boolean} isOnline - Online status
 * @returns {Promise<void>}
 */
export async function updatePresence(userID, isOnline) {
  try {
    if (!userID) {
      console.warn('[Presence] No userID provided');
      return;
    }
    
    const userRef = doc(db, 'users', userID);
    
    await updateDoc(userRef, {
      isOnline,
      lastSeenTimestamp: serverTimestamp(),
    });
    
    console.log(`[Presence] Updated status for ${userID}: ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error('[Presence] Error updating presence:', error);
    // Don't throw - presence updates should fail gracefully
  }
}

/**
 * Set user online and set up disconnect handler
 * @param {string} userID - User ID
 * @returns {Promise<void>}
 */
export async function setUserOnline(userID) {
  await updatePresence(userID, true);
}

/**
 * Set user offline
 * @param {string} userID - User ID
 * @returns {Promise<void>}
 */
export async function setUserOffline(userID) {
  await updatePresence(userID, false);
}

/**
 * Subscribe to a user's presence status
 * @param {string} userID - User ID to monitor
 * @param {Function} callback - Callback function with (isOnline, lastSeenTimestamp)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToPresence(userID, callback) {
  if (!userID) {
    console.warn('[Presence] No userID provided for subscription');
    return () => {};
  }
  
  const userRef = doc(db, 'users', userID);
  
  const unsubscribe = onSnapshot(
    userRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const isOnline = data.isOnline || false;
        const lastSeenTimestamp = data.lastSeenTimestamp?.toMillis?.() || null;
        
        callback(isOnline, lastSeenTimestamp);
      } else {
        // User document doesn't exist
        callback(false, null);
      }
    },
    (error) => {
      console.error('[Presence] Error in presence listener:', error);
      callback(false, null);
    }
  );
  
  return unsubscribe;
}

/**
 * Throttle function to limit how often a function can be called
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, delay) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func(...args);
    }
  };
}

// Create throttled version of updatePresence (max 1 call per 30 seconds)
export const throttledUpdatePresence = throttle(updatePresence, 30000);

