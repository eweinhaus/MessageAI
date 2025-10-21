/**
 * NotificationBanner Component
 * 
 * Displays an in-app notification banner that slides down from the top
 * when a new message is received while the app is in foreground.
 * Auto-dismisses after 3 seconds or can be tapped to navigate to the chat.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRIMARY_COLOR } from '../constants/colors';

const BANNER_HEIGHT = 80;
const ANIMATION_DURATION = 300;
const AUTO_DISMISS_DELAY = 3000;

export default function NotificationBanner({ title, body, onPress, onDismiss }) {
  const slideAnim = useRef(new Animated.Value(-BANNER_HEIGHT)).current;
  const dismissTimer = useRef(null);

  useEffect(() => {
    // Announce notification for accessibility
    if (title && body) {
      AccessibilityInfo.announceForAccessibility(`New message from ${title}: ${body}`);
    }

    // Slide in animation
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Auto-dismiss after delay
    dismissTimer.current = setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_DELAY);

    // Cleanup on unmount
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  const handleDismiss = () => {
    // Clear auto-dismiss timer
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    // Slide out animation
    Animated.timing(slideAnim, {
      toValue: -BANNER_HEIGHT,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(() => {
      if (onDismiss) {
        onDismiss();
      }
    });
  };

  const handlePress = () => {
    handleDismiss();
    if (onPress) {
      onPress();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <TouchableOpacity
          style={styles.banner}
          onPress={handlePress}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`New message from ${title}`}
          accessibilityHint="Double tap to open chat"
        >
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title || 'New message'}
              </Text>
              <Text style={styles.body} numberOfLines={2}>
                {body || ''}
              </Text>
            </View>
            <View style={styles.indicator} />
          </View>
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 10,
  },
  safeArea: {
    backgroundColor: 'transparent',
  },
  banner: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PRIMARY_COLOR,
  },
});

