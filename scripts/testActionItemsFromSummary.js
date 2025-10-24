/**
 * Test script to verify action items from summary are stored correctly
 *
 * This script tests the fix for the issue where tasks created by the summary
 * feature were not appearing in the Tasks tab.
 *
 * Usage:
 * 1. Create test messages in a chat that contain action items
 * 2. Run this script to trigger a summary
 * 3. Check if action items appear in the Tasks tab
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration (replace with your test config)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

async function testActionItemsFromSummary() {
  try {
    console.log('🔍 Testing action items from summary...');

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const functions = getFunctions(app);

    // Sign in with test user
    console.log('🔐 Signing in...');
    await signInWithEmailAndPassword(auth, process.env.TEST_EMAIL, process.env.TEST_PASSWORD);
    console.log('✅ Signed in successfully');

    // Call the summary function
    console.log('📋 Calling summarizeUnreadGlobal...');
    const summarizeUnreadGlobal = httpsCallable(functions, 'summarizeUnread');

    const result = await summarizeUnreadGlobal({
      forceRefresh: true,
      mode: 'rich'
    });

    console.log('📊 Summary result:', {
      success: result.data.success,
      hasUnread: result.data.hasUnread,
      chatCount: result.data.chatCount,
      totalMessageCount: result.data.totalMessageCount,
      actionItemsCount: result.data.actionItems?.length || 0,
      decisionsCount: result.data.decisions?.length || 0,
    });

    if (result.data.success && result.data.hasUnread) {
      // Check if action items were extracted
      if (result.data.actionItems && result.data.actionItems.length > 0) {
        console.log('✅ Action items extracted from summary:');
        result.data.actionItems.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.task || item.text} (${item.chatName})`);
        });
      }

      if (result.data.decisions && result.data.decisions.length > 0) {
        console.log('✅ Decisions extracted from summary:');
        result.data.decisions.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.task || item.text} (${item.chatName})`);
        });
      }

      // Check if items were stored in Firestore
      console.log('🔍 Checking Firestore for stored action items...');
      const { getFirestore, collectionGroup, query, where, getDocs } = require('firebase/firestore');
      const db = getFirestore();

      const actionItemsQuery = query(
        collectionGroup(db, "actionItems"),
        where("userId", "==", auth.currentUser.uid)
      );

      const snapshot = await getDocs(actionItemsQuery);
      const storedItems = [];

      snapshot.forEach((doc) => {
        storedItems.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`📦 Found ${storedItems.length} action items in Firestore:`);
      storedItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.task} (${item.type}, ${item.status}) - ${item.chatId}`);
      });

      // Verify that summary-generated items are in the stored items
      const summaryItems = [...(result.data.actionItems || []), ...(result.data.decisions || [])];
      let matchesFound = 0;

      summaryItems.forEach((summaryItem) => {
        const storedMatch = storedItems.find((storedItem) =>
          storedItem.task === (summaryItem.task || summaryItem.text) &&
          storedItem.chatId === summaryItem.chatId
        );

        if (storedMatch) {
          matchesFound++;
          console.log(`✅ Match found: "${summaryItem.task || summaryItem.text}" stored as ${storedMatch.type}`);
        } else {
          console.log(`❌ No match found: "${summaryItem.task || summaryItem.text}"`);
        }
      });

      console.log(`📊 Results: ${matchesFound}/${summaryItems.length} summary items stored in Firestore`);

      if (matchesFound === summaryItems.length && summaryItems.length > 0) {
        console.log('🎉 SUCCESS: All summary action items were stored correctly!');
        console.log('✅ The fix is working - action items from summary should now appear in the Tasks tab');
      } else if (summaryItems.length === 0) {
        console.log('ℹ️  No action items were extracted from the summary (this is normal if no actionable content)');
      } else {
        console.log('⚠️  Some action items may not have been stored. Check the implementation.');
      }
    } else {
      console.log('ℹ️  No unread messages found to summarize');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testActionItemsFromSummary();
}

module.exports = { testActionItemsFromSummary };
