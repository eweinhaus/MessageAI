// Network Status Utility - Monitor internet connectivity
import { useState, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * React hook for monitoring network status
 * @returns {Object} { isOnline, isConnected, type }
 */
export function useNetworkStatus() {
  const [networkState, setNetworkState] = useState({
    isOnline: true, // Assume online initially to avoid false banner
    isConnected: true,
    type: 'unknown',
  });

  // Debounce timer to prevent rapid state changes
  const debounceTimer = useRef(null);

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Clear any pending debounce
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Debounce network state changes (300ms)
      debounceTimer.current = setTimeout(() => {
        // isInternetReachable can be null on first check, treat as online
        const isOnline = state.isConnected && (state.isInternetReachable ?? true);
        
        setNetworkState({
          isOnline,
          isConnected: state.isConnected,
          type: state.type,
        });
      }, 300);
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return networkState;
}

/**
 * Add a network state listener (non-hook version for services)
 * @param {Function} callback - Called with network state on changes
 * @returns {Function} Unsubscribe function
 */
export function addNetworkListener(callback) {
  let debounceTimer = null;

  const unsubscribe = NetInfo.addEventListener((state) => {
    // Clear any pending debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce network state changes (300ms)
    debounceTimer = setTimeout(() => {
      // isInternetReachable can be null on first check, treat as online
      const isOnline = state.isConnected && (state.isInternetReachable ?? true);
      
      callback({
        isOnline,
        isConnected: state.isConnected,
        type: state.type,
      });
    }, 300);
  });

  // Return cleanup function
  return () => {
    unsubscribe();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}

/**
 * Get current network state once (promise-based)
 * @returns {Promise<Object>} Network state
 */
export async function getCurrentNetworkStatus() {
  try {
    const state = await NetInfo.fetch();
    const isOnline = state.isConnected && (state.isInternetReachable ?? true);
    
    return {
      isOnline,
      isConnected: state.isConnected,
      type: state.type,
    };
  } catch (error) {
    console.error('Error fetching network status:', error);
    // Return online by default on error
    return {
      isOnline: true,
      isConnected: true,
      type: 'unknown',
    };
  }
}

