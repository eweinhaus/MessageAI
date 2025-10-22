// Clear All Data Script (Admin SDK Version)
// Clears ALL data from Firestore including subcollections
// Run with: node clearAllData.js (from functions directory)

const admin = require("firebase-admin");

// Initialize Firebase Admin
// This will use Application Default Credentials or FIREBASE_CONFIG
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Delete a collection and all its documents
 * @param {string} collectionPath - Path to collection
 * @return {Promise<number>} - Number of documents deleted
 */
async function deleteCollection(collectionPath) {
  console.log(`\n🗑️  Deleting ${collectionPath}...`);
  const snapshot = await db.collection(collectionPath).get();

  let count = 0;
  const batchSize = 500;
  const batches = [];

  let batch = db.batch();
  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
    count++;

    if (count % batchSize === 0) {
      batches.push(batch.commit());
      batch = db.batch();
    }
  });

  // Commit final batch
  if (count % batchSize !== 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  console.log(`✅ Deleted ${count} documents from ${collectionPath}`);
  return count;
}

/**
 * Delete all messages from all chats (including subcollections)
 * @return {Promise<number>} - Total messages deleted
 */
async function deleteAllMessages() {
  console.log("\n🗑️  Deleting all messages from all chats...");

  const chatsSnapshot = await db.collection("chats").get();
  let totalMessages = 0;

  for (const chatDoc of chatsSnapshot.docs) {
    const chatId = chatDoc.id;

    // Delete messages subcollection
    const messagesSnapshot = await db.collection("chats")
        .doc(chatId)
        .collection("messages")
        .get();

    const batch = db.batch();
    messagesSnapshot.forEach((messageDoc) => {
      batch.delete(messageDoc.ref);
      totalMessages++;
    });

    if (messagesSnapshot.size > 0) {
      await batch.commit();
    }

    // Delete typing subcollection
    const typingSnapshot = await db.collection("chats")
        .doc(chatId)
        .collection("typing")
        .get();

    const typingBatch = db.batch();
    let typingCount = 0;
    typingSnapshot.forEach((typingDoc) => {
      typingBatch.delete(typingDoc.ref);
      typingCount++;
    });

    if (typingCount > 0) {
      await typingBatch.commit();
      console.log(`   Deleted ${typingCount} typing indicators from ${chatId}`);
    }
  }

  console.log(`✅ Deleted ${totalMessages} messages total`);
  return totalMessages;
}

/**
 * Delete AI cache entries
 * @return {Promise<number>} - Cache entries deleted
 */
async function deleteAICache() {
  console.log("\n🗑️  Deleting AI cache...");

  try {
    const cacheSnapshot = await db.collection("ai_cache").get();
    const batch = db.batch();
    let count = 0;

    cacheSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    if (count > 0) {
      await batch.commit();
    }

    console.log(`✅ Deleted ${count} cache entries`);
    return count;
  } catch (error) {
    console.log("   No AI cache found (this is okay)");
    return 0;
  }
}

/**
 * Delete rate limiter entries
 * @return {Promise<number>} - Rate limit entries deleted
 */
async function deleteRateLimits() {
  console.log("\n🗑️  Deleting rate limit data...");

  try {
    const rateLimitSnapshot = await db.collection("rate_limits").get();
    const batch = db.batch();
    let count = 0;

    rateLimitSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    if (count > 0) {
      await batch.commit();
    }

    console.log(`✅ Deleted ${count} rate limit entries`);
    return count;
  } catch (error) {
    console.log("   No rate limit data found (this is okay)");
    return 0;
  }
}

/**
 * Main function to clear all data
 */
async function clearAllData() {
  try {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔥 CLEARING ALL FIRESTORE DATA");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  This will delete ALL data:");
    console.log("   - Users collection");
    console.log("   - Chats collection");
    console.log("   - All messages (subcollections)");
    console.log("   - Typing indicators");
    console.log("   - AI cache");
    console.log("   - Rate limit data");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Wait 3 seconds to allow user to cancel
    console.log("⏳ Starting in 3 seconds... (Press Ctrl+C to cancel)");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const stats = {
      messages: 0,
      chats: 0,
      users: 0,
      cache: 0,
      rateLimits: 0,
    };

    // 1. Delete all messages and subcollections
    stats.messages = await deleteAllMessages();

    // 2. Delete AI cache
    stats.cache = await deleteAICache();

    // 3. Delete rate limits
    stats.rateLimits = await deleteRateLimits();

    // 4. Delete chats collection
    stats.chats = await deleteCollection("chats");

    // 5. Delete users collection
    stats.users = await deleteCollection("users");

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ CLEANUP COMPLETE!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Summary:");
    console.log(`   Users deleted: ${stats.users}`);
    console.log(`   Chats deleted: ${stats.chats}`);
    console.log(`   Messages deleted: ${stats.messages}`);
    console.log(`   Cache entries deleted: ${stats.cache}`);
    console.log(`   Rate limits deleted: ${stats.rateLimits}`);

    const total = stats.users + stats.chats +
      stats.messages + stats.cache + stats.rateLimits;
    console.log(`   Total documents: ${total}`);

    console.log("\n💡 Notes:");
    console.log("   - SQLite data on devices will be cleared on next restart");
    console.log("   - Firebase Auth users still exist (not deleted)");
    console.log("   - Users can still login with existing credentials");
    console.log("   - User profiles will be recreated on next login");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error clearing data:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
clearAllData();

