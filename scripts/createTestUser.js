// Script to create test users in Firebase
// Run with: node scripts/createTestUser.js

const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need to add your service account key)
// Download from: Firebase Console > Project Settings > Service Accounts > Generate new private key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function createTestUser(email, password, displayName) {
  try {
    console.log(`Creating user: ${email}...`);
    
    // 1. Create auth user
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: displayName,
    });
    
    console.log(`✅ Auth user created with UID: ${userRecord.uid}`);
    
    // 2. Create Firestore profile
    await db.collection('users').doc(userRecord.uid).set({
      userID: userRecord.uid,
      email: email,
      displayName: displayName,
      isOnline: false,
      lastSeenTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      fcmToken: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Firestore profile created for ${displayName}`);
    console.log('');
    
    return userRecord;
  } catch (error) {
    console.error(`❌ Error creating user ${email}:`, error.message);
  }
}

async function createTestUsers() {
  console.log('🚀 Creating test users...\n');
  
  // Create multiple test users
  await createTestUser('test1@example.com', 'password123', 'Alice Johnson');
  await createTestUser('test2@example.com', 'password123', 'Bob Smith');
  await createTestUser('test3@example.com', 'password123', 'Charlie Davis');
  await createTestUser('test4@example.com', 'password123', 'Diana Martinez');
  await createTestUser('test5@example.com', 'password123', 'Ethan Wilson');
  
  console.log('✅ All test users created!');
  console.log('\nYou can now login with:');
  console.log('  - test1@example.com / password123');
  console.log('  - test2@example.com / password123');
  console.log('  - test3@example.com / password123');
  console.log('  - test4@example.com / password123');
  console.log('  - test5@example.com / password123');
  
  process.exit(0);
}

createTestUsers();

