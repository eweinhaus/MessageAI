// Firestore Listener Manager
// Centralized management for all Firestore listeners with pause/resume capability

import { listenerLog } from './diagnosticUtils';

/**
 * Global registry of active listeners
 * Format: { listenerId: unsubscribeFn }
 */
const activeListeners = new Map();

/**
 * Paused listener configurations for resuming later
 * Format: { listenerId: { collection, setupFn } }
 */
const pausedListeners = new Map();

/**
 * Register a new Firestore listener
 * @param {string} listenerId - Unique identifier for this listener
 * @param {Function} unsubscribeFn - Function to call to unsubscribe
 * @param {Object} config - Listener configuration for resuming
 * @returns {string} Listener ID
 */
export function registerListener(listenerId, unsubscribeFn, config = {}) {
  if (activeListeners.has(listenerId)) {
    listenerLog(`Listener already registered: ${listenerId}`, { warn: true });
    // Unsubscribe old one first
    const oldUnsubscribe = activeListeners.get(listenerId);
    if (oldUnsubscribe) oldUnsubscribe();
  }
  
  activeListeners.set(listenerId, unsubscribeFn);
  
  // Store config for potential resume
  if (config.collection && config.setupFn) {
    pausedListeners.set(listenerId, config);
  }
  
  listenerLog(`Registered listener: ${listenerId}`, { 
    collection: config.collection,
    total: activeListeners.size 
  });
  
  return listenerId;
}

/**
 * Unregister and unsubscribe a specific listener
 * @param {string} listenerId - Listener ID to remove
 */
export function unregisterListener(listenerId) {
  const unsubscribe = activeListeners.get(listenerId);
  
  if (unsubscribe) {
    try {
      unsubscribe();
      activeListeners.delete(listenerId);
      listenerLog(`Unregistered listener: ${listenerId}`);
    } catch (error) {
      listenerLog(`Error unregistering listener: ${listenerId}`, error);
    }
  } else {
    listenerLog(`Listener not found: ${listenerId}`, { warn: true });
  }
}

/**
 * Pause all active listeners (for backgrounding app)
 * Stores configuration for resuming later
 */
export function pauseAllListeners() {
  listenerLog(`Pausing ${activeListeners.size} listeners...`);
  
  const listenerIds = Array.from(activeListeners.keys());
  
  for (const listenerId of listenerIds) {
    const unsubscribe = activeListeners.get(listenerId);
    
    if (unsubscribe) {
      try {
        unsubscribe();
        listenerLog(`Paused listener: ${listenerId}`);
      } catch (error) {
        listenerLog(`Error pausing listener: ${listenerId}`, error);
      }
    }
  }
  
  // Clear active listeners (configs are preserved in pausedListeners)
  activeListeners.clear();
  
  listenerLog(`All listeners paused`, { count: listenerIds.length });
}

/**
 * Resume all paused listeners (when app returns to foreground)
 * @returns {Promise<number>} Number of listeners resumed
 */
export async function resumeAllListeners() {
  const count = pausedListeners.size;
  listenerLog(`Resuming ${count} listeners...`);
  
  let resumed = 0;
  
  for (const [listenerId, config] of pausedListeners.entries()) {
    if (config.setupFn && typeof config.setupFn === 'function') {
      try {
        listenerLog(`Resuming listener: ${listenerId}`, { collection: config.collection });
        
        // Call the setup function to re-establish listener
        const unsubscribe = await config.setupFn();
        
        if (unsubscribe) {
          activeListeners.set(listenerId, unsubscribe);
          resumed++;
        }
      } catch (error) {
        listenerLog(`Error resuming listener: ${listenerId}`, error);
      }
    }
  }
  
  listenerLog(`Resumed ${resumed}/${count} listeners`);
  
  return resumed;
}

/**
 * Unsubscribe and clear all listeners (for logout)
 */
export function clearAllListeners() {
  listenerLog(`Clearing all listeners...`, { 
    active: activeListeners.size,
    paused: pausedListeners.size 
  });
  
  // Unsubscribe all active listeners
  for (const [listenerId, unsubscribe] of activeListeners.entries()) {
    try {
      if (unsubscribe) unsubscribe();
    } catch (error) {
      listenerLog(`Error clearing listener: ${listenerId}`, error);
    }
  }
  
  // Clear both maps
  activeListeners.clear();
  pausedListeners.clear();
  
  listenerLog(`All listeners cleared`);
}

/**
 * Get count of active listeners
 * @returns {number} Number of active listeners
 */
export function getActiveListenerCount() {
  return activeListeners.size;
}

/**
 * Get list of all registered listener IDs
 * @returns {string[]} Array of listener IDs
 */
export function getActiveListenerIds() {
  return Array.from(activeListeners.keys());
}

/**
 * Check if a specific listener is active
 * @param {string} listenerId - Listener ID to check
 * @returns {boolean} True if listener is active
 */
export function isListenerActive(listenerId) {
  return activeListeners.has(listenerId);
}

