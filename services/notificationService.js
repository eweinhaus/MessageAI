/**
 * Notification Service
 * 
 * Handles push notification setup, permissions, and listeners for the MessageAI app.
 * Uses Expo Notifications API for cross-platform push notification support.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

/**
 * Configure notification behavior for foreground notifications
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions from the user
 * 
 * @returns {Promise<boolean>} True if permissions granted, false otherwise
 */
export async function requestPermissions() {
  try {
    // Check if running on a physical device
    if (!Device.isDevice) {
      console.warn('[Notifications] Must use physical device for push notifications');
      return false;
    }

    // Get current permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission not granted');
      return false;
    }

    console.log('[Notifications] Permission granted');
    return true;
  } catch (error) {
    console.error('[Notifications] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Get the device's FCM token (Expo Push Token)
 * 
 * @returns {Promise<string|null>} FCM token or null if unable to get token
 */
export async function getFCMToken() {
  try {
    // Check if running on a physical device
    if (!Device.isDevice) {
      console.warn('[Notifications] Must use physical device for push notifications');
      return null;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-expo-project-id', // This will be auto-filled by Expo
    });

    const token = tokenData.data;
    console.log('[Notifications] FCM token obtained:', token.substring(0, 20) + '...');
    return token;
  } catch (error) {
    console.error('[Notifications] Error getting FCM token:', error);
    return null;
  }
}

/**
 * Save FCM token to Firestore user document
 * 
 * @param {string} userID - The user's Firebase Auth UID
 * @param {string} token - The FCM token to save
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function saveFCMToken(userID, token) {
  try {
    if (!userID || !token) {
      console.warn('[Notifications] Missing userID or token');
      return false;
    }

    const userRef = doc(db, 'users', userID);
    await updateDoc(userRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: new Date().toISOString(),
    });

    console.log('[Notifications] FCM token saved to Firestore');
    return true;
  } catch (error) {
    console.error('[Notifications] Error saving FCM token:', error);
    return false;
  }
}

/**
 * Set up notification listeners
 * 
 * @param {function} onNotificationReceived - Callback when notification received in foreground
 * @param {function} onNotificationTapped - Callback when notification is tapped
 * @returns {object} Object with removeListeners function to clean up
 */
export function setupNotificationListeners(onNotificationReceived, onNotificationTapped) {
  try {
    // Listener for notifications received while app is in foreground
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('[Notifications] Notification received in foreground:', notification);
      
      // Extract notification data
      const { title, body } = notification.request.content;
      const data = notification.request.content.data || {};
      
      if (onNotificationReceived) {
        onNotificationReceived({
          title,
          body,
          data,
        });
      }
    });

    // Listener for when user taps on notification
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[Notifications] Notification tapped:', response);
      
      // Extract notification data
      const data = response.notification.request.content.data || {};
      
      if (onNotificationTapped) {
        onNotificationTapped(data);
      }
    });

    console.log('[Notifications] Listeners set up successfully');

    // Return function to remove listeners
    return {
      removeListeners: () => {
        notificationListener.remove();
        responseListener.remove();
        console.log('[Notifications] Listeners removed');
      },
    };
  } catch (error) {
    console.error('[Notifications] Error setting up listeners:', error);
    return {
      removeListeners: () => {},
    };
  }
}

/**
 * Initialize notification service for a user
 * 
 * This is a convenience function that:
 * 1. Requests permissions
 * 2. Gets FCM token
 * 3. Saves token to Firestore
 * 4. Sets up listeners
 * 
 * @param {string} userID - The user's Firebase Auth UID
 * @param {function} onNotificationReceived - Callback when notification received
 * @param {function} onNotificationTapped - Callback when notification tapped
 * @returns {Promise<object>} Object with removeListeners function
 */
export async function initializeNotifications(userID, onNotificationReceived, onNotificationTapped) {
  try {
    console.log('[Notifications] Initializing notifications for user:', userID);

    // Step 1: Request permissions
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      console.warn('[Notifications] User denied notification permissions');
      // Still set up listeners in case permissions are granted later
      return setupNotificationListeners(onNotificationReceived, onNotificationTapped);
    }

    // Step 2: Get FCM token
    const token = await getFCMToken();
    if (!token) {
      console.warn('[Notifications] Unable to get FCM token');
      // Still set up listeners
      return setupNotificationListeners(onNotificationReceived, onNotificationTapped);
    }

    // Step 3: Save token to Firestore
    await saveFCMToken(userID, token);

    // Step 4: Set up listeners
    const listeners = setupNotificationListeners(onNotificationReceived, onNotificationTapped);

    console.log('[Notifications] Initialization complete');
    return listeners;
  } catch (error) {
    console.error('[Notifications] Error initializing notifications:', error);
    return {
      removeListeners: () => {},
    };
  }
}

/**
 * Schedule a local notification (for testing purposes)
 * 
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 */
export async function scheduleLocalNotification(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // Show immediately
    });
    console.log('[Notifications] Local notification scheduled');
  } catch (error) {
    console.error('[Notifications] Error scheduling local notification:', error);
  }
}
