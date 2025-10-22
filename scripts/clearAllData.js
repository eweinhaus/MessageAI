// Clear All Data Script
// Clears all users, chats, and messages from Firestore
// Run with: node scripts/clearAllData.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

// Load environment variables
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteCollection(collectionPath) {
  console.log(`\n🗑️  Deleting ${collectionPath}...`);
  const snapshot = await getDocs(collection(db, collectionPath));
  
  let count = 0;
  const deletePromises = [];
  
  snapshot.forEach((document) => {
    deletePromises.push(deleteDoc(doc(db, collectionPath, document.id)));
    count++;
  });
  
  await Promise.all(deletePromises);
  console.log(`✅ Deleted ${count} documents from ${collectionPath}`);
  return count;
}

async function deleteMessagesFromChats() {
  console.log('\n🗑️  Deleting messages from all chats...');
  
  // Get all chats
  const chatsSnapshot = await getDocs(collection(db, 'chats'));
  let totalMessages = 0;
  
  for (const chatDoc of chatsSnapshot.docs) {
    const chatId = chatDoc.id;
    const messagesPath = `chats/${chatId}/messages`;
    
    const messagesSnapshot = await getDocs(collection(db, messagesPath));
    const deletePromises = [];
    
    messagesSnapshot.forEach((messageDoc) => {
      deletePromises.push(deleteDoc(doc(db, messagesPath, messageDoc.id)));
      totalMessages++;
    });
    
    await Promise.all(deletePromises);
  }
  
  console.log(`✅ Deleted ${totalMessages} messages from all chats`);
  return totalMessages;
}

async function clearAllData() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔥 CLEARING ALL FIRESTORE DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  This will delete ALL data from:');
    console.log('   - Users collection');
    console.log('   - Chats collection');
    console.log('   - All messages in all chats');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Wait 3 seconds to allow user to cancel
    console.log('⏳ Starting in 3 seconds... (Press Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Delete messages from all chats (subcollections)
    const messageCount = await deleteMessagesFromChats();
    
    // Delete chats
    const chatCount = await deleteCollection('chats');
    
    // Delete users
    const userCount = await deleteCollection('users');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CLEANUP COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Summary:`);
    console.log(`   Users deleted: ${userCount}`);
    console.log(`   Chats deleted: ${chatCount}`);
    console.log(`   Messages deleted: ${messageCount}`);
    console.log(`   Total: ${userCount + chatCount + messageCount} documents`);
    console.log('\n💡 Note: SQLite data on device will be cleared on next app restart');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error clearing data:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
clearAllData();




