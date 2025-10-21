// MessageBubble Component - Individual message display
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatMessageTime } from '../utils/timeUtils';
import { retryFailedMessage } from '../services/messageService';
import {
  BUBBLE_OWN,
  BUBBLE_OTHER,
  TEXT_PRIMARY,
  TEXT_ON_PRIMARY,
  TIMESTAMP_COLOR,
  ERROR_COLOR,
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
 * @param {boolean} props.isLastInGroup - Whether this is the last message in a group (show timestamp/status)
 */
function MessageBubble({ message, isOwn, showSenderInfo = false, isGrouped = false, isLastInGroup = true }) {
  const {
    messageID,
    chatID,
    text,
    timestamp,
    senderName,
    senderID,
    deliveryStatus,
    syncStatus,
    readBy = [],
  } = message;

  // Validate and normalize timestamp
  const validTimestamp = timestamp && !isNaN(timestamp) ? timestamp : Date.now();

  // Determine if we should show avatar/name
  const shouldShowSender = showSenderInfo && !isGrouped && !isOwn;

  // Handle retry button press
  const handleRetry = async () => {
    await retryFailedMessage(messageID, chatID);
  };

  return (
    <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
      <View style={[styles.messageBlock, isOwn ? styles.messageBlockOwn : styles.messageBlockOther]}>
        {/* Sender name for other users in groups (no avatar) */}
        {shouldShowSender && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        
        {/* Message bubble */}
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            !isLastInGroup && styles.bubbleInGroup,
          ]}
        >
          <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
            {text}
          </Text>
        </View>

        {/* Timestamp and delivery status - only show for last message in group */}
        {isLastInGroup && (
          <View style={[styles.metaContainer, isOwn ? styles.metaContainerOwn : styles.metaContainerOther]}>
            <Text style={styles.timestamp}>{formatMessageTime(validTimestamp)}</Text>
            
            {/* Delivery status for own messages */}
            {isOwn && deliveryStatus && (
              <Text
                style={[
                  styles.deliveryStatus,
                  deliveryStatus === 'failed' && styles.deliveryStatusFailed,
                  (deliveryStatus === 'read' || readBy.length > 0) && styles.deliveryStatusRead,
                ]}
              >
                {getStatusText({ deliveryStatus, isRead: readBy.length > 0, syncStatus })}
              </Text>
            )}
          </View>
        )}

        {/* Retry button for failed messages */}
        {isOwn && deliveryStatus === 'failed' && (
          <View style={styles.retryContainer}>
            <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Get status text considering syncStatus and read state
 * @param {{ deliveryStatus: string, isRead: boolean, syncStatus?: string }} params
 * @returns {string}
 */
function getStatusText({ deliveryStatus, isRead, syncStatus }) {
  // If read, always show Read
  if (isRead || deliveryStatus === 'read') return 'Read';

  // While not synced yet, prefer Showing Sending
  if (syncStatus && syncStatus !== 'synced') return 'Sending';

  switch (deliveryStatus) {
    case 'sending':
      return 'Sending';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'failed':
      return 'Failed';
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
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
    marginLeft: 4,
    opacity: 0.7,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOwn: {
    backgroundColor: BUBBLE_OWN,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: BUBBLE_OTHER,
    borderBottomLeftRadius: 4,
  },
  bubbleInGroup: {
    marginBottom: 2, // Tighter spacing for grouped messages
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
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
    marginTop: 3,
    paddingHorizontal: 4,
  },
  metaContainerOwn: {
    justifyContent: 'flex-end',
  },
  metaContainerOther: {
    justifyContent: 'flex-start',
  },
  timestamp: {
    fontSize: 11,
    color: TIMESTAMP_COLOR,
    marginRight: 4,
  },
  deliveryStatus: {
    fontSize: 10,
    color: TIMESTAMP_COLOR,
    fontWeight: '500',
  },
  deliveryStatusFailed: {
    color: ERROR_COLOR || '#d32f2f',
  },
  deliveryStatusRead: {
    color: '#2196F3', // Blue for read messages (PR9)
    fontWeight: '600',
  },
  retryContainer: {
    alignItems: 'flex-end',
    marginTop: 4,
    paddingRight: 4,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: ERROR_COLOR || '#d32f2f',
  },
  retryText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  messageBlock: {
    maxWidth: '100%',
  },
  messageBlockOwn: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  messageBlockOther: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
});

// Memoize to prevent unnecessary re-renders
export default memo(MessageBubble);

