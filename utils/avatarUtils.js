// Avatar Utilities - Generate initials and colors for user avatars

/**
 * Color palette for avatars
 * 8 distinct, accessible colors for avatar backgrounds
 */
export const AVATAR_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
];

/**
 * Extract initials from a display name
 * Examples:
 *   "John Doe" -> "JD"
 *   "Jane" -> "JA"
 *   "Mary Jane Watson" -> "MW"
 *   "" -> "?"
 * 
 * @param {string} displayName - User's display name
 * @returns {string} Two-letter initials (uppercase)
 */
export function getInitials(displayName = '') {
  // Handle empty or invalid input
  if (!displayName || typeof displayName !== 'string') {
    return '?';
  }

  // Trim and split name into words
  const words = displayName.trim().split(/\s+/);
  
  if (words.length === 0 || words[0] === '') {
    return '?';
  }
  
  if (words.length === 1) {
    // Single word: take first two characters
    const word = words[0];
    if (word.length === 1) {
      return word.toUpperCase();
    }
    return (word[0] + word[1]).toUpperCase();
  }
  
  // Multiple words: take first letter of first and last word
  const firstInitial = words[0][0];
  const lastInitial = words[words.length - 1][0];
  
  return (firstInitial + lastInitial).toUpperCase();
}

/**
 * Generate a consistent color for a user based on their userID
 * Uses a simple hash function to map userID to one of the color palette
 * The same userID will always get the same color
 * 
 * @param {string} userID - User's unique ID
 * @returns {string} Hex color code
 */
export function getAvatarColor(userID = '') {
  if (!userID) {
    return AVATAR_COLORS[0];
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < userID.length; i++) {
    const char = userID.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Get positive index
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  
  return AVATAR_COLORS[index];
}

/**
 * Get avatar data for a user
 * Convenience function that returns both initials and color
 * 
 * @param {string} displayName - User's display name
 * @param {string} userID - User's unique ID
 * @returns {Object} { initials, color }
 */
export function getAvatarData(displayName, userID) {
  return {
    initials: getInitials(displayName),
    color: getAvatarColor(userID),
  };
}

/**
 * Get contrasting text color for a background color
 * Returns white or black depending on the background brightness
 * 
 * @param {string} hexColor - Background color in hex format
 * @returns {string} '#FFFFFF' or '#000000'
 */
export function getContrastColor(hexColor) {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  // https://www.w3.org/TR/WCAG20/#relativeluminancedef
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return white for dark backgrounds, black for light backgrounds
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

