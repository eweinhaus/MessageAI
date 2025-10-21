/**
 * NotificationBanner Component
 * 
 * Displays an in-app notification banner when a message is received while
 * the app is in the foreground. Banner slides from the top, shows sender
 * info and message preview, and auto-dismisses after 3 seconds.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInitials, getAvatarColor } from '../utils/avatarUtils';
import { PRIMARY_GREEN, TEXT_PRIMARY, TEXT_SECONDARY } from '../constants/colors';

/**
 * NotificationBanner
 * 
 * @param {object} props
 * @param {string} props.senderName - Name of message sender
 * @param {string} props.messageText - Message content preview
 * @param {string} props.senderID - Sender's user ID (for avatar color)
 * @param {string} props.chatID - Chat ID for navigation
 * @param {function} props.onDismiss - Callback when banner is dismissed
 * @param {function} props.onTap - Callback when banner is tapped
 * @param {boolean} props.visible - Whether banner is visible
 */
export default function NotificationBanner({
  senderName,
  messageText,
  senderID,
  chatID,
  onDismiss,
  onTap,
  visible,
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const dismissTimer = useRef(null);

  useEffect(() => {
    if (visible) {
      // Slide in animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();

      // Auto-dismiss after 3 seconds
      dismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, 3000);
    } else {
      // Slide out animation
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    // Cleanup timer on unmount
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [visible]);

  const handleDismiss = () => {
    // Clear timer
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    // Slide out
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      if (onDismiss) {
        onDismiss();
      }
    });
  };

  const handleTap = () => {
    // Clear timer
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    // Dismiss immediately
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (onTap) {
        onTap(chatID);
      }
    });
  };

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // Truncate message text if too long
  const truncatedMessage = messageText && messageText.length > 80
    ? messageText.substring(0, 77) + '...'
    : messageText || 'New message';

  // Get initials and color for sender avatar
  const initials = getInitials(senderName || 'User');
  const avatarColor = getAvatarColor(senderID || 'default');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.banner}
        onPress={handleTap}
        activeOpacity={0.9}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.senderName} numberOfLines={1}>
            {senderName || 'Unknown User'}
          </Text>
          <Text style={styles.messageText} numberOfLines={2}>
            {truncatedMessage}
          </Text>
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 9999,
    elevation: 10,
  },
  banner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  dismissButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 20,
    color: TEXT_SECONDARY,
    fontWeight: '300',
  },
});
