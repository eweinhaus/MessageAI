// Offline Queue Processor - Handles sending pending messages
/**
 * Processes messages that were sent while offline or failed to send
 * PR8 Full Implementation with exponential backoff and retry logic
 */

import { getPendingMessages, updateMessageSyncStatus, updateMessage } from '../db/messageDb';
import { writeToFirestore } from '../services/messageService';
import useMessageStore from '../store/messageStore';
import { getCurrentNetworkStatus } from './networkStatus';

// Sleep utility for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Track if processor is running to prevent concurrent execution
let isProcessing = false;

/**
 * Process all pending messages in the queue
 * Attempts to send messages to Firestore with exponential backoff
 * @returns {Promise<Object>} Results { success: number, failed: number }
 */
export async function processPendingMessages() {
  // Prevent concurrent processing
  if (isProcessing) {
    console.log('[OfflineQueue] Already processing, skipping...');
    return { success: 0, failed: 0 };
  }

  try {
    isProcessing = true;
    
    console.log('[OfflineQueue] Processing pending messages...');
    
    // Check network status first
    const networkStatus = await getCurrentNetworkStatus();
    if (!networkStatus.isOnline) {
      console.log('[OfflineQueue] Device is offline, skipping queue processing');
      return { success: 0, failed: 0 };
    }
    
    // Get all messages that need to be synced
    const pendingMessages = await getPendingMessages();
    
    if (pendingMessages.length === 0) {
      console.log('[OfflineQueue] No pending messages to process');
      return { success: 0, failed: 0 };
    }

    console.log(`[OfflineQueue] Found ${pendingMessages.length} pending messages`);
    
    let success = 0;
    let failed = 0;

    // Process messages sequentially to preserve order
    for (const message of pendingMessages) {
      // Check retry count (max 5 attempts)
      if (message.retryCount >= 5) {
        console.log(`[OfflineQueue] Message ${message.messageID} exceeded max retries (${message.retryCount})`);
        
        // Mark as failed
        await updateMessageSyncStatus(message.messageID, 'failed', message.retryCount);
        await updateMessage(message.messageID, { deliveryStatus: 'failed' });
        
        // Update Zustand store
        useMessageStore.getState().updateMessage(message.chatID, message.messageID, {
          syncStatus: 'failed',
          deliveryStatus: 'failed',
        });
        
        failed++;
        continue;
      }

      // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(Math.pow(2, message.retryCount) * 1000, 30000);
      
      if (message.retryCount > 0) {
        console.log(`[OfflineQueue] Waiting ${delay}ms before retry ${message.retryCount} for message ${message.messageID}`);
        await sleep(delay);
      }
      
      // Attempt to send to Firestore
      console.log(`[OfflineQueue] Attempting to send message ${message.messageID} (retry: ${message.retryCount})`);
      
      try {
        // Mark as syncing
        await updateMessageSyncStatus(message.messageID, 'syncing', message.retryCount);
        
        // Send to Firestore
        await writeToFirestore(message);
        
        // Success: Mark as synced and sent
        await updateMessageSyncStatus(message.messageID, 'synced', message.retryCount);
        await updateMessage(message.messageID, { deliveryStatus: 'sent' });
        
        // Update Zustand store
        useMessageStore.getState().updateMessage(message.chatID, message.messageID, {
          syncStatus: 'synced',
          deliveryStatus: 'sent',
        });
        
        console.log(`[OfflineQueue] Message ${message.messageID} sent successfully`);
        success++;
        
      } catch (error) {
        console.error(`[OfflineQueue] Failed to send message ${message.messageID}:`, error);
        
        // Increment retry count
        const newRetryCount = message.retryCount + 1;
        
        if (newRetryCount >= 5) {
          // Max retries reached, mark as failed
          await updateMessageSyncStatus(message.messageID, 'failed', newRetryCount);
          await updateMessage(message.messageID, { deliveryStatus: 'failed' });
          
          useMessageStore.getState().updateMessage(message.chatID, message.messageID, {
            syncStatus: 'failed',
            deliveryStatus: 'failed',
          });
          
          failed++;
        } else {
          // Still have retries left, mark as pending for next attempt
          await updateMessageSyncStatus(message.messageID, 'pending', newRetryCount);
          
          useMessageStore.getState().updateMessage(message.chatID, message.messageID, {
            syncStatus: 'pending',
            deliveryStatus: 'sending',
          });
        }
      }
    }

    console.log(`[OfflineQueue] Processing complete: ${success} sent, ${failed} failed`);
    
    return { success, failed };
  } catch (error) {
    console.error('[OfflineQueue] Error processing pending messages:', error);
    throw error;
  } finally {
    isProcessing = false;
  }
}

// Network listener reference for cleanup
let networkListenerUnsubscribe = null;

/**
 * Start the queue processor
 * Sets up automatic processing when network comes online
 * @returns {Function} Cleanup function
 */
export function startQueueProcessor() {
  console.log('[OfflineQueue] Starting queue processor...');
  
  // Clean up any existing listener
  if (networkListenerUnsubscribe) {
    networkListenerUnsubscribe();
  }
  
  // Import network listener
  const { addNetworkListener } = require('./networkStatus');
  
  // Set up network listener to auto-process on reconnect
  networkListenerUnsubscribe = addNetworkListener((networkState) => {
    if (networkState.isOnline) {
      console.log('[OfflineQueue] Network reconnected, processing pending messages...');
      processPendingMessages().catch((error) => {
        console.error('[OfflineQueue] Error in auto-processing:', error);
      });
    }
  });
  
  console.log('[OfflineQueue] Queue processor started');
  
  // Return cleanup function
  return () => {
    if (networkListenerUnsubscribe) {
      networkListenerUnsubscribe();
      networkListenerUnsubscribe = null;
    }
    console.log('[OfflineQueue] Queue processor stopped');
  };
}

/**
 * Stop the queue processor
 */
export function stopQueueProcessor() {
  console.log('[OfflineQueue] Stopping queue processor...');
  
  if (networkListenerUnsubscribe) {
    networkListenerUnsubscribe();
    networkListenerUnsubscribe = null;
  }
  
  console.log('[OfflineQueue] Queue processor stopped');
}

/**
 * Retry a specific failed message
 * Resets the message and triggers processing
 * @param {string} messageID - Message ID to retry
 * @param {string} chatID - Chat ID
 * @returns {Promise<boolean>} Success status
 */
export async function retryFailedMessage(messageID, chatID) {
  try {
    console.log(`[OfflineQueue] Retrying message ${messageID}`);
    
    // Reset retry count and sync status
    await updateMessageSyncStatus(messageID, 'pending', 0);
    await updateMessage(messageID, { deliveryStatus: 'sending' });
    
    // Update UI
    useMessageStore.getState().updateMessage(chatID, messageID, {
      syncStatus: 'pending',
      deliveryStatus: 'sending',
    });
    
    // Trigger processing
    await processPendingMessages();
    
    return true;
  } catch (error) {
    console.error('[OfflineQueue] Error retrying message:', error);
    return false;
  }
}

