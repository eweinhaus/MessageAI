/**
 * Backfill Script: Populate missing sourceMessageId for action items
 * 
 * This script finds action items without sourceMessageId and attempts to
 * match them to their original messages using fuzzy text matching.
 * 
 * Usage:
 *   node scripts/backfillSourceMessageId.js [--dry-run] [--limit N]
 * 
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --limit N    Process only N items (useful for testing)
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  // Use Firebase config from environment variables (same as client app)
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    console.error('❌ Error: EXPO_PUBLIC_FIREBASE_PROJECT_ID not found in environment');
    console.error('   Make sure you have a .env file with Firebase configuration');
    process.exit(1);
  }

  console.log(`🔧 Connecting to Firebase project: ${projectId}`);

  // Try to load service account key from multiple locations
  const possiblePaths = [
    path.join(__dirname, '..', 'serviceAccountKey.json'),
    path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  let credential = null;
  for (const keyPath of possiblePaths) {
    if (fs.existsSync(keyPath)) {
      console.log(`   Using service account key from: ${keyPath}`);
      credential = admin.credential.cert(require(keyPath));
      break;
    }
  }

  if (!credential) {
    console.log('   No service account key found, using application default credentials');
    try {
      credential = admin.credential.applicationDefault();
    } catch (error) {
      console.error('❌ Error: Could not initialize Firebase Admin credentials');
      console.error('   You need either:');
      console.error('   1. A serviceAccountKey.json file in the project root');
      console.error('   2. GOOGLE_APPLICATION_CREDENTIALS environment variable set');
      console.error('   3. Application default credentials configured (gcloud auth)');
      process.exit(1);
    }
  }

  admin.initializeApp({
    credential: credential,
    projectId: projectId,
  });
}

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

console.log('\n🔍 Backfill Script: Populate missing sourceMessageId');
console.log('================================================');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will update Firestore)'}`);
console.log(`Limit: ${limit ? `${limit} items` : 'No limit'}\n`);

/**
 * Fuzzy match text similarity (simple Levenshtein distance)
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Find best matching message for an action item
 */
async function findMatchingMessage(chatId, taskText, createdAt) {
  try {
    // Get messages from the chat
    const messagesRef = db.collection('chats').doc(chatId).collection('messages');

    // Query messages around the creation time (±7 days for broader search)
    const createdTimestamp = createdAt?.toMillis ? createdAt.toMillis() : createdAt;
    const oneWeekBefore = createdTimestamp - (7 * 24 * 60 * 60 * 1000);

    const snapshot = await messagesRef
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(oneWeekBefore))
      .orderBy('timestamp', 'desc')
      .limit(200) // Increased from 100 to 200
      .get();

    if (snapshot.empty) {
      console.log(`  No messages found in chat ${chatId} around creation time`);
      return null;
    }

    console.log(`  Found ${snapshot.size} messages to search through`);

    // Multiple matching strategies
    const taskWords = taskText.toLowerCase().trim().split(/\s+/).filter(word => word.length > 2);
    const taskPhrases = [
      taskText.toLowerCase().trim().substring(0, 100), // Full task text
      taskText.toLowerCase().trim().substring(0, 50),  // First 50 chars
      taskWords.slice(0, 3).join(' '), // First 3 significant words
    ];

    let bestMatch = null;
    let bestScore = 0;

    snapshot.forEach(doc => {
      const message = doc.data();
      if (!message.text) return;

      const messageText = message.text.toLowerCase().trim();
      const messageWords = messageText.split(/\s+/).filter(word => word.length > 2);

      // Multiple scoring strategies
      let maxScore = 0;

      // 1. Exact phrase matching (highest priority)
      for (const phrase of taskPhrases) {
        if (messageText.includes(phrase) && phrase.length > 10) {
          maxScore = Math.max(maxScore, 0.95); // Very high score for phrase matches
        }
      }

      // 2. Word overlap matching
      const commonWords = taskWords.filter(word =>
        messageWords.some(msgWord => msgWord.includes(word) || word.includes(msgWord))
      );
      const wordScore = commonWords.length / Math.max(taskWords.length, messageWords.length);
      maxScore = Math.max(maxScore, wordScore);

      // 3. Fuzzy string matching (lowest priority)
      for (const phrase of taskPhrases) {
        if (phrase.length > 5) {
          const fuzzyScore = similarity(phrase, messageText.substring(0, phrase.length + 20));
          maxScore = Math.max(maxScore, fuzzyScore * 0.7); // Weight down fuzzy matches
        }
      }

      // 4. Priority boost for recent messages
      const messageTime = message.timestamp?.toMillis ? message.timestamp.toMillis() : 0;
      const timeDiff = Math.abs(createdTimestamp - messageTime);
      const timeScore = Math.max(0, 1 - (timeDiff / (24 * 60 * 60 * 1000))); // 1 point per day
      maxScore = Math.min(1.0, maxScore + (timeScore * 0.2)); // 20% time bonus

      // Require at least 30% similarity (lowered for better matches)
      if (maxScore > bestScore && maxScore >= 0.3) {
        bestScore = maxScore;
        bestMatch = {
          messageID: doc.id,
          text: message.text,
          score: maxScore,
          timestamp: message.timestamp,
        };
        console.log(`    Found potential match: ${maxScore.toFixed(3)} - "${message.text.substring(0, 60)}..."`);
      }
    });

    if (bestMatch) {
      console.log(`  ✅ Best match: ${bestScore.toFixed(3)} confidence`);
      console.log(`     Matched to: "${bestMatch.text.substring(0, 60)}..."`);
    }

    return bestMatch;
  } catch (error) {
    console.error(`Error finding message for chat ${chatId}:`, error.message);
    return null;
  }
}

/**
 * Main backfill function
 */
async function backfillSourceMessageIds() {
  const stats = {
    total: 0,
    missing: 0,
    deleted: 0,
    matched: 0,
    notMatched: 0,
    errors: 0,
    updated: 0,
  };
  
  try {
    console.log('📊 Step 1: Finding action items without sourceMessageId or marked as deleted...\n');

    // Query all action items across all chats
    const actionItemsQuery = db.collectionGroup('actionItems');
    const snapshot = await actionItemsQuery.get();

    console.log(`Found ${snapshot.size} total action items\n`);

    // Filter items missing sourceMessageId or marked as deleted
    const itemsToProcess = [];
    let missingCount = 0;
    let deletedCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.sourceMessageId) {
        missingCount++;
        stats.missing++;
        itemsToProcess.push({
          ref: doc.ref,
          id: doc.id,
          ...data,
          reason: 'missing',
        });
      } else if (data.sourceMessageId === '__deleted__') {
        deletedCount++;
        stats.deleted++;
        itemsToProcess.push({
          ref: doc.ref,
          id: doc.id,
          ...data,
          reason: 'deleted',
        });
      }
    });

    stats.total = itemsToProcess.length;
    console.log(`📋 Found ${stats.total} items to process:`);
    console.log(`   • ${missingCount} missing sourceMessageId`);
    console.log(`   • ${deletedCount} marked as deleted\n`);
    
    if (stats.total === 0) {
      console.log('✅ All action items already have sourceMessageId!');
      return stats;
    }
    
    // Apply limit if specified
    const itemsToBackfill = limit ? itemsToProcess.slice(0, limit) : itemsToProcess;
    console.log(`🔄 Processing ${itemsToBackfill.length} items...\n`);
    
    // Process each item
    for (let i = 0; i < itemsToBackfill.length; i++) {
      const item = itemsToBackfill[i];
      const progress = `[${i + 1}/${itemsToBackfill.length}]`;
      const itemType = item.reason === 'deleted' ? '[RETRY]' : '[MISSING]';

      console.log(`${progress} ${itemType} Processing: "${item.task?.substring(0, 60)}..."`);

      try {
        // Find matching message
        const match = await findMatchingMessage(
          item.chatId,
          item.task,
          item.createdAt
        );
        
        if (match) {
          stats.matched++;
          console.log(`  ✅ Matched! (${(match.score * 100).toFixed(1)}% confidence)`);
          console.log(`     Message: "${match.text.substring(0, 60)}..."`);

          if (!isDryRun) {
            await item.ref.update({
              sourceMessageId: match.messageID,
              backfilled: true,
              backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
              matchConfidence: match.score,
              // Clear the deleted/noContext flags if this was marked as deleted
              ...(item.reason === 'deleted' && {
                noContext: admin.firestore.FieldValue.delete(),
              }),
            });
            stats.updated++;
            console.log(`     💾 Updated in Firestore`);
          } else {
            console.log(`     [DRY RUN] Would update with messageID: ${match.messageID}`);
          }
        } else {
          stats.notMatched++;
          console.log(`  ❌ No match found`);

          if (!isDryRun) {
            // Mark as no context available (only if not already marked)
            if (item.reason === 'missing') {
              await item.ref.update({
                sourceMessageId: '__deleted__',
                noContext: true,
                backfilled: true,
                backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              stats.updated++;
              console.log(`     💾 Marked as no context available`);
            } else {
              console.log(`     Already marked as deleted, no changes needed`);
            }
          } else {
            if (item.reason === 'missing') {
              console.log(`     [DRY RUN] Would mark as no context`);
            } else {
              console.log(`     Already marked as deleted, would leave unchanged`);
            }
          }
        }
      } catch (error) {
        stats.errors++;
        console.error(`  ⚠️  Error: ${error.message}`);
      }
      
      console.log('');
      
      // Rate limiting: pause every 50 items
      if ((i + 1) % 50 === 0) {
        console.log('⏸️  Pausing for 2 seconds to avoid rate limits...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Final summary
    console.log('\n================================================');
    console.log('📊 BACKFILL SUMMARY');
    console.log('================================================');
    console.log(`Total items processed:     ${itemsToBackfill.length}`);
    console.log(`Missing sourceMessageId:   ${stats.missing}`);
    console.log(`Marked as deleted:         ${stats.deleted}`);
    console.log(`Successfully matched:      ${stats.matched} (${((stats.matched / itemsToBackfill.length) * 100).toFixed(1)}%)`);
    console.log(`Not matched:               ${stats.notMatched} (${((stats.notMatched / itemsToBackfill.length) * 100).toFixed(1)}%)`);
    console.log(`Errors:                    ${stats.errors}`);
    if (!isDryRun) {
      console.log(`Firestore updates:         ${stats.updated}`);
    }
    console.log('================================================\n');
    
    if (isDryRun) {
      console.log('ℹ️  This was a DRY RUN. No changes were made to Firestore.');
      console.log('   Remove --dry-run flag to apply changes.\n');
    } else {
      console.log('✅ Backfill complete! All changes saved to Firestore.\n');
    }
    
    return stats;
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Run the script
backfillSourceMessageIds()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });

