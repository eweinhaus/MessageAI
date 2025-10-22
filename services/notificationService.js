/**
 * Notification Service
 * 
 * Handles push notification permissions, token registration,
 * and notification listeners for foreground notifications.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { updateUserProfile } from './firestore';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions from the user
 * @returns {Promise<boolean>} - true if permissions granted
 */
export async function requestPermissions() {
  try {
    console.log('[NotificationService] Requesting notification permissions...');

    // Only real devices can receive push notifications
    if (!Device.isDevice) {
      console.warn('[NotificationService] Push notifications only work on physical devices');
      return false;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[NotificationService] Notification permissions denied');
      return false;
    }

    console.log('[NotificationService] Notification permissions granted');

    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4285F4',
      });
      console.log('[NotificationService] Android notification channel created');
    }

    return true;
  } catch (error) {
    console.error('[NotificationService] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Get the FCM/Expo push token for this device
 * @returns {Promise<string|null>} - The push token or null if unavailable
 */
export async function getDevicePushToken() {
  try {
    console.log('[NotificationService] Getting device push token...');

    if (!Device.isDevice) {
      console.warn('[NotificationService] Cannot get push token on simulator');
      return null;
    }

    // Get Expo push token (works with Expo Go and standalone builds)
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '12be9046-fac8-441c-aa03-f047cfed9f72',
    });

    const token = tokenData.data;
    console.log('[NotificationService] Got push token:', token.substring(0, 20) + '...');
    
    return token;
  } catch (error) {
    console.error('[NotificationService] Error getting push token:', error);
    return null;
  }
}

/**
 * Register the device token with Firestore for this user
 * IMPORTANT: Clears token from other users to prevent cross-user notifications
 * @param {string} userID - The user ID
 * @returns {Promise<boolean>} - true if token was saved successfully
 */
export async function registerToken(userID) {
  try {
    if (!userID) {
      console.warn('[NotificationService] No userID provided, cannot register token');
      return false;
    }

    const token = await getDevicePushToken();
    
    if (!token) {
      console.warn('[NotificationService] No token available to register');
      return false;
    }

    console.log('[NotificationService] Registering FCM token for user:', userID);
    
    // SECURITY: Clear this token from any other user who might have it
    // This handles the case where previous user didn't properly log out
    try {
      const { getFirestore, collection, query, where, getDocs, updateDoc, doc } = await import('firebase/firestore');
      const db = getFirestore();
      
      // Find all users with this token (excluding current user)
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('fcmToken', '==', token));
      const querySnapshot = await getDocs(q);
      
      const clearPromises = [];
      querySnapshot.forEach((userDoc) => {
        if (userDoc.id !== userID) {
          console.log('[NotificationService] Clearing stale token from user:', userDoc.id);
          clearPromises.push(
            updateDoc(doc(db, 'users', userDoc.id), { fcmToken: null })
          );
        }
      });
      
      if (clearPromises.length > 0) {
        await Promise.all(clearPromises);
        console.log(`[NotificationService] Cleared token from ${clearPromises.length} other user(s)`);
      }
    } catch (cleanupError) {
      console.error('[NotificationService] Error cleaning up stale tokens:', cleanupError);
      // Continue with registration even if cleanup fails
    }
    
    // Register token for current user
    await updateUserProfile(userID, { fcmToken: token });
    
    console.log('[NotificationService] FCM token registered successfully');
    return true;
  } catch (error) {
    console.error('[NotificationService] Error registering token:', error);
    return false;
  }
}

/**
 * Set up notification listeners for foreground and tap events
 * @param {object} router - Expo Router instance
 * @param {function} showBanner - Function to show in-app notification banner
 * @param {string} currentUserID - Current logged-in user ID for validation
 * @returns {function} - Cleanup function to remove listeners
 */
export function setupListeners(router, showBanner, currentUserID) {
  console.log('[NotificationService] Setting up notification listeners...', { currentUserID });

  // Track displayed notifications to prevent duplicates
  const displayedNotifications = new Set();

  // Listener for notifications received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener(async (notification) => {
    try {
      const { title, body } = notification.request.content;
      const data = notification.request.content.data;
      const messageID = data?.messageID;
      const chatID = data?.chatID;

      console.log('[NotificationService] Notification received in foreground:', {
        title,
        body: body?.substring(0, 50),
        data,
        currentUserID,
      });

      // ===== VALIDATION: Only show notifications for user's chats =====
      
      // Prevent duplicate banners for the same message
      if (messageID && displayedNotifications.has(messageID)) {
        console.log('[NotificationService] Skipping duplicate notification for message:', messageID);
        return;
      }

      // Validate that this notification is for a chat the user participates in
      if (!chatID) {
        console.warn('[NotificationService] No chatID in notification data, ignoring');
        return;
      }

      if (!currentUserID) {
        console.warn('[NotificationService] No currentUserID available, ignoring notification');
        return;
      }

      // Check if this chat exists in the user's local database
      // If it exists locally, it means the user is a participant
      try {
        const { getChatByID } = await import('../db/messageDb');
        const chat = await getChatByID(chatID);
        
        if (!chat) {
          console.warn('[NotificationService] Chat not found in local database, user is not a participant:', chatID);
          return;
        }

        // Additional validation: Check if current user is in participantIDs/memberIDs
        const isParticipant = 
          (chat.participantIDs && chat.participantIDs.includes(currentUserID)) ||
          (chat.memberIDs && chat.memberIDs.includes(currentUserID));

        if (!isParticipant) {
          console.warn('[NotificationService] User is not a participant in this chat:', chatID);
          return;
        }

        console.log('[NotificationService] Notification validated for user chat:', chatID);
      } catch (dbError) {
        console.error('[NotificationService] Error validating chat membership:', dbError);
        // Fail closed: don't show notification if we can't validate
        return;
      }

      // ===== END VALIDATION =====

      if (messageID) {
        displayedNotifications.add(messageID);
        
        // Clean up old entries after 1 minute
        setTimeout(() => {
          displayedNotifications.delete(messageID);
        }, 60000);
      }

      // Show in-app banner (only if validation passed)
      if (showBanner) {
        showBanner({
          title: title || 'New message',
          body: body || '',
          data: data || {},
          onPress: () => {
            // Navigate to chat when banner is tapped
            if (data?.chatID) {
              console.log('[NotificationService] Navigating to chat:', data.chatID);
              router.push(`/chat/${data.chatID}`);
            }
          },
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error handling received notification:', error);
    }
  });

  // Listener for when user taps a notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response.notification.request.content.data;
      
      console.log('[NotificationService] Notification tapped:', data);

      // Navigate to the chat
      if (data?.chatID) {
        console.log('[NotificationService] Navigating to chat from tap:', data.chatID);
        router.push(`/chat/${data.chatID}`);
      }
    } catch (error) {
      console.error('[NotificationService] Error handling notification tap:', error);
    }
  });

  console.log('[NotificationService] Notification listeners active');

  // Return cleanup function
  return () => {
    console.log('[NotificationService] Cleaning up notification listeners');
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Clear all notifications for this app
 */
export async function clearAllNotifications() {
  try {
    await Notifications.dismissAllNotificationsAsync();
    console.log('[NotificationService] All notifications cleared');
  } catch (error) {
    console.error('[NotificationService] Error clearing notifications:', error);
  }
}

/**
 * Clear badge count (iOS)
 */
export async function clearBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
    console.log('[NotificationService] Badge cleared');
  } catch (error) {
    console.error('[NotificationService] Error clearing badge:', error);
  }
}

