// Offline Banner Component - Shows when device is offline
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNetworkStatus } from '../utils/networkStatus';

/**
 * Offline Banner Component
 * Displays a red banner at the top of the screen when device is offline
 * Automatically hides when connection is restored
 */
export default function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-60)).current; // Start hidden above screen

  useEffect(() => {
    if (!isOnline) {
      // Slide down to show banner
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Slide up to hide banner
      Animated.timing(slideAnim, {
        toValue: -60,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOnline, slideAnim]);

  // Always render but position off-screen when online
  return (
    <Animated.View
      style={[
        styles.banner,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.text}>
        No internet connection. Messages will send when online.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#d32f2f', // Red for error/warning
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingTop: 48, // Account for status bar
    zIndex: 9999, // Ensure it's above all other content
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

