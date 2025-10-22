// MessageBubble Component - Individual message display
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatMessageTime } from '../utils/timeUtils';
import { retryFailedMessage } from '../services/messageService';
import Avatar from './Avatar';
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
 * @param {string} props.priority - Priority level ("urgent" or "normal")
 * @param {string} props.priorityReason - Reason for priority
 * @param {number} props.priorityConfidence - Confidence score (0-1)
 */
function MessageBubble({ 
  message, 
  isOwn, 
  showSenderInfo = false, 
  isGrouped = false, 
  isLastInGroup = true,
  priority,
  priorityReason,
  priorityConfidence,
}) {
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
  // Avatar shows on LAST message in group (iMessage style), name shows on FIRST
  const shouldShowAvatar = showSenderInfo && isLastInGroup && !isOwn;
  const shouldShowName = showSenderInfo && !isGrouped && !isOwn;

  // Handle retry button press
  const handleRetry = async () => {
    await retryFailedMessage(messageID, chatID);
  };

  return (
    <View style={[
      styles.container, 
      isOwn ? styles.containerOwn : styles.containerOther,
      !isGrouped && styles.containerFirstInGroup // Add spacing when starting new group
    ]}>
      {/* Avatar for other users in groups - show on LAST message in sequence */}
      {shouldShowAvatar && (
        <View style={styles.avatarWrapper}>
          <Avatar
            displayName={senderName || 'Unknown'}
            userID={senderID}
            size={32}
          />
        </View>
      )}
      
      {/* Spacer to align grouped messages when no avatar shown */}
      {!shouldShowAvatar && showSenderInfo && !isOwn && (
        <View style={styles.avatarSpacer} />
      )}
      
      {/* Message content */}
      <View
        style={[
          styles.messageContent,
          isOwn ? styles.messageContentOwn : styles.messageContentOther,
        ]}
      >
        {/* Sender name for other users in groups - show on FIRST message */}
        {shouldShowName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        
        {/* Message bubble */}
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            !isLastInGroup && styles.bubbleInGroup,
            isOwn ? styles.bubbleAlignOwn : styles.bubbleAlignOther,
            priority === 'urgent' && styles.urgentBubble,
          ]}
        >
          <Text style={[
            styles.messageText, 
            isOwn ? styles.messageTextOwn : styles.messageTextOther,
            priority === 'urgent' && styles.urgentText,
          ]}>
            {text?.trim() || text}
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
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 12,
    alignItems: 'center', // Changed from flex-end to center for inline alignment
  },
  containerOwn: {
    justifyContent: 'flex-end',
  },
  containerOther: {
    justifyContent: 'flex-start',
  },
  containerFirstInGroup: {
    marginTop: 12, // Extra spacing when starting a new message group
  },
  avatarWrapper: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  avatarSpacer: {
    width: 32,
    marginRight: 8,
  },
  messageContent: {
    maxWidth: '75%',
  },
  messageContentOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageContentOther: {
    alignSelf: 'flex-start',
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
    marginBottom: 1, // Tighter spacing for grouped messages (iMessage-style)
  },
  bubbleAlignOwn: {
    alignSelf: 'flex-end',
  },
  bubbleAlignOther: {
    alignSelf: 'flex-start',
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
  urgentBubble: {
    backgroundColor: '#DC2626', // Red-600 for urgent messages
  },
  urgentText: {
    color: '#FFFFFF', // White text for contrast on red background
    fontWeight: '600',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginHorizontal: 4,
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
});

// Memoize to prevent unnecessary re-renders
export default memo(MessageBubble);

