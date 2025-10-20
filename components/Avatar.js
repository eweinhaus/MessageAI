// Avatar Component - Display user avatar with initials
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getInitials, getAvatarColor, getContrastColor } from '../utils/avatarUtils';

/**
 * Avatar Component
 * Displays a circular avatar with user's initials
 * Color is deterministically generated from userID
 * 
 * @param {Object} props
 * @param {string} props.displayName - User's display name
 * @param {string} props.userID - User's unique ID
 * @param {number} props.size - Avatar diameter in pixels (default: 40)
 * @param {Object} props.style - Additional styles for the avatar container
 */
export default function Avatar({ displayName, userID, size = 40, style }) {
  const initials = getInitials(displayName);
  const backgroundColor = getAvatarColor(userID);
  const textColor = getContrastColor(backgroundColor);
  
  // Calculate font size based on avatar size (roughly 40% of diameter)
  const fontSize = size * 0.4;
  
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            fontSize,
            color: textColor,
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

