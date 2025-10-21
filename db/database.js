// SQLite Database Initialization
import * as SQLite from 'expo-sqlite';

// Database name and version
const DB_NAME = 'messageai.db';
const DB_VERSION = 1;

// Singleton database instance
let dbInstance = null;

/**
 * Get or create the database instance
 * @returns {SQLite.SQLiteDatabase} Database instance
 */
export function getDb() {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DB_NAME);
  }
  return dbInstance;
}

/**
 * Initialize the SQLite database
 * Creates tables and indexes if they don't exist
 * Handles schema migrations via PRAGMA user_version
 * @returns {Promise<void>}
 */
export async function initDatabase() {
  try {
    console.log('[SQLite] Initializing database...');
    const db = getDb();

    // Check current schema version
    const result = db.getFirstSync('PRAGMA user_version');
    const currentVersion = result?.user_version || 0;

    console.log(`[SQLite] Current schema version: ${currentVersion}`);

    if (currentVersion < DB_VERSION) {
      // Run migrations in a transaction
      await db.execAsync(`
        BEGIN TRANSACTION;

        -- Create chats table
        CREATE TABLE IF NOT EXISTS chats (
          chatID TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          participantIDs TEXT,
          participantNames TEXT,
          memberIDs TEXT,
          memberNames TEXT,
          groupName TEXT,
          createdBy TEXT,
          lastMessageText TEXT,
          lastMessageTimestamp INTEGER,
          lastMessageSenderID TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );

        -- Create messages table
        CREATE TABLE IF NOT EXISTS messages (
          messageID TEXT PRIMARY KEY,
          chatID TEXT NOT NULL,
          senderID TEXT NOT NULL,
          senderName TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          deliveryStatus TEXT NOT NULL DEFAULT 'sending',
          readBy TEXT,
          syncStatus TEXT NOT NULL DEFAULT 'pending',
          retryCount INTEGER NOT NULL DEFAULT 0,
          lastSyncAttempt INTEGER,
          createdAt INTEGER NOT NULL
        );

        -- Create indexes for efficient queries
        CREATE INDEX IF NOT EXISTS idx_messages_chatID ON messages(chatID);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_syncStatus ON messages(syncStatus);
        CREATE INDEX IF NOT EXISTS idx_chats_updatedAt ON chats(updatedAt);

        -- Update schema version
        PRAGMA user_version = ${DB_VERSION};

        COMMIT;
      `);

      console.log(`[SQLite] Database initialized successfully (version ${DB_VERSION})`);
    } else {
      console.log('[SQLite] Database schema is up to date');
    }

    // Log table info for debugging
    const tables = db.getAllSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log('[SQLite] Tables:', tables.map(t => t.name).join(', '));

  } catch (error) {
    console.error('[SQLite] Database initialization error:', error);
    throw error;
  }
}

/**
 * Close the database connection
 * (Usually not needed, but useful for testing)
 */
export function closeDatabase() {
  if (dbInstance) {
    // Note: expo-sqlite doesn't have explicit close in the new API
    // Just reset the instance
    dbInstance = null;
    console.log('[SQLite] Database connection closed');
  }
}

/**
 * Flush all pending SQLite writes
 * Ensures all transactions are committed before app backgrounds
 * @returns {Promise<void>}
 */
export async function flushPendingWrites() {
  try {
    const db = getDb();
    // Execute a dummy transaction to force commit of any pending writes
    await db.execAsync(`
      BEGIN TRANSACTION;
      SELECT 1;
      COMMIT;
    `);
    console.log('[SQLite] Flushed pending writes');
  } catch (error) {
    console.error('[SQLite] Error flushing pending writes:', error);
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Clear all data from the database (for testing/logout)
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  try {
    const db = getDb();
    await db.execAsync(`
      BEGIN TRANSACTION;
      DELETE FROM messages;
      DELETE FROM chats;
      COMMIT;
    `);
    console.log('[SQLite] All data cleared');
  } catch (error) {
    console.error('[SQLite] Error clearing data:', error);
    throw error;
  }
}

