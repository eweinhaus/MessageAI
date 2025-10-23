// Error Toast - User-friendly error notification
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions } from 'react-native';
import Icon from './Icon';
import { getErrorMessage } from '../utils/errorMessages';

const { width } = Dimensions.get('window');

/**
 * ErrorToast Component
 * Shows user-friendly error messages at the top of the screen
 * Auto-dismisses after 5 seconds
 */
export default function ErrorToast({ error, visible, onDismiss, type = 'error' }) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      // Reset position when not visible
      slideAnim.setValue(-100);
      opacity.setValue(0);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!visible || !error) {
    return null;
  }

  const message = getErrorMessage(error);
  
  // Get color based on type
  const getBackgroundColor = () => {
    switch (type) {
      case 'error':
        return '#d32f2f';
      case 'warning':
        return '#f57c00';
      case 'info':
        return '#1976d2';
      case 'success':
        return '#388e3c';
      default:
        return '#d32f2f';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacity,
          backgroundColor: getBackgroundColor(),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handleDismiss}
        activeOpacity={0.9}
      >
        <View style={styles.iconContainer}>
          {type === 'error' && <Icon name="warning" size="large" color="#fff" />}
          {type === 'warning' && <Icon name="warning" size="large" color="#fff" />}
          {type === 'info' && <Icon name="info" size="large" color="#fff" />}
          {type === 'success' && <Icon name="success" size="large" color="#fff" />}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.message} numberOfLines={3}>
            {message}
          </Text>
          <Text style={styles.dismissText}>Tap to dismiss</Text>
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="close" size="xlarge" color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
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
    elevation: 999,
    paddingTop: 44, // Safe area for status bar
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  dismissText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 4,
  },
  closeButton: {
    marginLeft: 12,
    padding: 4,
  },
});

