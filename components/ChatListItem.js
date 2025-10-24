// Chat List Item Component - Display chat in list
import React, { useState, memo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from './Avatar';
import { formatTimestamp, truncateText } from '../utils/timeUtils';
import useUserStore from '../store/userStore';
import { usePresence } from '../hooks/usePresence';

/**
 * Chat List Item Component
 * Displays a single chat in the chat list with:
 * - Avatar (other user for 1:1, group icon for groups)
 * - Chat name
 * - Last message preview
 * - Timestamp
 * - Unread badge (optional)
 * - Urgent badge (red "!" for priority chats)
 * - Online status indicator for 1:1 chats (optional)
 * 
 * @param {Object} props
 * @param {Object} props.chat - Chat object from store/database
 * @param {boolean} [props.isUnread] - Chat has unread messages
 * @param {boolean} [props.isUrgent] - Chat requires urgent attention
 * @param {number} [props.priorityScore] - Priority score (0-100) for debugging
 * @param {Object} [props.signals] - AI priority signals object
 */
function ChatListItem({ 
  chat, 
  isUnread = false, 
  isUrgent = false,
  priorityScore,
  signals 
}) {
  const router = useRouter();
  const { currentUser } = useUserStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef(null);
  
  if (!chat || !currentUser) return null;
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);
  
  // Determine if this is a 1:1 or group chat
  const isGroup = chat.type === 'group';
  
  // Get chat display name and avatar data
  let chatName = '';
  let avatarDisplayName = '';
  let avatarUserID = '';
  let otherUserID = null;
  
  if (isGroup) {
    // Group chat
    chatName = chat.groupName || 'Group Chat';
    avatarDisplayName = chatName;
    avatarUserID = chat.chatID; // Use chatID for consistent group avatar color
  } else {
    // 1:1 chat - show the other participant's info
    const participantIDs = chat.participantIDs || [];
    const participantNames = chat.participantNames || [];
    
    // Find the other participant (not current user)
    const otherParticipantIndex = participantIDs.findIndex(id => id !== currentUser.userID);
    
    if (otherParticipantIndex >= 0) {
      chatName = participantNames[otherParticipantIndex] || 'Unknown User';
      avatarDisplayName = chatName;
      avatarUserID = participantIDs[otherParticipantIndex];
      otherUserID = participantIDs[otherParticipantIndex]; // For presence tracking
    } else {
      chatName = 'Unknown Chat';
      avatarDisplayName = chatName;
      avatarUserID = chat.chatID;
    }
  }
  
  // Get presence data for 1:1 chats
  const { isOnline } = usePresence(isGroup ? null : otherUserID);
  
  // Format last message preview
  const lastMessagePreview = truncateText(chat.lastMessageText || 'No messages yet', 50);
  
  // Format timestamp
  const timestamp = formatTimestamp(chat.lastMessageTimestamp);
  
  // Handle tap - navigate to chat detail
  const handlePress = () => {
    router.push(`/chat/${chat.chatID}`);
  };
  
  // Handle long press - show priority tooltip
  const handleLongPress = () => {
    // Check if we have meaningful priority data
    const hasMeaningfulSignals = signals && Object.values(signals).some(v => v === true);
    const shouldShow = priorityScore !== undefined || hasMeaningfulSignals;
    
    if (shouldShow) {
      setShowTooltip(true);
      
      // Clear existing timer
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      
      // Set new timer for auto-close
      tooltipTimerRef.current = setTimeout(() => {
        setShowTooltip(false);
        tooltipTimerRef.current = null;
      }, 4000);
    }
  };
  
  // Handle manual close of tooltip
  const handleCloseTooltip = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setShowTooltip(false);
  };
  
  return (
    <>
      <TouchableOpacity 
        style={styles.container} 
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
      {/* Avatar with online indicator */}
      <View style={styles.avatarContainer}>
        <Avatar 
          displayName={avatarDisplayName}
          userID={avatarUserID}
          size={50}
        />
        {/* Online status indicator for 1:1 chats */}
        {!isGroup && isOnline && (
          <View style={styles.onlineIndicator} />
        )}
      </View>
      
      {/* Chat Content */}
      <View style={styles.content}>
        {/* Top row: Name, Urgent Badge, and Timestamp */}
        <View style={styles.topRow}>
          <Text 
            style={[
              styles.chatName, 
              isUnread && styles.chatNameUnread
            ]} 
            numberOfLines={1}
          >
            {chatName}
          </Text>
          
          {/* Urgent badge (red "!") */}
          {isUrgent && (
            <View 
              style={styles.urgentBadge}
              accessibilityLabel="Urgent chat"
              accessibilityRole="alert"
            >
              <Text style={styles.urgentText}>!</Text>
            </View>
          )}
          
          {timestamp && (
            <Text style={styles.timestamp}>{timestamp}</Text>
          )}
        </View>
        
        {/* Bottom row: Last message preview */}
        <View style={styles.bottomRow}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessagePreview}
          </Text>
          
          {/* TODO: Unread badge (future enhancement) */}
          {/* {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount}</Text>
            </View>
          )} */}
        </View>
      </View>
      
      {/* Blue dot indicator for unread messages (iMessage style) - RIGHT SIDE */}
      {isUnread && (
        <View style={styles.blueDot} />
      )}
    </TouchableOpacity>
    
    {/* Priority Tooltip Modal */}
    <Modal
      visible={showTooltip}
      transparent
      animationType="fade"
      onRequestClose={handleCloseTooltip}
    >
      <TouchableOpacity
        style={styles.tooltipOverlay}
        activeOpacity={1}
        onPress={handleCloseTooltip}
      >
        <View style={styles.tooltipCard}>
          <Text style={styles.tooltipTitle}>Priority Information</Text>
          
          {priorityScore !== undefined && (
            <Text style={styles.tooltipScore}>
              Priority Score: {priorityScore}/100
            </Text>
          )}
          
          {signals && (
            <View style={styles.signalsList}>
              <Text style={styles.signalsTitle}>AI Signals:</Text>
              {signals.hasUnansweredQuestion && (
                <View style={styles.signalItem}>
                  <Text style={styles.signalBullet}>•</Text>
                  <Text style={styles.signalText}>Unanswered question</Text>
                </View>
              )}
              {signals.hasActionItem && (
                <View style={styles.signalItem}>
                  <Text style={styles.signalBullet}>•</Text>
                  <Text style={styles.signalText}>Action item detected</Text>
                </View>
              )}
              {signals.hasUrgentKeywords && (
                <View style={styles.signalItem}>
                  <Text style={styles.signalBullet}>•</Text>
                  <Text style={styles.signalText}>Urgent keywords present</Text>
                </View>
              )}
              {signals.hasDecision && (
                <View style={styles.signalItem}>
                  <Text style={styles.signalBullet}>•</Text>
                  <Text style={styles.signalText}>Decision made</Text>
                </View>
              )}
              {signals.highMessageVelocity && (
                <View style={styles.signalItem}>
                  <Text style={styles.signalBullet}>•</Text>
                  <Text style={styles.signalText}>High activity</Text>
                </View>
              )}
            </View>
          )}
          
          <Text style={styles.tooltipHint}>Tap anywhere to close</Text>
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  blueDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF', // iOS blue color
    marginLeft: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  chatNameUnread: {
    fontWeight: 'bold',
    color: '#000',
  },
  urgentBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  urgentText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 8,
  },
  // For future use (PR 9)
  unreadBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Online status indicator
  onlineIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: '#fff',
  },
  
  // Priority Tooltip
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tooltipCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  tooltipScore: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 16,
  },
  signalsList: {
    marginTop: 8,
  },
  signalsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  signalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 8,
  },
  signalBullet: {
    fontSize: 14,
    color: '#007AFF',
    marginRight: 8,
    marginTop: 2,
  },
  signalText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  tooltipHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});

// Memoize to prevent unnecessary re-renders
export default memo(ChatListItem);
