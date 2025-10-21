// Firestore Service - Data Access Layer
/**
 * FIRESTORE SCHEMA DOCUMENTATION
 * ================================
 * 
 * /users/{userID}
 *   - userID: string (Firebase Auth UID)
 *   - email: string
 *   - displayName: string
 *   - isOnline: boolean
 *   - lastSeenTimestamp: timestamp
 *   - fcmToken: string (FCM token for push notifications)
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 * 
 * /chats/{chatID}
 *   - chatID: string (1:1: sorted userIDs joined with '_', Groups: UUID)
 *   - type: string ('1:1' | 'group')
 *   - participantIDs: array<string> (for 1:1 chats - 2 users)
 *   - participantNames: array<string> (for 1:1 chats)
 *   - memberIDs: array<string> (for group chats - 3+ users)
 *   - memberNames: array<string> (for group chats)
 *   - groupName: string (for group chats only)
 *   - createdBy: string (for group chats only)
 *   - lastMessageText: string
 *   - lastMessageTimestamp: timestamp
 *   - lastMessageSenderID: string
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 * 
 * /chats/{chatID}/messages/{messageID}
 *   - messageID: string (UUID)
 *   - chatID: string
 *   - senderID: string
 *   - senderName: string (denormalized for display)
 *   - text: string
 *   - timestamp: timestamp
 *   - deliveryStatus: string ('sending' | 'sent' | 'delivered' | 'read')
 *   - readBy: array<string> (userIDs who have read the message)
 *   - createdAt: timestamp
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  arrayUnion,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import uuid from 'react-native-uuid';

/**
 * Create a new user profile in Firestore
 * Called when a user signs up for the first time
 * @param {string} userID - Firebase Auth UID
 * @param {string} displayName - User's display name
 * @param {string} email - User's email address
 * @returns {Promise<void>}
 */
export async function createUserProfile(userID, displayName, email) {
  try {
    const userRef = doc(db, 'users', userID);
    
    const userData = {
      userID,
      email,
      displayName,
      isOnline: true,
      lastSeenTimestamp: serverTimestamp(),
      fcmToken: null, // Will be set when notifications are enabled
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(userRef, userData);
    console.log('User profile created:', userID);
    
    return userData;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

/**
 * Get a user profile from Firestore
 * @param {string} userID - Firebase Auth UID
 * @returns {Promise<Object|null>} User data or null if not found
 */
export async function getUserProfile(userID) {
  try {
    const userRef = doc(db, 'users', userID);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

/**
 * Update a user profile in Firestore
 * @param {string} userID - Firebase Auth UID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateUserProfile(userID, updates) {
  try {
    const userRef = doc(db, 'users', userID);
    
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    
    await updateDoc(userRef, updateData);
    console.log('User profile updated:', userID);
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

/**
 * Update user's online status
 * @param {string} userID - Firebase Auth UID
 * @param {boolean} isOnline - Online status
 * @returns {Promise<void>}
 */
export async function updateUserOnlineStatus(userID, isOnline) {
  try {
    await updateUserProfile(userID, {
      isOnline,
      lastSeenTimestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating online status:', error);
    throw error;
  }
}

/**
 * Update user's FCM token for push notifications
 * @param {string} userID - Firebase Auth UID
 * @param {string} fcmToken - FCM device token
 * @returns {Promise<void>}
 */
export async function updateUserFCMToken(userID, fcmToken) {
  try {
    await updateUserProfile(userID, { fcmToken });
  } catch (error) {
    console.error('Error updating FCM token:', error);
    throw error;
  }
}

/**
 * Get multiple user profiles at once
 * Useful for displaying chat participants
 * @param {string[]} userIDs - Array of user IDs
 * @returns {Promise<Object>} Map of userID to user data
 */
export async function getUserProfiles(userIDs) {
  try {
    const profiles = {};
    
    // Fetch all profiles in parallel
    const promises = userIDs.map(async (userID) => {
      const profile = await getUserProfile(userID);
      if (profile) {
        profiles[userID] = profile;
      }
    });
    
    await Promise.all(promises);
    
    return profiles;
  } catch (error) {
    console.error('Error getting user profiles:', error);
    throw error;
  }
}

/**
 * Get all users from Firestore (for contact picker)
 * @returns {Promise<Array>} Array of user objects
 */
export async function getAllUsers() {
  try {
    console.log('[Firestore] Fetching all users from /users collection...');
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users = [];
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      
      // Validate user data has required fields
      if (!userData.userID || !userData.displayName || !userData.email) {
        console.warn('[Firestore] Skipping invalid user document:', doc.id, userData);
        return;
      }
      
      console.log('[Firestore] Found user:', userData.userID, userData.displayName);
      users.push(userData);
    });
    
    console.log('[Firestore] Total valid users in collection:', users.length);
    return users;
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

// ================================
// CHAT OPERATIONS
// ================================

/**
 * Generate deterministic chatID for 1:1 chats
 * @param {string} userAID - First user ID
 * @param {string} userBID - Second user ID
 * @returns {string} Deterministic chat ID
 */
function generate1to1ChatID(userAID, userBID) {
  // Sort IDs alphabetically to ensure consistency
  const sortedIDs = [userAID, userBID].sort();
  return sortedIDs.join('_');
}

/**
 * Check if a 1:1 chat already exists between two users
 * @param {string} userAID - First user ID
 * @param {string} userBID - Second user ID
 * @returns {Promise<string|null>} Chat ID if exists, null otherwise
 */
export async function checkIfChatExists(userAID, userBID) {
  try {
    const chatID = generate1to1ChatID(userAID, userBID);
    const chatRef = doc(db, 'chats', chatID);
    const chatSnap = await getDoc(chatRef);
    
    if (chatSnap.exists()) {
      return chatID;
    }
    return null;
  } catch (error) {
    console.error('Error checking if chat exists:', error);
    throw error;
  }
}

/**
 * Create a 1:1 chat (or return existing one)
 * @param {string} userAID - First user ID
 * @param {string} userAName - First user display name
 * @param {string} userBID - Second user ID
 * @param {string} userBName - Second user display name
 * @returns {Promise<Object>} Chat object
 */
export async function createOneOnOneChat(userAID, userAName, userBID, userBName) {
  try {
    const chatID = generate1to1ChatID(userAID, userBID);
    const chatRef = doc(db, 'chats', chatID);
    
    // Check if chat already exists
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      console.log('1:1 chat already exists:', chatID);
      return chatSnap.data();
    }
    
    // Create new chat
    const chatData = {
      chatID,
      type: '1:1',
      participantIDs: [userAID, userBID],
      participantNames: [userAName, userBName],
      lastMessageText: '',
      lastMessageTimestamp: serverTimestamp(),
      lastMessageSenderID: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(chatRef, chatData);
    console.log('1:1 chat created:', chatID);
    
    return chatData;
  } catch (error) {
    console.error('Error creating 1:1 chat:', error);
    throw error;
  }
}

/**
 * Create a group chat
 * @param {string} groupName - Name of the group
 * @param {string[]} memberIDs - Array of member user IDs (3+)
 * @param {string[]} memberNames - Array of member display names
 * @param {string} createdBy - User ID of the creator
 * @returns {Promise<Object>} Chat object
 */
export async function createGroupChat(groupName, memberIDs, memberNames, createdBy) {
  try {
    if (memberIDs.length < 3) {
      throw new Error('Group chat must have at least 3 members');
    }
    
    const chatID = uuid.v4();
    const chatRef = doc(db, 'chats', chatID);
    
    const chatData = {
      chatID,
      type: 'group',
      groupName,
      memberIDs,
      memberNames,
      createdBy,
      lastMessageText: '',
      lastMessageTimestamp: serverTimestamp(),
      lastMessageSenderID: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(chatRef, chatData);
    console.log('Group chat created:', chatID);
    
    return chatData;
  } catch (error) {
    console.error('Error creating group chat:', error);
    throw error;
  }
}

/**
 * Get a single chat by ID
 * @param {string} chatID - Chat ID
 * @returns {Promise<Object|null>} Chat data or null if not found
 */
export async function getChat(chatID) {
  try {
    const chatRef = doc(db, 'chats', chatID);
    const chatSnap = await getDoc(chatRef);
    
    if (chatSnap.exists()) {
      return chatSnap.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting chat:', error);
    throw error;
  }
}

/**
 * Get all chats for a user
 * @param {string} userID - User ID
 * @returns {Promise<Array>} Array of chat objects
 */
export async function getAllUserChats(userID) {
  try {
    const chatsRef = collection(db, 'chats');
    
    // Query for 1:1 chats (participantIDs contains userID)
    const oneOnOneQuery = query(
      chatsRef,
      where('participantIDs', 'array-contains', userID)
    );
    
    // Query for group chats (memberIDs contains userID)
    const groupQuery = query(
      chatsRef,
      where('memberIDs', 'array-contains', userID)
    );
    
    // Execute both queries in parallel
    const [oneOnOneSnap, groupSnap] = await Promise.all([
      getDocs(oneOnOneQuery),
      getDocs(groupQuery)
    ]);
    
    const chats = [];
    
    oneOnOneSnap.forEach((doc) => {
      chats.push(doc.data());
    });
    
    groupSnap.forEach((doc) => {
      chats.push(doc.data());
    });
    
    // Sort by lastMessageTimestamp descending
    chats.sort((a, b) => {
      const timeA = a.lastMessageTimestamp?.toMillis() || 0;
      const timeB = b.lastMessageTimestamp?.toMillis() || 0;
      return timeB - timeA;
    });
    
    return chats;
  } catch (error) {
    console.error('Error getting user chats:', error);
    throw error;
  }
}

/**
 * Update chat's last message metadata
 * @param {string} chatID - Chat ID
 * @param {string} messageText - Message text
 * @param {timestamp} timestamp - Message timestamp
 * @param {string} senderID - Sender user ID
 * @returns {Promise<void>}
 */
export async function updateChatLastMessage(chatID, messageText, timestamp, senderID) {
  try {
    const chatRef = doc(db, 'chats', chatID);
    
    await updateDoc(chatRef, {
      lastMessageText: messageText,
      lastMessageTimestamp: timestamp,
      lastMessageSenderID: senderID,
      updatedAt: serverTimestamp(),
    });
    
    console.log('Chat last message updated:', chatID);
  } catch (error) {
    console.error('Error updating chat last message:', error);
    throw error;
  }
}

// ================================
// MESSAGE OPERATIONS
// ================================

/**
 * Send a message to a chat
 * @param {string} chatID - Chat ID
 * @param {string} senderID - Sender user ID
 * @param {string} senderName - Sender display name
 * @param {string} text - Message text
 * @returns {Promise<Object>} Message object
 */
export async function sendMessage(chatID, senderID, senderName, text) {
  try {
    const messageID = uuid.v4();
    const messagesRef = collection(db, 'chats', chatID, 'messages');
    const messageRef = doc(messagesRef, messageID);
    
    const messageData = {
      messageID,
      chatID,
      senderID,
      senderName,
      text,
      timestamp: serverTimestamp(),
      deliveryStatus: 'sent',
      readBy: [],
      createdAt: serverTimestamp(),
    };
    
    // Write message to subcollection
    await setDoc(messageRef, messageData);
    
    // Update chat's last message
    await updateChatLastMessage(chatID, text, serverTimestamp(), senderID);
    
    console.log('Message sent:', messageID);
    
    return messageData;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Mark a message as read by a user
 * @param {string} chatID - Chat ID
 * @param {string} messageID - Message ID
 * @param {string} userID - User ID who read the message
 * @returns {Promise<void>}
 */
export async function markMessageAsRead(chatID, messageID, userID) {
  try {
    const messageRef = doc(db, 'chats', chatID, 'messages', messageID);
    
    await updateDoc(messageRef, {
      readBy: arrayUnion(userID),
    });
    
    console.log('Message marked as read:', messageID, 'by', userID);
  } catch (error) {
    console.error('Error marking message as read:', error);
    throw error;
  }
}

