// Group Members Screen - View all members of a group chat
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import useChatStore from '../../../store/chatStore';
import useUserStore from '../../../store/userStore';
import Avatar from '../../../components/Avatar';
import { getUserProfile } from '../../../services/firestore';
import { 
  PRIMARY_GREEN, 
  BACKGROUND_PRIMARY, 
  TEXT_PRIMARY, 
  TEXT_SECONDARY,
  STATUS_ONLINE,
  STATUS_OFFLINE,
  BORDER_LIGHT,
} from '../../../constants/colors';

export default function GroupMembersScreen() {
  const { chatId } = useLocalSearchParams();
  const { getChatByID } = useChatStore();
  const currentUser = useUserStore((state) => state.currentUser);
  
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const chat = getChatByID(chatId);

  // Load member profiles
  useEffect(() => {
    const loadMembers = async () => {
      if (!chat || chat.type !== 'group') {
        setIsLoading(false);
        return;
      }

      try {
        // Get all member IDs
        const memberIDs = chat.memberIDs || [];
        
        // Fetch each member's profile from Firestore
        const memberPromises = memberIDs.map(async (memberID, index) => {
          try {
            const profile = await getUserProfile(memberID);
            return profile || {
              userID: memberID,
              displayName: chat.memberNames?.[index] || 'Unknown User',
              email: '',
              isOnline: false,
            };
          } catch (error) {
            console.error(`Error loading member ${memberID}:`, error);
            return {
              userID: memberID,
              displayName: chat.memberNames?.[index] || 'Unknown User',
              email: '',
              isOnline: false,
            };
          }
        });

        const loadedMembers = await Promise.all(memberPromises);
        
        // Sort: online first, then alphabetically, with current user at top
        const sortedMembers = loadedMembers.sort((a, b) => {
          // Current user always first
          if (a.userID === currentUser?.userID) return -1;
          if (b.userID === currentUser?.userID) return 1;
          
          // Then by online status
          if (a.isOnline && !b.isOnline) return -1;
          if (!a.isOnline && b.isOnline) return 1;
          
          // Then alphabetically
          return a.displayName.localeCompare(b.displayName);
        });

        setMembers(sortedMembers);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading members:', error);
        setIsLoading(false);
      }
    };

    loadMembers();
  }, [chatId, chat]);

  /**
   * Render a single member
   */
  const renderMember = ({ item }) => {
    const isCurrentUser = item.userID === currentUser?.userID;
    
    return (
      <View style={styles.memberItem}>
        <Avatar
          displayName={item.displayName}
          userID={item.userID}
          size={48}
        />
        
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName}>{item.displayName}</Text>
            {isCurrentUser && <Text style={styles.youLabel}>You</Text>}
          </View>
          <Text style={styles.memberEmail}>{item.email}</Text>
        </View>

        {/* Online status indicator (placeholder - full implementation in PR 10) */}
        <View
          style={[
            styles.statusDot,
            { backgroundColor: item.isOnline ? STATUS_ONLINE : STATUS_OFFLINE },
          ]}
        />
      </View>
    );
  };

  /**
   * Key extractor
   */
  const keyExtractor = (item) => item.userID;

  /**
   * Render loading state
   */
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Group Members',
            headerStyle: {
              backgroundColor: PRIMARY_GREEN,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={PRIMARY_GREEN} />
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      </>
    );
  }

  /**
   * Render empty state
   */
  if (members.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Group Members',
            headerStyle: {
              backgroundColor: PRIMARY_GREEN,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No members found</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `${chat?.groupName || 'Group'} (${members.length})`,
          headerStyle: {
            backgroundColor: PRIMARY_GREEN,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      />
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    paddingVertical: 8,
    backgroundColor: BACKGROUND_PRIMARY,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: BACKGROUND_PRIMARY,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  youLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_GREEN,
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BACKGROUND_PRIMARY,
  },
  separator: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
    marginLeft: 76, // Align with text, not avatar
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BACKGROUND_PRIMARY,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
});

