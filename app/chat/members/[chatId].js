// Chat Members Screen - View all members of a chat (1:1 or group)
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../../config/firebaseConfig';
import useChatStore from '../../../store/chatStore';
import useUserStore from '../../../store/userStore';
import Avatar from '../../../components/Avatar';
import { getUserProfile } from '../../../services/firestore';
import { isPresenceStale } from '../../../services/presenceService';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const chat = getChatByID(chatId);

  // Load member profiles and set up real-time presence listeners
  useEffect(() => {
    if (!chat || !currentUser) {
      setIsLoading(false);
      return;
    }

    const loadMembers = async () => {
      try {
        let memberIDs = [];
        let memberNames = [];

        // Get member IDs based on chat type
        if (chat.type === 'group') {
          memberIDs = chat.memberIDs || [];
          memberNames = chat.memberNames || [];
        } else if (chat.type === '1:1') {
          // For 1:1 chats, show the other user (not self)
          memberIDs = (chat.participantIDs || []).filter(id => id !== currentUser.userID);
          memberNames = chat.participantNames || [];
          // Get the other user's name
          const otherUserIndex = chat.participantIDs[0] === currentUser.userID ? 1 : 0;
          memberNames = [chat.participantNames?.[otherUserIndex] || 'Unknown User'];
        }

        if (memberIDs.length === 0) {
          setIsLoading(false);
          return;
        }
        
        // Fetch initial member profiles
        const memberPromises = memberIDs.map(async (memberID, index) => {
          try {
            const profile = await getUserProfile(memberID);
            
            // If profile exists, ensure displayName is present
            if (profile) {
              return {
                ...profile,
                // Use profile displayName, fallback to memberNames, then email, then Unknown
                displayName: profile.displayName || memberNames[index] || profile.email || 'Unknown User',
                // Ensure userID is present
                userID: profile.userID || memberID,
                // Convert timestamp if needed
                lastSeenTimestamp: profile.lastSeenTimestamp?.toMillis?.() || profile.lastSeenTimestamp || null,
              };
            }
            
            // If no profile, create fallback
            console.warn(`[Members] No profile found for user ${memberID}, using fallback`);
            return {
              userID: memberID,
              displayName: memberNames[index] || memberID,
              email: '',
              isOnline: false,
              lastSeenTimestamp: null,
            };
          } catch (error) {
            console.error(`Error loading member ${memberID}:`, error);
            return {
              userID: memberID,
              displayName: memberNames[index] || memberID,
              email: '',
              isOnline: false,
              lastSeenTimestamp: null,
            };
          }
        });

        const loadedMembers = await Promise.all(memberPromises);
        
        // Sort members: online first, then alphabetical
        const sortedMembers = loadedMembers.sort((a, b) => {
          // If both have same online status, sort alphabetically
          if (a.isOnline === b.isOnline) {
            return (a.displayName || '').localeCompare(b.displayName || '');
          }
          // Otherwise, online members come first
          return a.isOnline ? -1 : 1;
        });
        
        setMembers(sortedMembers);
        setIsLoading(false);

        // Set up real-time presence listeners for each member
        const unsubscribers = memberIDs.map((memberID) => {
          const userRef = doc(db, 'users', memberID);
          
          return onSnapshot(
            userRef,
            (docSnap) => {
              if (docSnap.exists()) {
                const userData = docSnap.data();
                let isOnline = userData.isOnline || false;
                const lastSeenTimestamp = userData.lastSeenTimestamp?.toMillis?.() || null;
                
                // Apply staleness detection - if marked online but timestamp is stale, treat as offline
                if (isOnline && isPresenceStale(lastSeenTimestamp)) {
                  console.log(`[Members] User ${memberID} marked online but presence is stale, treating as offline`);
                  isOnline = false;
                }
                
                // Update this member's presence in state and re-sort
                setMembers((prevMembers) => {
                  const updatedMembers = prevMembers.map((member) => 
                    member.userID === memberID
                      ? {
                          ...member,
                          isOnline,
                          lastSeenTimestamp,
                        }
                      : member
                  );
                  
                  // Re-sort: online first, then alphabetical
                  return updatedMembers.sort((a, b) => {
                    if (a.isOnline === b.isOnline) {
                      return (a.displayName || '').localeCompare(b.displayName || '');
                    }
                    return a.isOnline ? -1 : 1;
                  });
                });
              }
            },
            (error) => {
              console.error(`Error in presence listener for ${memberID}:`, error);
            }
          );
        });

        // Cleanup: unsubscribe from all listeners
        return () => {
          console.log('[Members] Cleaning up presence listeners');
          unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
      } catch (error) {
        console.error('Error loading members:', error);
        setIsLoading(false);
      }
    };

    const cleanup = loadMembers();
    
    // Return cleanup function
    return () => {
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then((cleanupFn) => {
          if (cleanupFn) cleanupFn();
        });
      }
    };
  }, [chatId, chat, currentUser]);

  /**
   * Format last seen time for offline users
   */
  const getLastSeenText = (lastSeen) => {
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

  /**
   * Render a single member
   */
  const renderMember = ({ item }) => {
    const isCurrentUser = item.userID === currentUser?.userID;
    const statusText = item.isOnline ? 'Online' : getLastSeenText(item.lastSeenTimestamp);
    
    return (
      <View style={styles.memberItem}>
        <View style={styles.avatarContainer}>
          <Avatar
            displayName={item.displayName}
            userID={item.userID}
            size={48}
          />
          {/* Online/Offline status indicator */}
          <View style={[
            styles.statusIndicator,
            item.isOnline ? styles.onlineIndicator : styles.offlineIndicator
          ]} />
        </View>
        
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName}>{item.displayName}</Text>
            {isCurrentUser && <Text style={styles.youLabel}>You</Text>}
          </View>
          <Text style={[
            styles.statusText,
            item.isOnline && styles.statusTextOnline
          ]}>
            {statusText}
          </Text>
        </View>
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
            headerShown: false,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          {/* Custom Header */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>
              <View style={styles.titleContainer}>
                <Text style={styles.headerTitle}>Loading...</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
          </View>
          
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={PRIMARY_GREEN} />
            <Text style={styles.loadingText}>Loading members...</Text>
          </View>
        </SafeAreaView>
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
            headerShown: false,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          {/* Custom Header */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>
              <View style={styles.titleContainer}>
                <Text style={styles.headerTitle}>Chat Info</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
          </View>
          
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No members found</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Determine screen title
  const screenTitle = chat?.type === 'group' 
    ? chat.groupName || 'Group'
    : 'Chat Info';

  const memberCount = members.length;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // Hide default header, use custom
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {/* Custom Header */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerContent}>
            {/* Back button */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>
            
            {/* Title */}
            <View style={styles.titleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {screenTitle}
              </Text>
              {chat?.type === 'group' && (
                <Text style={styles.headerSubtitle}>
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </Text>
              )}
            </View>
            
            {/* Spacer for balance */}
            <View style={styles.headerSpacer} />
          </View>
        </View>

        {/* Member List */}
        <FlatList
          data={members}
          renderItem={renderMember}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContainer}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND_PRIMARY,
  },
  header: {
    backgroundColor: PRIMARY_GREEN,
  },
  headerContent: {
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
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  headerSpacer: {
    width: 36, // Same width as back button for balance
  },
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
  avatarContainer: {
    position: 'relative',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BACKGROUND_PRIMARY,
  },
  onlineIndicator: {
    backgroundColor: STATUS_ONLINE,
  },
  offlineIndicator: {
    backgroundColor: STATUS_OFFLINE,
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
  statusText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  statusTextOnline: {
    color: STATUS_ONLINE,
    fontWeight: '500',
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

