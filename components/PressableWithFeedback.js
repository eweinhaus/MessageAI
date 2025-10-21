// Pressable with Visual and Haptic Feedback
// Enhanced touchable component with better UX
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

/**
 * PressableWithFeedback Component
 * Wraps Pressable with opacity feedback and optional haptic feedback
 * 
 * Usage:
 * <PressableWithFeedback onPress={handlePress} haptic="selection">
 *   <Text>Press Me</Text>
 * </PressableWithFeedback>
 */
export default function PressableWithFeedback({
  children,
  onPress,
  onLongPress,
  style,
  haptic = null, // 'selection' | 'impact' | 'notification' | null
  disabled = false,
  ...props
}) {
  const handlePress = async () => {
    // Trigger haptic feedback if requested
    if (haptic && !disabled) {
      try {
        // Note: expo-haptics needs to be installed
        // Run: npx expo install expo-haptics
        const Haptics = await import('expo-haptics');
        
        switch (haptic) {
          case 'selection':
            await Haptics.selectionAsync();
            break;
          case 'impact':
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          case 'notification':
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          default:
            break;
        }
      } catch (error) {
        // Haptics not available or not installed - fail silently
        console.log('[Haptics] Not available:', error.message);
      }
    }
    
    if (onPress) {
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});

/**
 * Instructions for adding haptic feedback:
 * 
 * 1. Install expo-haptics:
 *    npx expo install expo-haptics
 * 
 * 2. Replace TouchableOpacity with PressableWithFeedback:
 *    <PressableWithFeedback onPress={handlePress} haptic="selection">
 *      <Text>Button</Text>
 *    </PressableWithFeedback>
 * 
 * 3. Haptic types:
 *    - 'selection': Light tap for selection (checkboxes, list items)
 *    - 'impact': Medium impact for button presses
 *    - 'notification': Success/error notifications
 *    - null: No haptic feedback (visual only)
 * 
 * 4. Haptics work on:
 *    - iOS: Full support (all types)
 *    - Android: Partial support (selection only on most devices)
 *    - Web: Not supported (fails silently)
 */

