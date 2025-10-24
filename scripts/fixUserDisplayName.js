/**
 * Fix User DisplayName Script
 * 
 * This script updates a user's displayName and propagates the change
 * to all chats they're part of.
 * 
 * Usage:
 *   node scripts/fixUserDisplayName.js <userEmail> <newDisplayName>
 * 
 * Example:
 *   node scripts/fixUserDisplayName.js janedoe@example.com "Jane Doe"
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function fixUserDisplayName(userEmail, newDisplayName) {
  try {
    // Validate inputs
    if (!userEmail || !newDisplayName) {
      console.error("\n❌ Usage: node scripts/fixUserDisplayName.js <userEmail> <newDisplayName>");
      console.error('   Example: node scripts/fixUserDisplayName.js janedoe@example.com "Jane Doe"');
      process.exit(1);
    }
    
    console.log("\n=== Fix User DisplayName ===\n");
    console.log(`Email:          ${userEmail}`);
    console.log(`New DisplayName: ${newDisplayName}\n`);
    
    // Step 1: Find the user
    console.log("📋 Step 1: Finding user...");
    const usersSnapshot = await db.collection("users")
      .where("email", "==", userEmail)
      .get();
    
    if (usersSnapshot.empty) {
      console.error(`\n❌ No user found with email: ${userEmail}`);
      process.exit(1);
    }
    
    if (usersSnapshot.size > 1) {
      console.error(`\n❌ Multiple users found with email: ${userEmail}`);
      console.error("   This shouldn't happen. Please check your database.");
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const oldDisplayName = userDoc.data().displayName;
    
    console.log(`✅ Found user: ${userId}`);
    console.log(`   Old DisplayName: "${oldDisplayName}"`);
    console.log(`   New DisplayName: "${newDisplayName}"`);
    
    // Step 2: Update user profile
    console.log("\n📋 Step 2: Updating user profile...");
    await db.collection("users").doc(userId).update({
      displayName: newDisplayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("✅ User profile updated");
    
    // Step 3: Find and update all chats
    console.log("\n📋 Step 3: Updating chats...");
    
    // Find chats where user is a participant (1:1 chats)
    const oneOnOneChats = await db.collection("chats")
      .where("type", "==", "1:1")
      .where("participantIDs", "array-contains", userId)
      .get();
    
    // Find chats where user is a member (group chats)
    const groupChats = await db.collection("chats")
      .where("type", "==", "group")
      .where("memberIDs", "array-contains", userId)
      .get();
    
    console.log(`   Found ${oneOnOneChats.size} 1:1 chats`);
    console.log(`   Found ${groupChats.size} group chats`);
    
    const batch = db.batch();
    let updateCount = 0;
    
    // Update 1:1 chats
    oneOnOneChats.forEach((doc) => {
      const chatData = doc.data();
      const userIndex = chatData.participantIDs?.indexOf(userId);
      
      if (userIndex !== -1 && chatData.participantNames) {
        const updatedNames = [...chatData.participantNames];
        updatedNames[userIndex] = newDisplayName;
        
        batch.update(doc.ref, {
          participantNames: updatedNames,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        updateCount++;
        console.log(`   ✓ Updated 1:1 chat: ${doc.id}`);
      }
    });
    
    // Update group chats
    groupChats.forEach((doc) => {
      const chatData = doc.data();
      const userIndex = chatData.memberIDs?.indexOf(userId);
      
      if (userIndex !== -1 && chatData.memberNames) {
        const updatedNames = [...chatData.memberNames];
        updatedNames[userIndex] = newDisplayName;
        
        batch.update(doc.ref, {
          memberNames: updatedNames,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        updateCount++;
        console.log(`   ✓ Updated group chat: ${doc.id}`);
      }
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`\n✅ Committed ${updateCount} chat updates`);
    } else {
      console.log("\n✅ No chats needed updating");
    }
    
    // Step 4: Summary
    console.log("\n=== Summary ===");
    console.log(`✅ User profile updated: ${userEmail}`);
    console.log(`✅ DisplayName changed: "${oldDisplayName}" → "${newDisplayName}"`);
    console.log(`✅ Chats updated: ${updateCount}`);
    console.log("\n🎉 Done! The user should now appear correctly in the app.");
    console.log("   (Users may need to refresh/restart the app to see changes)\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nMake sure you're authenticated with Firebase:");
    console.error("  firebase login");
    console.error("\nOr set GOOGLE_APPLICATION_CREDENTIALS environment variable.");
    process.exit(1);
  }
}

// Get command line arguments
const userEmail = process.argv[2];
const newDisplayName = process.argv[3];

fixUserDisplayName(userEmail, newDisplayName);

