// Root Layout - Handles authentication flow and navigation
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useUserStore from '../store/userStore';
import useChatStore from '../store/chatStore';
import OfflineBanner from '../components/OfflineBanner';
import { initDatabase } from '../db/database';
import { getAllChats } from '../db/messageDb';
import { performFullSync } from '../utils/syncManager';
import { addNetworkListener } from '../utils/networkStatus';
import { processPendingMessages } from '../utils/offlineQueue';

export default function RootLayout() {
  const { isAuthenticated, isLoading, initialize, currentUser } = useUserStore();
  const { setChats } = useChatStore();
  const segments = useSegments();
  const router = useRouter();
  const [dbInitialized, setDbInitialized] = useState(false);
  const [dbError, setDbError] = useState(null);

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
        
      } catch (error) {
        console.error('[App] Error loading/syncing data:', error);
      }
    }

    loadAndSyncData();
  }, [isAuthenticated, currentUser, dbInitialized]);

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
    <>
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
    </>
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
