// Script to fix invalid user documents in Firestore
// Run with: node scripts/fixInvalidUsers.js

const admin = require('firebase-admin');

// Check if service account key exists
let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (error) {
  console.error('❌ Error: Service account key not found!');
  console.error('');
  console.error('To use this script, you need to:');
  console.error('1. Go to Firebase Console: https://console.firebase.google.com');
  console.error('2. Select your project: MessageAI-dev');
  console.error('3. Go to Project Settings > Service Accounts');
  console.error('4. Click "Generate new private key"');
  console.error('5. Save as scripts/serviceAccountKey.json');
  console.error('');
  console.error('OR you can fix users manually in Firebase Console:');
  console.error('1. Go to Firestore Database > users collection');
  console.error('2. For each user document, ensure it has:');
  console.error('   - userID field (same as document ID)');
  console.error('   - displayName field (not empty)');
  console.error('   - email field (not empty)');
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixInvalidUsers() {
  try {
    console.log('=== Checking and fixing invalid users ===\n');
    
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`Total user documents: ${usersSnapshot.size}\n`);
    
    const fixes = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const docId = doc.id;
      const updates = {};
      
      console.log(`Checking user: ${docId}`);
      
      // Check userID
      if (!userData.userID) {
        console.log(`  ❌ Missing userID - will set to document ID`);
        updates.userID = docId;
      }
      
      // Check displayName
      if (!userData.displayName) {
        console.log(`  ❌ Missing displayName`);
        // Try to generate from email
        if (userData.email) {
          const nameFromEmail = userData.email.split('@')[0];
          updates.displayName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
          console.log(`  ✓ Will set displayName to: ${updates.displayName}`);
        } else {
          updates.displayName = `User_${docId.substring(0, 6)}`;
          console.log(`  ✓ Will set displayName to: ${updates.displayName}`);
        }
      }
      
      // Check email
      if (!userData.email) {
        console.log(`  ❌ Missing email - cannot auto-fix`);
        console.log(`  ⚠️ You must manually add email in Firebase Console`);
      }
      
      // Apply fixes
      if (Object.keys(updates).length > 0) {
        console.log(`  🔧 Applying fixes...`);
        await doc.ref.update({
          ...updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`  ✅ Fixed!\n`);
        fixes.push({ docId, updates });
      } else {
        console.log(`  ✅ No issues found\n`);
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total users checked: ${usersSnapshot.size}`);
    console.log(`Users fixed: ${fixes.length}`);
    
    if (fixes.length > 0) {
      console.log('\nFixed users:');
      fixes.forEach(({ docId, updates }) => {
        console.log(`  - ${docId}:`);
        Object.entries(updates).forEach(([field, value]) => {
          console.log(`      ${field}: ${value}`);
        });
      });
    }
    
    console.log('\n✅ Done! Try refreshing your contacts screen now.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing users:', error);
    process.exit(1);
  }
}

fixInvalidUsers();

