// Time Utilities - Format timestamps for display

/**
 * Format a timestamp for display in chat list
 * Returns relative time for recent messages, absolute date for older ones
 * 
 * Examples:
 *   - Just now (< 1 minute)
 *   - 2m (< 1 hour)
 *   - 3h (< 24 hours)
 *   - Yesterday
 *   - Mon (< 7 days)
 *   - 10/15 (< 1 year)
 *   - 10/15/24 (> 1 year)
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  // Support Firestore Timestamp and guard against NaN
  const ts = typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : timestamp;
  if (Number.isNaN(ts)) return '';
  
  const now = Date.now();
  const diff = now - ts;
  
  // Convert to seconds
  const seconds = Math.floor(diff / 1000);
  
  // Less than 1 minute
  if (seconds < 60) {
    return 'Just now';
  }
  
  // Less than 1 hour - show minutes
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  // Less than 24 hours - show hours
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  
  // Yesterday
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return 'Yesterday';
  }
  
  // Less than 7 days - show day of week
  if (days < 7) {
    const date = new Date(ts);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[date.getDay()];
  }
  
  // Less than 1 year - show MM/DD
  const date = new Date(ts);
  const currentYear = new Date().getFullYear();
  
  if (date.getFullYear() === currentYear) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }
  
  // More than 1 year - show MM/DD/YY
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
}

/**
 * Format a timestamp for message display (more detailed)
 * Shows time of day for today, date for older messages
 * 
 * Examples:
 *   - 10:30 AM (today)
 *   - Yesterday 3:45 PM
 *   - Monday 2:15 PM (this week)
 *   - Oct 15, 2:30 PM (this year)
 *   - Oct 15, 2024 (older)
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  // Support Firestore Timestamp and guard against NaN
  const ts = typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : timestamp;
  if (Number.isNaN(ts)) return '';
  
  const date = new Date(ts);
  const now = new Date();
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  const timeString = `${displayHours}:${displayMinutes} ${ampm}`;
  
  // Check if today
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return timeString;
  }
  
  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) {
    return `Yesterday ${timeString}`;
  }
  
  // Check if this week
  const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${dayNames[date.getDay()]} ${timeString}`;
  }
  
  // Check if this year
  if (date.getFullYear() === now.getFullYear()) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${timeString}`;
  }
  
  // Older than this year
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Truncate text to a maximum length
 * Adds ellipsis if truncated
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

