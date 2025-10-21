// Message Database Service - CRUD operations for SQLite
import { getDb } from './database';

/**
 * Check if a message exists in SQLite
 * @param {string} messageID - Message ID to check
 * @returns {Promise<boolean>} True if message exists
 */
export async function messageExists(messageID) {
  try {
    const db = getDb();
    const result = await db.getFirstAsync(
      'SELECT messageID FROM messages WHERE messageID = ? LIMIT 1',
      [messageID]
    );
    return result !== null;
  } catch (error) {
    console.error('[SQLite] Error checking message existence:', error);
    return false;
  }
}

/**
 * Insert a message into SQLite
 * @param {Object} message - Message object
 * @returns {Promise<void>}
 */
export async function insertMessage(message) {
  try {
    const db = getDb();
    
    // Validate required fields
    if (!message.messageID || !message.chatID || !message.text) {
      console.warn('[SQLite] Skipping invalid message:', message);
      return;
    }
    
    await db.runAsync(
      `INSERT OR REPLACE INTO messages 
       (messageID, chatID, senderID, senderName, text, timestamp, deliveryStatus, readBy, syncStatus, retryCount, lastSyncAttempt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.messageID,
        message.chatID,
        message.senderID || '',
        message.senderName || 'Unknown',
        message.text,
        message.timestamp || Date.now(),
        message.deliveryStatus || 'sending',
        JSON.stringify(message.readBy || []),
        message.syncStatus || 'pending',
        message.retryCount || 0,
        message.lastSyncAttempt || null,
        message.createdAt || Date.now(),
      ]
    );

    console.log(`[SQLite] Upserted message ${message.messageID}`);
  } catch (error) {
    console.error('[SQLite] Error inserting message:', error);
    throw error;
  }
}

/**
 * Update a message in SQLite
 * @param {string} messageID - Message ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateMessage(messageID, updates) {
  try {
    const db = getDb();
    
    // Build dynamic UPDATE query based on provided fields
    const fields = [];
    const values = [];
    
    if (updates.deliveryStatus !== undefined) {
      fields.push('deliveryStatus = ?');
      values.push(updates.deliveryStatus);
    }
    if (updates.readBy !== undefined) {
      fields.push('readBy = ?');
      values.push(JSON.stringify(updates.readBy));
    }
    if (updates.syncStatus !== undefined) {
      fields.push('syncStatus = ?');
      values.push(updates.syncStatus);
    }
    if (updates.retryCount !== undefined) {
      fields.push('retryCount = ?');
      values.push(updates.retryCount);
    }
    if (updates.lastSyncAttempt !== undefined) {
      fields.push('lastSyncAttempt = ?');
      values.push(updates.lastSyncAttempt);
    }
    if (updates.text !== undefined) {
      fields.push('text = ?');
      values.push(updates.text);
    }

    if (fields.length === 0) {
      console.warn('[SQLite] No fields to update for message', messageID);
      return;
    }

    values.push(messageID); // For WHERE clause

    const query = `UPDATE messages SET ${fields.join(', ')} WHERE messageID = ?`;
    
    await db.runAsync(query, values);
    
    console.log(`[SQLite] Updated message ${messageID}`);
  } catch (error) {
    console.error('[SQLite] Error updating message:', error);
    throw error;
  }
}

/**
 * Get all messages for a specific chat
 * @param {string} chatID - Chat ID
 * @param {number} limit - Maximum number of messages to retrieve (default 100)
 * @returns {Promise<Array>} Array of message objects
 */
export async function getMessagesForChat(chatID, limit = 100) {
  try {
    const db = getDb();
    
    const rows = await db.getAllAsync(
      `SELECT * FROM messages 
       WHERE chatID = ? 
       ORDER BY timestamp ASC 
       LIMIT ?`,
      [chatID, limit]
    );

    // Parse JSON fields and convert to JS objects
    const messages = rows.map(row => ({
      ...row,
      readBy: JSON.parse(row.readBy || '[]'),
    }));

    console.log(`[SQLite] Retrieved ${messages.length} messages for chat ${chatID}`);
    return messages;
  } catch (error) {
    console.error('[SQLite] Error getting messages for chat:', error);
    throw error;
  }
}

/**
 * Get all pending messages (need to sync to Firestore)
 * @returns {Promise<Array>} Array of message objects with syncStatus 'pending' or 'failed'
 */
export async function getPendingMessages() {
  try {
    const db = getDb();
    
    const rows = await db.getAllAsync(
      `SELECT * FROM messages 
       WHERE syncStatus IN ('pending', 'failed') 
       ORDER BY timestamp ASC`
    );

    const messages = rows.map(row => ({
      ...row,
      readBy: JSON.parse(row.readBy || '[]'),
    }));

    console.log(`[SQLite] Found ${messages.length} pending messages`);
    return messages;
  } catch (error) {
    console.error('[SQLite] Error getting pending messages:', error);
    throw error;
  }
}

/**
 * Update message sync status
 * @param {string} messageID - Message ID
 * @param {string} syncStatus - New sync status ('pending' | 'syncing' | 'synced' | 'failed')
 * @param {number} retryCount - Number of retry attempts
 * @returns {Promise<void>}
 */
export async function updateMessageSyncStatus(messageID, syncStatus, retryCount) {
  try {
    const db = getDb();
    
    await db.runAsync(
      `UPDATE messages 
       SET syncStatus = ?, retryCount = ?, lastSyncAttempt = ? 
       WHERE messageID = ?`,
      [syncStatus, retryCount, Date.now(), messageID]
    );

    console.log(`[SQLite] Updated sync status for ${messageID}: ${syncStatus}`);
  } catch (error) {
    console.error('[SQLite] Error updating sync status:', error);
    throw error;
  }
}

/**
 * Delete a message from SQLite
 * @param {string} messageID - Message ID
 * @returns {Promise<void>}
 */
export async function deleteMessage(messageID) {
  try {
    const db = getDb();
    
    await db.runAsync('DELETE FROM messages WHERE messageID = ?', [messageID]);
    
    console.log(`[SQLite] Deleted message ${messageID}`);
  } catch (error) {
    console.error('[SQLite] Error deleting message:', error);
    throw error;
  }
}

/**
 * Insert or update a chat in SQLite
 * @param {Object} chat - Chat object
 * @returns {Promise<void>}
 */
export async function insertChat(chat) {
  try {
    const db = getDb();
    
    await db.runAsync(
      `INSERT OR REPLACE INTO chats 
       (chatID, type, participantIDs, participantNames, memberIDs, memberNames, groupName, createdBy, lastMessageText, lastMessageTimestamp, lastMessageSenderID, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chat.chatID,
        chat.type,
        JSON.stringify(chat.participantIDs || []),
        JSON.stringify(chat.participantNames || []),
        JSON.stringify(chat.memberIDs || []),
        JSON.stringify(chat.memberNames || []),
        chat.groupName || null,
        chat.createdBy || null,
        chat.lastMessageText || null,
        chat.lastMessageTimestamp || null,
        chat.lastMessageSenderID || null,
        chat.createdAt || Date.now(),
        chat.updatedAt || Date.now(),
      ]
    );

    console.log(`[SQLite] Inserted chat ${chat.chatID}`);
  } catch (error) {
    console.error('[SQLite] Error inserting chat:', error);
    throw error;
  }
}

/**
 * Update a chat in SQLite
 * @param {string} chatID - Chat ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateChat(chatID, updates) {
  try {
    const db = getDb();
    
    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    
    if (updates.lastMessageText !== undefined) {
      fields.push('lastMessageText = ?');
      values.push(updates.lastMessageText);
    }
    if (updates.lastMessageTimestamp !== undefined) {
      fields.push('lastMessageTimestamp = ?');
      values.push(updates.lastMessageTimestamp);
    }
    if (updates.lastMessageSenderID !== undefined) {
      fields.push('lastMessageSenderID = ?');
      values.push(updates.lastMessageSenderID);
    }
    if (updates.groupName !== undefined) {
      fields.push('groupName = ?');
      values.push(updates.groupName);
    }
    if (updates.memberIDs !== undefined) {
      fields.push('memberIDs = ?');
      values.push(JSON.stringify(updates.memberIDs));
    }
    if (updates.memberNames !== undefined) {
      fields.push('memberNames = ?');
      values.push(JSON.stringify(updates.memberNames));
    }
    
    // Always update updatedAt
    fields.push('updatedAt = ?');
    values.push(Date.now());

    if (fields.length === 1) {
      // Only updatedAt, skip
      return;
    }

    values.push(chatID); // For WHERE clause

    const query = `UPDATE chats SET ${fields.join(', ')} WHERE chatID = ?`;
    
    await db.runAsync(query, values);
    
    console.log(`[SQLite] Updated chat ${chatID}`);
  } catch (error) {
    console.error('[SQLite] Error updating chat:', error);
    throw error;
  }
}

/**
 * Get all chats from SQLite
 * @returns {Promise<Array>} Array of chat objects, sorted by lastMessageTimestamp
 */
export async function getAllChats() {
  try {
    const db = getDb();
    
    const rows = await db.getAllAsync(
      `SELECT * FROM chats 
       ORDER BY lastMessageTimestamp DESC`
    );

    // Parse JSON fields
    const chats = rows.map(row => ({
      ...row,
      participantIDs: JSON.parse(row.participantIDs || '[]'),
      participantNames: JSON.parse(row.participantNames || '[]'),
      memberIDs: JSON.parse(row.memberIDs || '[]'),
      memberNames: JSON.parse(row.memberNames || '[]'),
    }));

    console.log(`[SQLite] Retrieved ${chats.length} chats`);
    return chats;
  } catch (error) {
    console.error('[SQLite] Error getting all chats:', error);
    throw error;
  }
}

/**
 * Get a single chat by ID
 * @param {string} chatID - Chat ID
 * @returns {Promise<Object|null>} Chat object or null if not found
 */
export async function getChatByID(chatID) {
  try {
    const db = getDb();
    
    const row = await db.getFirstAsync(
      'SELECT * FROM chats WHERE chatID = ?',
      [chatID]
    );

    if (!row) {
      return null;
    }

    // Parse JSON fields
    const chat = {
      ...row,
      participantIDs: JSON.parse(row.participantIDs || '[]'),
      participantNames: JSON.parse(row.participantNames || '[]'),
      memberIDs: JSON.parse(row.memberIDs || '[]'),
      memberNames: JSON.parse(row.memberNames || '[]'),
    };

    return chat;
  } catch (error) {
    console.error('[SQLite] Error getting chat by ID:', error);
    throw error;
  }
}

