// Chat List Item Component - Display chat in list
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from './Avatar';
import { formatTimestamp, truncateText } from '../utils/timeUtils';
import useUserStore from '../store/userStore';

/**
 * Chat List Item Component
 * Displays a single chat in the chat list with:
 * - Avatar (other user for 1:1, group icon for groups)
 * - Chat name
 * - Last message preview
 * - Timestamp
 * - Unread badge (optional)
 * - Online status indicator for 1:1 chats (optional)
 * 
 * @param {Object} props
 * @param {Object} props.chat - Chat object from store/database
 */
export default function ChatListItem({ chat }) {
  const router = useRouter();
  const { currentUser } = useUserStore();
  
  if (!chat || !currentUser) return null;
  
  // Determine if this is a 1:1 or group chat
  const isGroup = chat.type === 'group';
  
  // Get chat display name and avatar data
  let chatName = '';
  let avatarDisplayName = '';
  let avatarUserID = '';
  
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
    } else {
      chatName = 'Unknown Chat';
      avatarDisplayName = chatName;
      avatarUserID = chat.chatID;
    }
  }
  
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
      {/* Avatar */}
      <Avatar 
        displayName={avatarDisplayName}
        userID={avatarUserID}
        size={50}
        style={styles.avatar}
      />
      
      {/* Chat Content */}
      <View style={styles.content}>
        {/* Top row: Name and Timestamp */}
        <View style={styles.topRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {chatName}
          </Text>
          {timestamp && (
            <Text style={styles.timestamp}>{timestamp}</Text>
          )}
        </View>
        
        {/* Bottom row: Last message preview */}
        <View style={styles.bottomRow}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessagePreview}
          </Text>
          
          {/* TODO: Unread badge (PR 9) */}
          {/* {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount}</Text>
            </View>
          )} */}
        </View>
      </View>
      
      {/* TODO: Online status indicator for 1:1 chats (PR 10) */}
      {/* {!isGroup && isOnline && (
        <View style={styles.onlineIndicator} />
      )} */}
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
  avatar: {
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
  // For future use (PR 10)
  onlineIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    position: 'absolute',
    right: 16,
    top: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
});

