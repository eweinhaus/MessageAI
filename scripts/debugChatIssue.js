// Debug script to check chat document in Firestore
const admin = require('firebase-admin');
const serviceAccount = require('../functions/serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function debugChatIssue() {
  try {
    console.log('\n=== DEBUG: Chat Issue ===\n');
    
    // First, find Ethan Weinhaus and Jane Doe in users collection
    console.log('1. Finding users...');
    const usersSnapshot = await db.collection('users').get();
    
    let ethanUser = null;
    let janeUser = null;
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.displayName === 'Ethan Weinhaus') {
        ethanUser = { id: doc.id, ...data };
        console.log('   ✅ Found Ethan Weinhaus:', doc.id);
      }
      if (data.displayName === 'Jane Doe') {
        janeUser = { id: doc.id, ...data };
        console.log('   ✅ Found Jane Doe:', doc.id);
      }
    });
    
    if (!ethanUser) {
      console.log('   ❌ Ethan Weinhaus not found in users collection');
      return;
    }
    
    if (!janeUser) {
      console.log('   ❌ Jane Doe not found in users collection');
      return;
    }
    
    console.log('\n2. Looking for chat between Ethan and Jane...');
    
    // Generate expected chatID for 1:1 chat
    const expectedChatID = [ethanUser.id, janeUser.id].sort().join('_');
    console.log('   Expected 1:1 chatID:', expectedChatID);
    
    // Check if this chat exists
    const chatDoc = await db.collection('chats').doc(expectedChatID).get();
    
    if (chatDoc.exists) {
      console.log('   ✅ Chat document EXISTS');
      const chatData = chatDoc.data();
      console.log('   Chat data:', JSON.stringify(chatData, null, 2));
      console.log('\n   Checking participantIDs:');
      console.log('     - Contains Ethan?', chatData.participantIDs?.includes(ethanUser.id));
      console.log('     - Contains Jane?', chatData.participantIDs?.includes(janeUser.id));
    } else {
      console.log('   ❌ Chat document DOES NOT EXIST');
      console.log('\n   This is the problem! Jane sent a message but the chat was never created.');
    }
    
    // Check all chats where Ethan is a participant
    console.log('\n3. All chats where Ethan is a participant:');
    const ethanChatsSnapshot = await db.collection('chats')
      .where('participantIDs', 'array-contains', ethanUser.id)
      .get();
    
    console.log(`   Found ${ethanChatsSnapshot.size} chats`);
    ethanChatsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`   - ${doc.id}: ${data.type} chat with ${data.participantNames?.join(', ') || data.groupName}`);
    });
    
    // Check for messages in the expected chat
    console.log('\n4. Checking for messages in expected chat...');
    const messagesSnapshot = await db.collection('chats').doc(expectedChatID)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (messagesSnapshot.empty) {
      console.log('   ❌ No messages found (or chat doesn\'t exist)');
    } else {
      console.log(`   ✅ Found ${messagesSnapshot.size} messages:`);
      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - [${data.senderName}]: ${data.text}`);
      });
    }
    
    console.log('\n=== END DEBUG ===\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugChatIssue();
