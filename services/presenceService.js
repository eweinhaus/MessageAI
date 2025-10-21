// Presence Service - Track user online/offline status
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Throttle state - max 1 update per 30 seconds per user
const lastUpdateTime = {};
const THROTTLE_DELAY = 30000; // 30 seconds
let isInitialized = false;
let currentUserID = null;

/**
 * Update user's online status in Firestore
 * @param {string} userID - User ID
 * @param {boolean} isOnline - Online status
 * @param {boolean} force - Force update even if throttled
 * @returns {Promise<void>}
 */
async function updatePresence(userID, isOnline, force = false) {
  try {
    if (!userID) {
      console.warn('[Presence] No userID provided');
      return;
    }
    
    // Check throttle (skip for offline updates - they're important)
    if (!force && isOnline) {
      const now = Date.now();
      const lastUpdate = lastUpdateTime[userID] || 0;
      
      if (now - lastUpdate < THROTTLE_DELAY) {
        console.log(`[Presence] Throttled update for ${userID} (${Math.round((THROTTLE_DELAY - (now - lastUpdate)) / 1000)}s remaining)`);
        return;
      }
      
      lastUpdateTime[userID] = now;
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
 * Initialize presence tracking for a user
 * Should be called once after authentication
 * @param {string} userID - User ID
 */
export function initializePresence(userID) {
  if (isInitialized && currentUserID === userID) {
    console.log('[Presence] Already initialized for this user');
    return;
  }
  
  console.log(`[Presence] Initializing presence for user: ${userID}`);
  currentUserID = userID;
  isInitialized = true;
  
  // Set user online immediately
  setUserOnline(userID);
}

/**
 * Set user online
 * @param {string} userID - User ID
 * @returns {Promise<void>}
 */
export async function setUserOnline(userID) {
  await updatePresence(userID, true);
}

/**
 * Set user offline (always executed, never throttled)
 * @param {string} userID - User ID
 * @returns {Promise<void>}
 */
export async function setUserOffline(userID) {
  // Force update for offline status
  await updatePresence(userID, false, true);
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
 * Cleanup presence state (for logout)
 */
export function cleanupPresence() {
  isInitialized = false;
  currentUserID = null;
  console.log('[Presence] Cleaned up presence state');
}

