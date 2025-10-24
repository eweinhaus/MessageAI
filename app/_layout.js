// Root Layout - Handles authentication flow and navigation
import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useUserStore from '../store/userStore';
import useChatStore from '../store/chatStore';
import useUIStore from '../store/uiStore';
import OfflineBanner from '../components/OfflineBanner';
import NotificationBanner from '../components/NotificationBanner';
import ErrorBoundary from '../components/ErrorBoundary';
import ErrorToast from '../components/ErrorToast';
import SummaryModal from '../components/SummaryModal';
import { initDatabase, flushPendingWrites } from '../db/database';
import { getAllChats } from '../db/messageDb';
import { performFullSync } from '../utils/syncManager';
import { addNetworkListener } from '../utils/networkStatus';
import { processPendingMessages } from '../utils/offlineQueue';
import { initializePresence, setUserOnline, setUserOffline, cleanupPresence } from '../services/presenceService';
import { requestPermissions, registerToken, setupListeners } from '../services/notificationService';
import { pauseAllListeners, resumeAllListeners, clearAllListeners } from '../utils/listenerManager';
import { lifecycleLog, logAppStateChange } from '../utils/diagnosticUtils';

export default function RootLayout() {
  const { isAuthenticated, isLoading, initialize, currentUser } = useUserStore();
  const { setChats } = useChatStore();
  const { globalError, errorVisible, clearError } = useUIStore();
  const segments = useSegments();
  const router = useRouter();
  const [dbInitialized, setDbInitialized] = useState(false);
  const [dbError, setDbError] = useState(null);
  const appState = useRef(AppState.currentState);
  const [notificationBanner, setNotificationBanner] = useState(null);
  const notificationCleanup = useRef(null);
  const [globalSummary, setGlobalSummary] = useState(null);
  const [showGlobalSummaryModal, setShowGlobalSummaryModal] = useState(false);
  const lastSummaryCheck = useRef(0);

  // Initialize database on app startup (before anything else)
  useEffect(() => {
    async function initializeDatabase() {
      try {
        console.log('[App] Initializing SQLite database...');
        await initDatabase();
        setDbInitialized(true);
        console.log('[App] Database initialized successfully');
      } catch (error) {
        console.error('[App] Database initialization failed:', error);
        setDbError(error.message);
      }
    }

    initializeDatabase();
  }, []);

  // Initialize auth listener after database is ready
  useEffect(() => {
    if (!dbInitialized) return;
    
    console.log('[App] Initializing auth...');
    initialize();
  }, [dbInitialized]);

  // Load chats from SQLite and sync with Firestore when authenticated
  useEffect(() => {
    // When user logs out, clear all local stores and data
    if (!isAuthenticated && !isLoading && dbInitialized) {
      console.log('[App] User logged out, clearing local data...');
      const { clearAllData } = require('../db/database');
      const { default: useMessageStore } = require('../store/messageStore');
      
      clearAllData().catch(err => console.error('[App] Error clearing SQLite:', err));
      setChats([]);
      useMessageStore.getState().clearMessages();
      
      // Clear global summary modal state on logout
      setGlobalSummary(null);
      setShowGlobalSummaryModal(false);
      lastSummaryCheck.current = 0;
      
      return;
    }
    
    if (!isAuthenticated || !currentUser || !dbInitialized) return;

    async function loadAndSyncData() {
      try {
        console.log('[App] Loading chats from SQLite...');
        
        // Step 1: Load from SQLite immediately (instant UI)
        const localChats = await getAllChats();
        setChats(localChats);
        console.log(`[App] Loaded ${localChats.length} chats from local cache`);

        // Step 2: Sync with Firestore in background
        console.log('[App] Starting background sync with Firestore...');
        const syncResult = await performFullSync(currentUser.userID);
        
        // Reload from SQLite to get synced data
        const syncedChats = await getAllChats();
        setChats(syncedChats);
        console.log(`[App] Sync complete: ${syncResult.chats.length} chats, ${syncResult.messageCount} messages`);
        
        // Step 3: Process any pending offline messages
        await processPendingMessages();
        
        // Step 4: Check for unread messages and show global summary (on fresh start)
        try {
          const now = Date.now();
          lastSummaryCheck.current = now;
          
          lifecycleLog('Checking for unread messages on fresh start...');
          const { summarizeUnreadGlobal } = require('../services/aiService');
          const result = await summarizeUnreadGlobal({ forceRefresh: false });
          
          if (result.success && result.data?.hasUnread) {
            lifecycleLog('Found unread messages, showing global summary modal');
            setGlobalSummary(result.data);
            setShowGlobalSummaryModal(true);
          } else {
            lifecycleLog('No unread messages found on start');
          }
        } catch (error) {
          // Silent fail - don't bother user with AI errors on app start
          lifecycleLog('Error fetching global summary on start', error);
        }
        
      } catch (error) {
        console.error('[App] Error loading/syncing data:', error);
      }
    }

    loadAndSyncData();
  }, [isAuthenticated, currentUser, dbInitialized, isLoading]);

  // Set up network listener to trigger sync when coming back online
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !dbInitialized) return;

    console.log('[App] Setting up network listener...');
    
    const cleanup = addNetworkListener(async (networkState) => {
      console.log('[App] Network state changed:', networkState);
      
      if (networkState.isOnline && currentUser) {
        console.log('[App] Network back online, processing pending messages...');
        try {
          await processPendingMessages();
        } catch (error) {
          console.error('[App] Error processing pending messages:', error);
        }
      }
    });

    return cleanup;
  }, [isAuthenticated, currentUser, dbInitialized]);

  // Set up presence tracking and enhanced app lifecycle handling
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    // Initialize presence tracking for this user
    initializePresence(currentUser.userID);
    lifecycleLog('Presence tracking initialized', { userID: currentUser.userID });

    // Enhanced app state change handler
    const handleAppStateChange = async (nextAppState) => {
      const prevState = appState.current;
      logAppStateChange(prevState, nextAppState);
      
      // App coming to foreground
      if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        lifecycleLog('App foregrounded - resuming operations');
        
        try {
          // 1. Set user online (highest priority)
          await setUserOnline(currentUser.userID);
          
          // 2. Resume Firestore listeners
          const resumed = await resumeAllListeners();
          lifecycleLog(`Resumed ${resumed} Firestore listeners`);
          
          // 3. Process pending messages queue
          lifecycleLog('Processing pending messages after foreground...');
          await processPendingMessages();
          
          // 4. Check for unread messages and show global summary (throttled)
          // Only check if user is still authenticated
          if (!currentUser) {
            lifecycleLog('Skipping summary check (user not authenticated)');
          } else {
            const now = Date.now();
            const timeSinceLastCheck = now - lastSummaryCheck.current;
            const MIN_CHECK_INTERVAL = 120000; // 2 minute throttle
            
            if (timeSinceLastCheck > MIN_CHECK_INTERVAL) {
              lastSummaryCheck.current = now;
              lifecycleLog('Checking for unread messages...');
              
              // Import dynamically to avoid circular dependency
              const { summarizeUnreadGlobal } = require('../services/aiService');
              
              try {
                const result = await summarizeUnreadGlobal({ forceRefresh: false });
                
                if (result.success && result.data?.hasUnread) {
                  lifecycleLog('Found unread messages, showing global summary modal');
                  setGlobalSummary(result.data);
                  setShowGlobalSummaryModal(true);
                } else {
                  lifecycleLog('No unread messages found');
                }
              } catch (error) {
                // Silent fail - don't bother user with AI errors on app open
                lifecycleLog('Error fetching global summary', error);
              }
            } else {
              lifecycleLog(`Skipping summary check (throttled, ${Math.round(timeSinceLastCheck/1000)}s since last check)`);
            }
          }
          
          lifecycleLog('Foreground operations complete');
        } catch (error) {
          lifecycleLog('Error during foreground operations', error);
        }
      } 
      // App going to background
      else if (prevState === 'active' && nextAppState.match(/inactive|background/)) {
        lifecycleLog('App backgrounding - pausing operations');
        
        try {
          // 1. Flush pending SQLite writes (ensure no data loss)
          lifecycleLog('Flushing pending SQLite writes...');
          await flushPendingWrites();
          
          // 2. Set user offline
          await setUserOffline(currentUser.userID);
          
          // 3. Pause all Firestore listeners to save resources
          pauseAllListeners();
          lifecycleLog('Paused all Firestore listeners');
          
          lifecycleLog('Background operations complete');
        } catch (error) {
          lifecycleLog('Error during background operations', error);
        }
      }
      
      appState.current = nextAppState;
    };

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      lifecycleLog('Cleaning up lifecycle handlers');
      setUserOffline(currentUser.userID);
      cleanupPresence();
      clearAllListeners();
      subscription.remove();
    };
  }, [isAuthenticated, currentUser]);

  // Set up push notifications - request permissions and register token
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !dbInitialized) return;

    async function initializeNotifications() {
      try {
        console.log('[App] Initializing push notifications...');

        // Request notification permissions
        const permissionsGranted = await requestPermissions();
        
        if (!permissionsGranted) {
          console.warn('[App] Notification permissions not granted, notifications disabled');
          return;
        }

        // Register FCM token with Firestore
        const tokenRegistered = await registerToken(currentUser.userID);
        
        if (!tokenRegistered) {
          console.warn('[App] Failed to register FCM token');
          return;
        }

        // Set up notification listeners with currentUserID for validation
        const cleanup = setupListeners(
          router, 
          (notificationData) => {
            // Show notification banner
            console.log('[App] Showing notification banner:', notificationData.title);
            setNotificationBanner(notificationData);
          },
          currentUser.userID // Pass currentUserID for chat membership validation
        );

        notificationCleanup.current = cleanup;
        console.log('[App] Push notifications initialized successfully');

      } catch (error) {
        console.error('[App] Error initializing notifications:', error);
      }
    }

    initializeNotifications();

    // Cleanup on unmount
    return () => {
      if (notificationCleanup.current) {
        console.log('[App] Cleaning up notification listeners');
        notificationCleanup.current();
        notificationCleanup.current = null;
      }
    };
  }, [isAuthenticated, currentUser, dbInitialized]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading) {
      // Still checking auth state, don't navigate yet
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // User is not signed in and not on auth screen, redirect to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // User is signed in but on auth screen, redirect to main app
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Global summary quick action handlers
  const handleGlobalMarkComplete = async (item) => {
    try {
      if (!item || !item.id) {
        console.warn('[Layout] Action item missing ID:', item);
        return;
      }
      
      // Import dynamically to avoid circular dependency
      const { updateActionItemStatus } = require('../services/aiService');
      const itemChatId = item.chatId || currentUser?.userID || 'global';
      
      const result = await updateActionItemStatus(itemChatId, item.id, 'completed');
      
      if (result.success) {
        console.log('[Layout] Action item marked as complete');
        setShowGlobalSummaryModal(false);
      }
    } catch (error) {
      console.error('[Layout] Error marking action complete:', error);
    }
  };

  const handleGlobalJumpToChat = (item) => {
    try {
      setShowGlobalSummaryModal(false);
      
      if (item.chatId) {
        // Navigate to the chat
        router.push(`/chat/${item.chatId}`);
      }
    } catch (error) {
      console.error('[Layout] Error navigating to chat:', error);
    }
  };

  // Show loading screen while initializing database or checking auth state
  if (!dbInitialized || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        {dbError && (
          <Text style={styles.errorText}>Database Error: {dbError}</Text>
        )}
        {!dbError && !dbInitialized && (
          <Text style={styles.loadingText}>Initializing database...</Text>
        )}
        {!dbError && dbInitialized && isLoading && (
          <Text style={styles.loadingText}>Loading...</Text>
        )}
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="contacts" options={{ headerShown: false }} />
      </Stack>
      <OfflineBanner />
      {notificationBanner && (
        <NotificationBanner
          title={notificationBanner.title}
          body={notificationBanner.body}
          onPress={notificationBanner.onPress}
          onDismiss={() => setNotificationBanner(null)}
        />
      )}
      <ErrorToast
        error={globalError}
        visible={errorVisible}
        onDismiss={clearError}
        type="error"
      />
      {globalSummary && (
        <SummaryModal
          visible={showGlobalSummaryModal}
          onClose={() => setShowGlobalSummaryModal(false)}
          summary={globalSummary}
          isGlobal={true}
          onMarkComplete={handleGlobalMarkComplete}
          onJumpToChat={handleGlobalJumpToChat}
        />
      )}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#d32f2f',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
