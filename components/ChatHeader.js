// ChatHeader Component - Custom Header for Chat Screens
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { PRIMARY_GREEN, STATUS_ONLINE, TEXT_SECONDARY } from '../constants/colors';
import { usePresence } from '../hooks/usePresence';
import { useTyping } from '../hooks/useTyping';
import { getInitials } from '../utils/avatarUtils';
import useUserStore from '../store/userStore';

/**
 * ChatHeader Component
 * Custom header for chat screens that displays:
 * - 1:1 chats: Avatar, name, online status, typing indicator
 * - Group chats: Group icon, name, member count, typing indicators
 * 
 * Tappable to navigate to member list
 * 
 * @param {Object} props
 * @param {Object} props.chat - Chat object from store
 * @param {string} props.currentUserID - Current user's ID
 * @param {Function} props.onPress - Callback when header is tapped
 * @param {string} props.chatId - Chat ID (for typing indicators)
 * @param {boolean} props.showAIButton - Whether to show the AI insights button
 * @param {Function} props.onAIPress - Callback when AI button is tapped
 */
/**
 * Get group initials from the first 2 members
 * @param {Array<string>} memberNames - Array of member display names
 * @returns {string} Combined initials (e.g. "JD" for John + David)
 */
function getGroupInitials(memberNames = []) {
  if (!memberNames || memberNames.length === 0) {
    return 'GR'; // Default for "Group"
  }
  
  // Get first letter of first 2 members
  const first = memberNames[0] ? getInitials(memberNames[0])[0] : 'G';
  const second = memberNames[1] ? getInitials(memberNames[1])[0] : 'R';
  
  return (first + second).toUpperCase();
}

export default function ChatHeader({ chat, currentUserID, onPress, chatId, showAIButton, onAIPress }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Determine if it's a group chat
  const isGroup = chat?.type === 'group';
  
  // For 1:1 chats, get the other user's info
  let otherUserID = null;
  let displayName = 'Chat';
  let memberCount = 0;
  let groupInitials = 'GR';
  
  if (!chat) {
    return null;
  }
  
  if (isGroup) {
    displayName = chat.groupName || 'Group Chat';
    memberCount = chat.memberIDs?.length || 0;
    groupInitials = getGroupInitials(chat.memberNames || []);
  } else {
    // 1:1 chat
    const otherUserIndex = chat.participantIDs?.[0] === currentUserID ? 1 : 0;
    otherUserID = chat.participantIDs?.[otherUserIndex];
    displayName = chat.participantNames?.[otherUserIndex] || 'Chat';
  }
  
  // Get presence data for 1:1 chats
  const { isOnline, lastSeen } = usePresence(isGroup ? null : otherUserID);
  
  // Get current user's display name for typing cleanup
  const currentUserName = useUserStore((state) => state.currentUser?.displayName);
  
  // Get typing indicators (for both 1:1 and group chats)
  const { typingUsers } = useTyping(chatId, currentUserID, currentUserName);
  
  // Format last seen time
  const getLastSeenText = () => {
    // If explicitly marked as online, show "Online"
    if (isOnline) return 'Online';
    
    // If no last seen timestamp, show "Offline"
    if (!lastSeen) return 'Offline';
    
    const now = Date.now();
    const diff = now - lastSeen;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    // Show relative time for offline users
    if (minutes < 1) return 'Last seen just now';
    if (minutes < 60) return `Last seen ${minutes}m ago`;
    if (hours < 24) return `Last seen ${hours}h ago`;
    if (days < 7) return `Last seen ${days}d ago`;
    return 'Offline';
  };
  
  // Get status text with typing indicator priority
  const getStatusText = () => {
    // PRIORITY 1: Show typing indicator (highest priority)
    if (typingUsers.length > 0) {
      if (typingUsers.length === 1) {
        return `${typingUsers[0].displayName} is typing...`;
      } else if (typingUsers.length === 2) {
        return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`;
      } else {
        return `${typingUsers.length} people are typing...`;
      }
    }
    
    // PRIORITY 2: Show member count for groups (no typing)
    if (isGroup) {
      return `${memberCount} members`;
    }
    
    // PRIORITY 3: Show last seen for 1:1 chats (no typing)
    return getLastSeenText();
  };
  
  const handleBackPress = () => {
    router.back();
  };
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Back button */}
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
        
        {/* Header content - tappable */}
        <TouchableOpacity
          style={styles.headerContent}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {/* Avatar or Group Icon */}
          <View style={styles.avatarContainer}>
            {isGroup ? (
              <View style={styles.groupAvatarWrapper}>
                <View style={styles.groupAvatar}>
                  <Text style={styles.groupInitials}>{groupInitials}</Text>
                </View>
              </View>
            ) : (
              <>
                <Avatar
                  displayName={displayName}
                  userID={otherUserID}
                  size={36}
                />
                {/* Online status indicator */}
                {isOnline && (
                  <View style={styles.onlineIndicator} />
                )}
              </>
            )}
          </View>
          
          {/* Name and status/count */}
          <View style={styles.textContainer}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.status} numberOfLines={1}>
              {getStatusText()}
            </Text>
          </View>
        </TouchableOpacity>
        
        {/* AI Insights button (optional) */}
        {showAIButton && (
          <TouchableOpacity
            onPress={onAIPress}
            style={styles.aiButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="sparkles"
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        )}
        
        {/* Right action - Info button */}
        <TouchableOpacity
          onPress={onPress}
          style={styles.infoButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isGroup ? 'people-outline' : 'information-circle-outline'}
            size={26}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PRIMARY_GREEN,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 56,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44, // Minimum touch target
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  groupAvatarWrapper: {
    width: 36,
    height: 36,
  },
  groupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: STATUS_ONLINE,
    borderWidth: 2,
    borderColor: '#fff', // White border to stand out against green header
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  status: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  aiButton: {
    padding: 4,
    marginLeft: 4,
  },
  infoButton: {
    padding: 4,
    marginLeft: 4,
  },
});

