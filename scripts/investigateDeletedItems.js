/**
 * Investigate Script: Find items marked as deleted and check if messages actually exist
 *
 * This script examines items with sourceMessageId: '__deleted__' and checks
 * if their original messages might still exist in the chat.
 *
 * Usage:
 *   node scripts/investigateDeletedItems.js
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

async function investigateDeletedItems() {
  console.log('🔍 Investigating Items Marked as Deleted');
  console.log('==========================================\n');

  try {
    // Query all action items
    const snapshot = await db.collectionGroup('actionItems').get();

    const deletedItems = [];
    const workingItems = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.sourceMessageId === '__deleted__') {
        deletedItems.push({
          id: doc.id,
          chatId: data.chatId,
          task: data.task,
          createdAt: data.createdAt,
        });
      } else if (data.sourceMessageId && data.sourceMessageId !== '__deleted__') {
        workingItems.push({
          id: doc.id,
          chatId: data.chatId,
          task: data.task,
          sourceMessageId: data.sourceMessageId,
          createdAt: data.createdAt,
        });
      }
    });

    console.log(`📊 Found ${deletedItems.length} items marked as deleted\n`);

    if (deletedItems.length === 0) {
      console.log('✅ No items marked as deleted!');
      return;
    }

    // Investigate each deleted item
    for (let i = 0; i < deletedItems.length; i++) {
      const item = deletedItems[i];
      console.log(`🔍 [${i + 1}/${deletedItems.length}] Investigating: "${item.task.substring(0, 60)}..."`);
      console.log(`   Chat: ${item.chatId}`);
      console.log(`   Created: ${item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : 'Unknown'}`);

      try {
        // Get all messages from this chat
        const messagesRef = db.collection('chats').doc(item.chatId).collection('messages');
        const messagesSnapshot = await messagesRef
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();

        console.log(`   Found ${messagesSnapshot.size} recent messages in chat`);

        if (messagesSnapshot.empty) {
          console.log(`   ❌ Chat appears to be empty or messages deleted`);
          console.log(`   💡 This item should remain marked as deleted`);
        } else {
          // Look for potential matches
          const taskWords = item.task.toLowerCase().trim().split(/\s+/).filter(word => word.length > 2);

          let bestMatch = null;
          let bestScore = 0;

          messagesSnapshot.forEach(doc => {
            const message = doc.data();
            if (!message.text) return;

            const messageText = message.text.toLowerCase().trim();
            const messageWords = messageText.split(/\s+/).filter(word => word.length > 2);

            // Check for common words
            const commonWords = taskWords.filter(word =>
              messageWords.some(msgWord => msgWord.includes(word) || word.includes(msgWord))
            );

            const score = commonWords.length / Math.max(taskWords.length, messageWords.length);

            if (score > bestScore && score > 0.3) {
              bestScore = score;
              bestMatch = {
                messageID: doc.id,
                text: message.text,
                score: score,
                timestamp: message.timestamp,
              };
            }
          });

          if (bestMatch) {
            console.log(`   ✅ Potential match found! (${(bestScore * 100).toFixed(1)}% similarity)`);
            console.log(`      Message: "${bestMatch.text.substring(0, 80)}..."`);
            console.log(`      Message ID: ${bestMatch.messageID}`);
            console.log(`      💡 This item should be updated with this message ID!`);
          } else {
            console.log(`   ❌ No good matches found in recent messages`);
            console.log(`   💡 Messages may be older, or item text doesn't match message content`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error accessing chat: ${error.message}`);
      }

      console.log('');
    }

    console.log('📋 SUMMARY');
    console.log('─'.repeat(50));
    console.log(`Items marked as deleted: ${deletedItems.length}`);
    console.log(`Items with working context: ${workingItems.length}`);
    console.log(`Total items: ${deletedItems.length + workingItems.length}`);

    if (deletedItems.some(item => item.chatId)) {
      console.log('\n🔧 To fix items with potential matches, run:');
      console.log('   node scripts/backfillSourceMessageId.js');
    }

    console.log('\n🎯 Items marked as deleted may have:');
    console.log('   • Original messages actually deleted');
    console.log('   • Messages too old (not in recent 50)');
    console.log('   • Task text that doesn\'t match message content');
    console.log('   • Items created from AI summaries rather than direct messages');

  } catch (error) {
    console.error('❌ Error during investigation:', error);
    throw error;
  }
}

// Run the investigation
investigateDeletedItems()
  .then(() => {
    console.log('\n🎉 Investigation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Investigation failed:', error);
    process.exit(1);
  });

