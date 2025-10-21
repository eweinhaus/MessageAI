// Diagnostic Utilities - Helper functions to debug user data and presence issues
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { isPresenceStale } from '../services/presenceService';

/**
 * Check all users in Firestore for missing or incomplete data
 * Useful for debugging display name issues
 * @returns {Promise<Array>} Array of user issues found
 */
export async function diagnoseAllUsers() {
  console.log('[Diagnostic] Starting user data diagnosis...');
  const issues = [];
  
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`[Diagnostic] Found ${snapshot.size} users in Firestore`);
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const userID = doc.id;
      const problems = [];
      
      // Check required fields
      if (!data.displayName) {
        problems.push('Missing displayName');
      }
      if (!data.email) {
        problems.push('Missing email');
      }
      if (!data.userID) {
        problems.push('Missing userID field');
      }
      if (data.userID && data.userID !== userID) {
        problems.push(`userID mismatch: document ID is ${userID}, but userID field is ${data.userID}`);
      }
      if (data.isOnline === undefined) {
        problems.push('Missing isOnline field');
      }
      if (!data.lastSeenTimestamp) {
        problems.push('Missing lastSeenTimestamp');
      }
      
      // Check for stale presence
      if (data.isOnline && data.lastSeenTimestamp) {
        const timestamp = data.lastSeenTimestamp?.toMillis?.() || data.lastSeenTimestamp;
        if (isPresenceStale(timestamp)) {
          problems.push(`Marked online but presence is stale (last update: ${new Date(timestamp).toISOString()})`);
        }
      }
      
      if (problems.length > 0) {
        issues.push({
          userID,
          email: data.email || 'N/A',
          displayName: data.displayName || 'N/A',
          problems,
        });
      }
    });
    
    // Log results
    if (issues.length === 0) {
      console.log('[Diagnostic] ✅ All users have complete data');
    } else {
      console.log(`[Diagnostic] ⚠️ Found ${issues.length} users with issues:`);
      issues.forEach((issue) => {
        console.log(`\n  User: ${issue.displayName} (${issue.email})`);
        console.log(`  ID: ${issue.userID}`);
        console.log(`  Problems:`);
        issue.problems.forEach((p) => console.log(`    - ${p}`));
      });
    }
    
    return issues;
  } catch (error) {
    console.error('[Diagnostic] Error diagnosing users:', error);
    throw error;
  }
}

/**
 * Check a specific user's data
 * @param {string} userID - User ID to check
 * @returns {Promise<Object>} User data and any issues
 */
export async function diagnoseUser(userID) {
  console.log(`[Diagnostic] Checking user: ${userID}`);
  
  try {
    const userRef = doc(db, 'users', userID);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.log('[Diagnostic] ❌ User document does not exist');
      return {
        exists: false,
        issues: ['Document does not exist in Firestore'],
      };
    }
    
    const data = userSnap.data();
    const issues = [];
    
    console.log('[Diagnostic] User data:', JSON.stringify(data, null, 2));
    
    // Check required fields
    if (!data.displayName) issues.push('Missing displayName');
    if (!data.email) issues.push('Missing email');
    if (!data.userID) issues.push('Missing userID field');
    if (data.userID && data.userID !== userID) {
      issues.push(`userID mismatch: expected ${userID}, got ${data.userID}`);
    }
    if (data.isOnline === undefined) issues.push('Missing isOnline field');
    if (!data.lastSeenTimestamp) issues.push('Missing lastSeenTimestamp');
    
    // Check presence staleness
    if (data.isOnline && data.lastSeenTimestamp) {
      const timestamp = data.lastSeenTimestamp?.toMillis?.() || data.lastSeenTimestamp;
      const age = Date.now() - timestamp;
      const ageSeconds = Math.round(age / 1000);
      
      console.log(`[Diagnostic] Presence age: ${ageSeconds}s`);
      
      if (isPresenceStale(timestamp)) {
        issues.push(`Marked online but presence is stale (${ageSeconds}s old, threshold is 45s)`);
      }
    }
    
    // Summary
    if (issues.length === 0) {
      console.log('[Diagnostic] ✅ User data is complete');
    } else {
      console.log(`[Diagnostic] ⚠️ Found ${issues.length} issues:`);
      issues.forEach((issue) => console.log(`  - ${issue}`));
    }
    
    return {
      exists: true,
      data,
      issues,
    };
  } catch (error) {
    console.error('[Diagnostic] Error checking user:', error);
    throw error;
  }
}

/**
 * Check all chats for inconsistent member data
 * @returns {Promise<Array>} Array of chat issues found
 */
export async function diagnoseChats() {
  console.log('[Diagnostic] Starting chat data diagnosis...');
  const issues = [];
  
  try {
    const chatsRef = collection(db, 'chats');
    const snapshot = await getDocs(chatsRef);
    
    console.log(`[Diagnostic] Found ${snapshot.size} chats in Firestore`);
    
    for (const chatDoc of snapshot.docs) {
      const data = chatDoc.data();
      const chatID = chatDoc.id;
      const problems = [];
      
      // Check member IDs and names consistency
      if (data.type === 'group') {
        if (!data.memberIDs || data.memberIDs.length === 0) {
          problems.push('Missing or empty memberIDs');
        }
        if (!data.memberNames || data.memberNames.length === 0) {
          problems.push('Missing or empty memberNames');
        }
        if (data.memberIDs && data.memberNames && data.memberIDs.length !== data.memberNames.length) {
          problems.push(`memberIDs count (${data.memberIDs.length}) doesn't match memberNames count (${data.memberNames.length})`);
        }
        
        // Check if member IDs actually exist as users
        if (data.memberIDs) {
          for (let i = 0; i < data.memberIDs.length; i++) {
            const memberID = data.memberIDs[i];
            const memberName = data.memberNames?.[i];
            
            try {
              const userRef = doc(db, 'users', memberID);
              const userSnap = await getDoc(userRef);
              
              if (!userSnap.exists()) {
                problems.push(`Member ${memberName || memberID} (${memberID}) - user document doesn't exist`);
              } else {
                const userData = userSnap.data();
                if (!userData.displayName) {
                  problems.push(`Member ${memberID} exists but has no displayName`);
                }
              }
            } catch (error) {
              problems.push(`Error checking member ${memberID}: ${error.message}`);
            }
          }
        }
      } else if (data.type === '1:1') {
        if (!data.participantIDs || data.participantIDs.length !== 2) {
          problems.push('Invalid participantIDs for 1:1 chat');
        }
        if (!data.participantNames || data.participantNames.length !== 2) {
          problems.push('Invalid participantNames for 1:1 chat');
        }
      }
      
      if (problems.length > 0) {
        issues.push({
          chatID,
          type: data.type,
          name: data.groupName || 'N/A',
          problems,
        });
      }
    }
    
    // Log results
    if (issues.length === 0) {
      console.log('[Diagnostic] ✅ All chats have consistent data');
    } else {
      console.log(`[Diagnostic] ⚠️ Found ${issues.length} chats with issues:`);
      issues.forEach((issue) => {
        console.log(`\n  Chat: ${issue.name} (${issue.type})`);
        console.log(`  ID: ${issue.chatID}`);
        console.log(`  Problems:`);
        issue.problems.forEach((p) => console.log(`    - ${p}`));
      });
    }
    
    return issues;
  } catch (error) {
    console.error('[Diagnostic] Error diagnosing chats:', error);
    throw error;
  }
}

/**
 * Run all diagnostics
 * @returns {Promise<Object>} All diagnostic results
 */
export async function runFullDiagnostics() {
  console.log('\n========================================');
  console.log('Starting Full System Diagnostics');
  console.log('========================================\n');
  
  const results = {
    users: [],
    chats: [],
    timestamp: new Date().toISOString(),
  };
  
  try {
    results.users = await diagnoseAllUsers();
    console.log('\n');
    results.chats = await diagnoseChats();
    
    console.log('\n========================================');
    console.log('Diagnostics Complete');
    console.log('========================================');
    console.log(`Users with issues: ${results.users.length}`);
    console.log(`Chats with issues: ${results.chats.length}`);
    console.log('\n');
    
    return results;
  } catch (error) {
    console.error('Error running full diagnostics:', error);
    throw error;
  }
}

