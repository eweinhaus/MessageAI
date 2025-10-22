// Presence Service - Track user online/offline status
import { doc, updateDoc, serverTimestamp, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Throttle state - max 1 update per 30 seconds per user
const lastUpdateTime = {};
const THROTTLE_DELAY = 30000; // 30 seconds
let isInitialized = false;
let currentUserID = null;
let heartbeatInterval = null;

// Presence timeout - consider user offline if no update in 45 seconds
// This is 1.5x the throttle delay to account for network delays
const PRESENCE_TIMEOUT = 45000; // 45 seconds

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
    
    // Check if document exists first
    const docSnap = await getDoc(userRef);
    
    if (!docSnap.exists()) {
      console.warn(`[Presence] User document doesn't exist for ${userID}, creating it...`);
      // Create the document if it doesn't exist (fallback)
      await setDoc(userRef, {
        userID,
        isOnline,
        lastSeenTimestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`[Presence] Created user document for ${userID}`);
      return;
    }
    
    // Update existing document
    await updateDoc(userRef, {
      isOnline,
      lastSeenTimestamp: serverTimestamp(),
    });
    
    console.log(`[Presence] Updated status for ${userID}: ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    // Handle permission errors gracefully (common during logout)
    const isPermissionError = 
      error.code === 'permission-denied' || 
      error.message?.includes('Missing or insufficient permissions');
    
    if (isPermissionError) {
      console.warn(`[Presence] Permission denied when updating presence for ${userID} (user may be logging out)`);
    } else {
      console.error('[Presence] Error updating presence:', error);
    }
    // Don't throw - presence updates should fail gracefully
  }
}

/**
 * Initialize presence tracking for a user
 * Should be called once after authentication
 * Sets up a heartbeat to keep presence updated
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
  
  // Set up heartbeat to update presence every 25 seconds (within throttle window)
  // This ensures the user's presence is kept fresh and doesn't become stale
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  heartbeatInterval = setInterval(() => {
    if (currentUserID) {
      console.log('[Presence] Heartbeat - updating presence');
      setUserOnline(currentUserID);
    }
  }, 25000); // 25 seconds - within the 30s throttle window
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
        let isOnline = data.isOnline || false;
        const lastSeenTimestamp = data.lastSeenTimestamp?.toMillis?.() || null;
        
        // If isOnline is true but timestamp is stale, consider user offline
        // This handles cases where app was force-quit and didn't set offline status
        if (isOnline && isPresenceStale(lastSeenTimestamp)) {
          console.log(`[Presence] User ${userID} marked online but presence is stale, treating as offline`);
          isOnline = false;
        }
        
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
  // Clear heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  isInitialized = false;
  currentUserID = null;
  console.log('[Presence] Cleaned up presence state');
}

/**
 * Check if a user's presence is stale (hasn't been updated recently)
 * Used by UI components to determine if "Online" status is reliable
 * @param {number|null} lastSeenTimestamp - Last seen timestamp in milliseconds
 * @returns {boolean} True if presence is stale (user likely offline)
 */
export function isPresenceStale(lastSeenTimestamp) {
  if (!lastSeenTimestamp) return true;
  
  const now = Date.now();
  const timeSinceUpdate = now - lastSeenTimestamp;
  
  return timeSinceUpdate > PRESENCE_TIMEOUT;
}

