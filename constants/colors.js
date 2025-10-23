// Color Constants
// Consistent color palette used across the app

// Primary brand color
export const PRIMARY_GREEN = '#4CAF50';
export const PRIMARY_GREEN_DARK = '#388E3C';
export const PRIMARY_GREEN_LIGHT = '#E8F5E9';

// Message bubble colors
export const BUBBLE_OWN = '#007AFF'; // Blue for own messages (iOS style)
export const BUBBLE_OTHER = '#E5E5EA'; // Light gray for other messages

// Text colors
export const TEXT_PRIMARY = '#000000';
export const TEXT_SECONDARY = '#666666';
export const TEXT_LIGHT = '#999999';
export const TEXT_ON_PRIMARY = '#FFFFFF'; // Text on blue bubble

// Background colors
export const BACKGROUND_PRIMARY = '#FFFFFF';
export const BACKGROUND_SECONDARY = '#F5F5F5';
export const BACKGROUND_CHAT = '#FAFAFA';
export const BACKGROUND_COLOR = '#F5F5F5'; // General background color

// Timestamp colors
export const TIMESTAMP_COLOR = '#8E8E93';

// Status colors
export const STATUS_ONLINE = '#4CAF50';
export const STATUS_OFFLINE = '#CCCCCC';
export const STATUS_ERROR = '#FF3B30';
export const ERROR_COLOR = '#d32f2f'; // Error/failed message color

// Border colors
export const BORDER_LIGHT = '#E0E0E0';

// Loading/Disabled states
export const DISABLED_COLOR = '#CCCCCC';

// Default export for convenience
export default {
  // Primary colors
  primary: PRIMARY_GREEN,
  primaryDark: PRIMARY_GREEN_DARK,
  primaryLight: PRIMARY_GREEN_LIGHT,
  
  // Message bubbles
  bubbleOwn: BUBBLE_OWN,
  bubbleOther: BUBBLE_OTHER,
  
  // Text colors
  text: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textLight: TEXT_LIGHT,
  white: TEXT_ON_PRIMARY,
  
  // Background colors
  background: BACKGROUND_PRIMARY,
  backgroundSecondary: BACKGROUND_SECONDARY,
  backgroundChat: BACKGROUND_CHAT,
  backgroundColor: BACKGROUND_COLOR,
  
  // Gray shades
  lightGray: BACKGROUND_SECONDARY,
  mediumGray: TEXT_SECONDARY,
  
  // Timestamp
  timestamp: TIMESTAMP_COLOR,
  
  // Status colors
  online: STATUS_ONLINE,
  offline: STATUS_OFFLINE,
  error: STATUS_ERROR,
  errorColor: ERROR_COLOR,
  
  // Border colors
  border: BORDER_LIGHT,
  
  // Disabled
  disabled: DISABLED_COLOR,
};

