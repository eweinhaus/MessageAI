/**
 * Icon Component
 * 
 * Centralized icon system using text-based Unicode symbols
 * styled to look like proper icons rather than emojis.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import colors from '../constants/colors';

/**
 * Icon name to Unicode symbol mapping
 */
const ICONS = {
  // AI Features
  brain: '◉',           // AI Insights header
  alert: '▲',          // Priority Detection (triangle/alert)
  document: '☰',       // Summarize Thread (document/lines)
  checkCircle: '✓',    // Find Action Items (check)
  search: '⌕',         // Smart Search (magnifying glass)
  target: '⊙',         // Track Decisions (target/bullseye)
  
  // Status & Alerts
  warning: '⚠',        // Warning/Priority
  info: 'i',           // Information
  success: '✓',        // Success
  error: '✕',          // Error
  close: '✕',          // Close button
  
  // Actions & UI
  wave: '☺',           // Empty state greeting
  chevronRight: '›',   // Navigation arrow
  message: '◈',        // Message/Chat bubble
};

/**
 * Icon size presets
 */
const SIZES = {
  small: 16,
  medium: 20,
  large: 24,
  xlarge: 32,
  xxlarge: 48,
};

/**
 * Icon Component
 * 
 * @param {string} name - Icon name from ICONS mapping
 * @param {string|number} size - Size preset ('small', 'medium', etc.) or number
 * @param {string} color - Color hex/name
 * @param {object} style - Additional styles
 */
export default function Icon({ name, size = 'medium', color = colors.text, style, ...props }) {
  const iconSymbol = ICONS[name] || '?';
  const iconSize = typeof size === 'number' ? size : SIZES[size];
  
  return (
    <Text
      style={[
        styles.icon,
        {
          fontSize: iconSize,
          color: color,
        },
        style,
      ]}
      {...props}
    >
      {iconSymbol}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

// Export icon names for convenience
export const IconNames = Object.keys(ICONS);

