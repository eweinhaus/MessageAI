// MessageBubble Component - Individual message display
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { formatMessageTime } from '../utils/timeUtils';
import {
  BUBBLE_OWN,
  BUBBLE_OTHER,
  TEXT_PRIMARY,
  TEXT_ON_PRIMARY,
  TIMESTAMP_COLOR,
} from '../constants/colors';

/**
 * MessageBubble Component
 * Displays a single message in a chat conversation
 * 
 * @param {Object} props
 * @param {Object} props.message - Message object
 * @param {boolean} props.isOwn - Whether this is the current user's message
 * @param {boolean} props.showSenderInfo - Whether to show avatar and name (for groups)
 * @param {boolean} props.isGrouped - Whether this message is grouped with previous (hide avatar/name)
 */
function MessageBubble({ message, isOwn, showSenderInfo = false, isGrouped = false }) {
  const {
    text,
    timestamp,
    senderName,
    senderID,
    deliveryStatus,
  } = message;

  // Validate and normalize timestamp
  const validTimestamp = timestamp && !isNaN(timestamp) ? timestamp : Date.now();

  // Determine if we should show avatar/name
  const shouldShowSender = showSenderInfo && !isGrouped && !isOwn;

  return (
    <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
      {/* Avatar and sender name for other users in groups */}
      {shouldShowSender && (
        <View style={styles.senderInfo}>
          <Avatar
            displayName={senderName}
            userID={senderID}
            size={32}
            style={styles.avatar}
          />
          <Text style={styles.senderName}>{senderName}</Text>
        </View>
      )}
      
      {/* Message bubble */}
      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          shouldShowSender && styles.bubbleWithSender,
          isGrouped && !isOwn && styles.bubbleGrouped,
        ]}
      >
        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
          {text}
        </Text>
      </View>

      {/* Timestamp and delivery status */}
      <View style={[styles.metaContainer, isOwn ? styles.metaContainerOwn : styles.metaContainerOther]}>
        <Text style={styles.timestamp}>{formatMessageTime(validTimestamp)}</Text>
        
        {/* Delivery status for own messages (placeholder for PR 8) */}
        {isOwn && deliveryStatus && (
          <Text style={styles.deliveryStatus}>
            {getDeliveryStatusIcon(deliveryStatus)}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * Get delivery status icon/text
 * @param {string} status - Delivery status
 * @returns {string} Icon or text representation
 */
function getDeliveryStatusIcon(status) {
  switch (status) {
    case 'sending':
      return '○'; // Circle (sending)
    case 'sent':
      return '✓'; // Single check (sent)
    case 'delivered':
      return '✓✓'; // Double check (delivered)
    case 'read':
      return '✓✓'; // Double check - will be blue in PR 9
    case 'failed':
      return '⚠'; // Warning symbol
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  containerOwn: {
    alignItems: 'flex-end',
  },
  containerOther: {
    alignItems: 'flex-start',
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginLeft: 8,
  },
  avatar: {
    marginRight: 6,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bubbleOwn: {
    backgroundColor: BUBBLE_OWN,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: BUBBLE_OTHER,
    borderBottomLeftRadius: 4,
  },
  bubbleWithSender: {
    marginLeft: 38, // Account for avatar space
  },
  bubbleGrouped: {
    marginLeft: 38, // Keep consistent alignment with previous messages
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: TEXT_ON_PRIMARY,
  },
  messageTextOther: {
    color: TEXT_PRIMARY,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  metaContainerOwn: {
    justifyContent: 'flex-end',
  },
  metaContainerOther: {
    justifyContent: 'flex-start',
    marginLeft: 38, // Align with message bubble when sender info is shown
  },
  timestamp: {
    fontSize: 11,
    color: TIMESTAMP_COLOR,
    marginRight: 4,
  },
  deliveryStatus: {
    fontSize: 11,
    color: TIMESTAMP_COLOR,
  },
});

// Memoize to prevent unnecessary re-renders
export default memo(MessageBubble);

