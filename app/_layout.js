// Root Layout - Handles authentication flow and navigation
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useUserStore from '../store/userStore';
import OfflineBanner from '../components/OfflineBanner';

export default function RootLayout() {
  const { isAuthenticated, isLoading, initialize } = useUserStore();
  const segments = useSegments();
  const router = useRouter();

  // Initialize auth listener on mount
  useEffect(() => {
    console.log('Root layout mounting, initializing user store...');
    initialize();
  }, []);

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

  // Show loading screen while checking auth state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
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
});
