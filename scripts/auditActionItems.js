/**
 * Audit Script: Check action items for missing sourceMessageId
 * 
 * This script audits all action items to identify which ones are missing
 * sourceMessageId and provides statistics.
 * 
 * Usage:
 *   node scripts/auditActionItems.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    console.error('❌ Error: EXPO_PUBLIC_FIREBASE_PROJECT_ID not found in environment');
    process.exit(1);
  }

  console.log(`🔧 Connecting to Firebase project: ${projectId}\n`);

  const possiblePaths = [
    path.join(__dirname, '..', 'serviceAccountKey.json'),
    path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  let credential = null;
  for (const keyPath of possiblePaths) {
    if (fs.existsSync(keyPath)) {
      credential = admin.credential.cert(require(keyPath));
      break;
    }
  }

  if (!credential) {
    try {
      credential = admin.credential.applicationDefault();
    } catch (error) {
      console.error('❌ Error: Could not initialize Firebase Admin credentials');
      console.error('   See scripts/README_BACKFILL.md for setup instructions');
      process.exit(1);
    }
  }

  admin.initializeApp({
    credential: credential,
    projectId: projectId,
  });
}

const db = admin.firestore();

async function auditActionItems() {
  console.log('📊 Action Items Audit Report');
  console.log('================================================\n');

  try {
    // Query all action items
    const snapshot = await db.collectionGroup('actionItems').get();
    
    const stats = {
      total: 0,
      withSourceId: 0,
      withoutSourceId: 0,
      deleted: 0,
      byChat: {},
      byUser: {},
      missingItems: [],
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;

      // Track by chat
      if (data.chatId) {
        stats.byChat[data.chatId] = (stats.byChat[data.chatId] || 0) + 1;
      }

      // Track by user
      if (data.userId) {
        stats.byUser[data.userId] = (stats.byUser[data.userId] || 0) + 1;
      }

      // Check sourceMessageId
      if (data.sourceMessageId) {
        if (data.sourceMessageId === '__deleted__') {
          stats.deleted++;
        } else {
          stats.withSourceId++;
        }
      } else {
        stats.withoutSourceId++;
        stats.missingItems.push({
          id: doc.id,
          chatId: data.chatId,
          task: data.task,
          createdAt: data.createdAt,
        });
      }
    });

    // Print summary
    console.log('📈 SUMMARY');
    console.log('─'.repeat(48));
    console.log(`Total action items:           ${stats.total}`);
    console.log(`With sourceMessageId:         ${stats.withSourceId} (${((stats.withSourceId / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Without sourceMessageId:      ${stats.withoutSourceId} (${((stats.withoutSourceId / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Marked as deleted:            ${stats.deleted} (${((stats.deleted / stats.total) * 100).toFixed(1)}%)`);
    console.log('');

    console.log('📁 BY CHAT');
    console.log('─'.repeat(48));
    const chatEntries = Object.entries(stats.byChat).sort((a, b) => b[1] - a[1]);
    chatEntries.slice(0, 10).forEach(([chatId, count]) => {
      console.log(`  ${chatId.substring(0, 20)}...  ${count} items`);
    });
    if (chatEntries.length > 10) {
      console.log(`  ... and ${chatEntries.length - 10} more chats`);
    }
    console.log('');

    console.log('👥 BY USER');
    console.log('─'.repeat(48));
    const userEntries = Object.entries(stats.byUser).sort((a, b) => b[1] - a[1]);
    userEntries.slice(0, 10).forEach(([userId, count]) => {
      console.log(`  ${userId.substring(0, 30)}...  ${count} items`);
    });
    if (userEntries.length > 10) {
      console.log(`  ... and ${userEntries.length - 10} more users`);
    }
    console.log('');

    if (stats.missingItems.length > 0) {
      console.log('⚠️  ITEMS MISSING sourceMessageId');
      console.log('─'.repeat(48));
      stats.missingItems.slice(0, 20).forEach(item => {
        console.log(`  ${item.id}`);
        console.log(`    Task: ${item.task?.substring(0, 60)}...`);
        console.log(`    Chat: ${item.chatId}`);
        console.log('');
      });
      if (stats.missingItems.length > 20) {
        console.log(`  ... and ${stats.missingItems.length - 20} more items`);
      }
      console.log('');
      console.log('💡 Run backfill script to fix these items:');
      console.log('   node scripts/backfillSourceMessageId.js --dry-run --limit 10');
    } else {
      console.log('✅ All action items have sourceMessageId!');
    }

    console.log('');
    console.log('================================================');
    console.log('Audit complete!');
    
  } catch (error) {
    console.error('❌ Error during audit:', error);
    throw error;
  }
}

// Run the audit
auditActionItems()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Audit failed:', error);
    process.exit(1);
  });

