#!/usr/bin/env node

/**
 * Test Script: Cache Clear on Logout
 * 
 * This script helps verify that logout properly clears local data.
 * Run this after implementing the cache clear fix.
 * 
 * Usage:
 *   node scripts/testCacheClear.js
 */

console.log('🧪 Cache Clear Test Helper');
console.log('========================\n');

console.log('📋 Manual Test Checklist:');
console.log('');
console.log('□ Test 1: Basic Logout/Login');
console.log('  1. Login as User A');
console.log('  2. Create a chat with some messages');
console.log('  3. Note the chat ID and messages');
console.log('  4. Logout (check console for "Clearing local data")');
console.log('  5. Login as User B');
console.log('  6. ✓ Verify home screen is empty or shows only User B chats');
console.log('  7. ✓ Verify NO User A messages appear');
console.log('');

console.log('□ Test 2: Console Log Verification');
console.log('  On logout, you should see:');
console.log('    ✓ "[Logout] Clearing local data (SQLite, stores)..."');
console.log('    ✓ "[SQLite] All data cleared"');
console.log('    ✓ "[Logout] SQLite data cleared"');
console.log('    ✓ "[Logout] Zustand stores cleared"');
console.log('    ✓ "[Logout] Logout complete"');
console.log('');

console.log('□ Test 3: SQLite Verification (Advanced)');
console.log('  You can verify SQLite is cleared by:');
console.log('  1. Install Expo SQLite inspector (optional)');
console.log('  2. Check tables after logout');
console.log('  3. Tables should be empty or have 0 rows');
console.log('');

console.log('□ Test 4: Multi-User Test');
console.log('  1. Login as User A → Create Chat 1 → Logout');
console.log('  2. Login as User B → Create Chat 2 → Logout');
console.log('  3. Login as User A again');
console.log('  4. ✓ Should only see Chat 1');
console.log('  5. ✓ Chat 2 should NOT appear');
console.log('');

console.log('□ Test 5: Offline Logout');
console.log('  1. Login as User A');
console.log('  2. Enable airplane mode');
console.log('  3. Logout (should work offline)');
console.log('  4. Disable airplane mode');
console.log('  5. Login as User B');
console.log('  6. ✓ No User A data should appear');
console.log('');

console.log('🔍 What to Look For:');
console.log('');
console.log('✅ SUCCESS INDICATORS:');
console.log('  • Console shows "Clearing local data" on logout');
console.log('  • Home screen is empty after fresh login');
console.log('  • No flash of previous user\'s messages');
console.log('  • Loading indicator appears briefly, then shows correct data');
console.log('');

console.log('❌ FAILURE INDICATORS:');
console.log('  • Old messages appear momentarily on login');
console.log('  • Wrong user\'s chats show up');
console.log('  • Console missing "Clearing local data" log');
console.log('  • Error: "Failed to clear" in console');
console.log('');

console.log('🛠️  Troubleshooting:');
console.log('');
console.log('If tests fail:');
console.log('  1. Check console for error messages');
console.log('  2. Verify clearAllData() is called in userStore.js');
console.log('  3. Verify auth state listener in _layout.js');
console.log('  4. Clear app data manually and retry');
console.log('  5. Check for circular dependency warnings');
console.log('');

console.log('📝 Notes:');
console.log('  • Firestore sync may take 1-2 seconds');
console.log('  • Brief loading spinner is normal');
console.log('  • Check both iOS and Android if possible');
console.log('  • Test on physical device (not just simulator)');
console.log('');

console.log('✅ All tests passed? You\'re good to go!');
console.log('❌ Any tests failed? Review CACHE_FIX_SUMMARY.md');
console.log('');

// Check if required files exist
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'store/userStore.js',
  'app/_layout.js',
  'db/database.js',
  'store/chatStore.js',
  'store/messageStore.js',
  'md_files/CACHE_FIX_SUMMARY.md'
];

console.log('📁 Checking required files...');
let allFilesExist = true;

filesToCheck.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  const exists = fs.existsSync(filePath);
  console.log(`  ${exists ? '✓' : '✗'} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('');

if (allFilesExist) {
  console.log('✅ All required files found!');
  console.log('🚀 You can now test the app manually.');
} else {
  console.log('❌ Some files are missing. Make sure you\'re in the project root.');
  process.exit(1);
}

// Check for clearAllData function in database.js
console.log('');
console.log('🔍 Verifying clearAllData() function...');
const dbFile = fs.readFileSync('db/database.js', 'utf-8');
if (dbFile.includes('clearAllData')) {
  console.log('  ✓ clearAllData() function found in database.js');
} else {
  console.log('  ✗ clearAllData() function NOT found in database.js');
  console.log('  ⚠️  This function is required for the fix to work!');
}

// Check for cleanup code in userStore.js
const userStoreFile = fs.readFileSync('store/userStore.js', 'utf-8');
if (userStoreFile.includes('clearAllData')) {
  console.log('  ✓ clearAllData() called in userStore.js logout');
} else {
  console.log('  ✗ clearAllData() NOT called in userStore.js');
  console.log('  ⚠️  Logout may not clear cache properly!');
}

if (userStoreFile.includes('clearChats')) {
  console.log('  ✓ clearChats() called in userStore.js logout');
} else {
  console.log('  ✗ clearChats() NOT called in userStore.js');
}

if (userStoreFile.includes('clearMessages')) {
  console.log('  ✓ clearMessages() called in userStore.js logout');
} else {
  console.log('  ✗ clearMessages() NOT called in userStore.js');
}

console.log('');
console.log('✅ Verification complete! Review the checklist above and test manually.');
console.log('');

