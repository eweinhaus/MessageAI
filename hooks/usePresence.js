// usePresence Hook - Subscribe to user presence status
import { useState, useEffect } from 'react';
import { subscribeToPresence } from '../services/presenceService';

/**
 * Custom hook to subscribe to a user's online/offline presence
 * @param {string|null} userID - User ID to monitor (null to skip)
 * @returns {Object} { isOnline: boolean, lastSeen: number|null }
 */
export function usePresence(userID) {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  
  useEffect(() => {
    // Skip if no userID provided
    if (!userID) {
      setIsOnline(false);
      setLastSeen(null);
      return;
    }
    
    console.log(`[usePresence] Subscribing to presence for user: ${userID}`);
    
    // Subscribe to presence updates
    const unsubscribe = subscribeToPresence(userID, (online, lastSeenTimestamp) => {
      setIsOnline(online);
      setLastSeen(lastSeenTimestamp);
    });
    
    // Cleanup on unmount
    return () => {
      console.log(`[usePresence] Unsubscribing from presence for user: ${userID}`);
      unsubscribe();
    };
  }, [userID]);
  
  return { isOnline, lastSeen };
}

