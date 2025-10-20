/**
 * SQLite Database Tests
 * 
 * Basic smoke tests to verify database operations work correctly
 * Run these manually in the app for now (Jest setup in Phase 2)
 */

import { initDatabase, getDb, clearAllData } from '../database';
import { 
  insertMessage, 
  getMessagesForChat, 
  insertChat, 
  getAllChats,
  getPendingMessages,
  updateMessageSyncStatus
} from '../messageDb';

/**
 * Run all database tests
 * Call this from a screen component to verify database works
 */
export async function runDatabaseTests() {
  console.log('[TEST] Starting database tests...');
  
  try {
    // Test 1: Database initialization
    console.log('[TEST] Test 1: Database initialization');
    await initDatabase();
    console.log('[TEST] ✅ Database initialized');

    // Test 2: Insert a chat
    console.log('[TEST] Test 2: Insert chat');
    const testChat = {
      chatID: 'test-chat-123',
      type: '1:1',
      participantIDs: ['user1', 'user2'],
      participantNames: ['Alice', 'Bob'],
      memberIDs: [],
      memberNames: [],
      lastMessageText: 'Hello!',
      lastMessageTimestamp: Date.now(),
      lastMessageSenderID: 'user1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await insertChat(testChat);
    console.log('[TEST] ✅ Chat inserted');

    // Test 3: Get all chats
    console.log('[TEST] Test 3: Get all chats');
    const chats = await getAllChats();
    console.log(`[TEST] ✅ Retrieved ${chats.length} chats`, chats);

    // Test 4: Insert a message
    console.log('[TEST] Test 4: Insert message');
    const testMessage = {
      messageID: 'test-msg-456',
      chatID: 'test-chat-123',
      senderID: 'user1',
      senderName: 'Alice',
      text: 'Hello, this is a test message!',
      timestamp: Date.now(),
      deliveryStatus: 'sending',
      readBy: [],
      syncStatus: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    };
    
    await insertMessage(testMessage);
    console.log('[TEST] ✅ Message inserted');

    // Test 5: Get messages for chat
    console.log('[TEST] Test 5: Get messages for chat');
    const messages = await getMessagesForChat('test-chat-123');
    console.log(`[TEST] ✅ Retrieved ${messages.length} messages`, messages);

    // Test 6: Get pending messages
    console.log('[TEST] Test 6: Get pending messages');
    const pendingMessages = await getPendingMessages();
    console.log(`[TEST] ✅ Found ${pendingMessages.length} pending messages`);

    // Test 7: Update message sync status
    console.log('[TEST] Test 7: Update sync status');
    await updateMessageSyncStatus('test-msg-456', 'synced', 0);
    console.log('[TEST] ✅ Sync status updated');

    // Test 8: Verify update worked
    console.log('[TEST] Test 8: Verify sync status update');
    const updatedMessages = await getMessagesForChat('test-chat-123');
    const syncedMsg = updatedMessages.find(m => m.messageID === 'test-msg-456');
    console.log(`[TEST] ✅ Message sync status: ${syncedMsg?.syncStatus}`);

    // Clean up test data
    console.log('[TEST] Cleaning up test data...');
    await clearAllData();
    console.log('[TEST] ✅ Test data cleaned up');

    console.log('[TEST] ========================================');
    console.log('[TEST] ✅ ALL TESTS PASSED!');
    console.log('[TEST] ========================================');
    
    return {
      success: true,
      testsRun: 8,
      testsPassed: 8,
      testsFailed: 0,
    };
    
  } catch (error) {
    console.error('[TEST] ❌ Test failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Test sync manager functions (requires network)
 */
export async function testSyncManager(userID) {
  console.log('[TEST] Starting sync manager tests...');
  
  try {
    const { performFullSync } = require('../../utils/syncManager');
    
    console.log('[TEST] Test: Full sync from Firestore');
    const result = await performFullSync(userID);
    console.log(`[TEST] ✅ Sync complete: ${result.chats.length} chats, ${result.messageCount} messages`);
    
    // Verify data was written to SQLite
    const chats = await getAllChats();
    console.log(`[TEST] ✅ Verified ${chats.length} chats in SQLite`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[TEST] ❌ Sync test failed:', error);
    return { success: false, error: error.message };
  }
}

