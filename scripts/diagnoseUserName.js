/**
 * Diagnostic Script: Check user displayNames and chat participantNames
 * 
 * This script helps diagnose displayName issues in Firestore.
 * 
 * Usage:
 *   1. Ensure you're logged into Firebase CLI: `firebase login`
 *   2. Run: `node scripts/diagnoseUserName.js`
 * 
 * This will generate a report of all users and highlight any
 * potential issues with displayNames matching email prefixes.
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function diagnoseUserNames() {
  try {
    console.log("\n=== User DisplayName Diagnostic Report ===\n");
    
    // Step 1: Check all users
    console.log("📋 Fetching all users...");
    const usersSnapshot = await db.collection("users").get();
    
    const users = [];
    const potentialIssues = [];
    
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      const user = {
        id: doc.id,
        email: data.email,
        displayName: data.displayName,
      };
      users.push(user);
      
      // Check if displayName looks like an email prefix (potential issue)
      const emailPrefix = data.email?.split("@")[0]?.toLowerCase();
      const displayNameLower = data.displayName?.toLowerCase();
      
      if (emailPrefix && displayNameLower === emailPrefix) {
        potentialIssues.push({
          ...user,
          issue: "DisplayName matches email prefix",
          suggestion: `Consider changing to a proper name`,
        });
      }
    });
    
    console.log(`✅ Found ${users.length} users\n`);
    
    // Display all users
    console.log("📊 All Users:");
    console.log("=" .repeat(80));
    users.forEach((user) => {
      console.log(`UserID: ${user.id}`);
      console.log(`  Email:       ${user.email}`);
      console.log(`  DisplayName: ${user.displayName}`);
      console.log("-".repeat(80));
    });
    
    // Highlight potential issues
    if (potentialIssues.length > 0) {
      console.log("\n⚠️  Potential DisplayName Issues:");
      console.log("=".repeat(80));
      potentialIssues.forEach((issue) => {
        console.log(`\n❌ User: ${issue.email}`);
        console.log(`   Current DisplayName: "${issue.displayName}"`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   Suggestion: ${issue.suggestion}`);
      });
      
      console.log("\n\n📝 To fix these issues:");
      console.log("   1. Go to Firebase Console → Firestore Database");
      console.log("   2. Navigate to 'users' collection");
      console.log("   3. Find the user document and edit the 'displayName' field");
      console.log("   4. Run this script again to verify the fix\n");
    } else {
      console.log("\n✅ No displayName issues detected!\n");
    }
    
    // Step 2: Check chats for consistency
    console.log("\n📋 Checking chats for name consistency...");
    const chatsSnapshot = await db.collection("chats").get();
    
    const chatIssues = [];
    
    chatsSnapshot.forEach((doc) => {
      const chatData = doc.data();
      
      // Check 1:1 chats
      if (chatData.type === "1:1" && chatData.participantIDs) {
        chatData.participantIDs.forEach((userId, index) => {
          const user = users.find((u) => u.id === userId);
          const chatName = chatData.participantNames?.[index];
          
          if (user && chatName && user.displayName !== chatName) {
            chatIssues.push({
              chatId: doc.id,
              type: "1:1",
              userId,
              userDisplayName: user.displayName,
              chatName,
            });
          }
        });
      }
      
      // Check group chats
      if (chatData.type === "group" && chatData.memberIDs) {
        chatData.memberIDs.forEach((userId, index) => {
          const user = users.find((u) => u.id === userId);
          const chatName = chatData.memberNames?.[index];
          
          if (user && chatName && user.displayName !== chatName) {
            chatIssues.push({
              chatId: doc.id,
              type: "group",
              userId,
              userDisplayName: user.displayName,
              chatName,
            });
          }
        });
      }
    });
    
    if (chatIssues.length > 0) {
      console.log(`\n⚠️  Found ${chatIssues.length} chat name inconsistencies:`);
      console.log("=".repeat(80));
      chatIssues.forEach((issue) => {
        console.log(`\n❌ Chat: ${issue.chatId} (${issue.type})`);
        console.log(`   User Profile: "${issue.userDisplayName}"`);
        console.log(`   Chat Shows:   "${issue.chatName}"`);
      });
      
      console.log("\n\n📝 These chats need to be updated after fixing user profiles.");
    } else {
      console.log("✅ All chats are consistent with user profiles!\n");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nMake sure you're authenticated with Firebase:");
    console.error("  firebase login");
    console.error("\nOr set GOOGLE_APPLICATION_CREDENTIALS environment variable.");
    process.exit(1);
  }
}

diagnoseUserNames();

