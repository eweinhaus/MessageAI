// Chat List Item Component - Display chat in list
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
 */
export default function ChatListItem({ 
  chat, 
  isUnread = false, 
  isUrgent = false,
  priorityScore 
}) {
  const router = useRouter();
  const { currentUser } = useUserStore();
  
  if (!chat || !currentUser) return null;
  
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
  
  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={handlePress}
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
    </TouchableOpacity>
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
});

