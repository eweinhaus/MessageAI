// New Chat Screen - Contact Picker
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ContactListItem from '../../components/ContactListItem';
import GroupNameModal from '../../components/GroupNameModal';
import useUserStore from '../../store/userStore';
import useChatStore from '../../store/chatStore';
import {
  getAllUsers,
  checkIfChatExists,
  createOneOnOneChat,
  createGroupChat,
} from '../../services/firestore';
import { insertChat } from '../../db/messageDb';

/**
 * Contact Picker Screen
 * Allows users to browse registered users and create 1:1 or group chats
 */
export default function NewChatScreen() {
  const router = useRouter();
  const currentUser = useUserStore((state) => state.currentUser);
  const addChat = useChatStore((state) => state.addChat);

  const [allUsers, setAllUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Fetch all users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  /**
   * Fetch all users from Firestore, excluding current user
   */
  async function fetchUsers() {
    try {
      setIsLoading(true);
      const users = await getAllUsers();
      
      // Filter out current user
      const filteredUsers = users.filter(
        (user) => user.userID !== currentUser.userID
      );
      
      // Sort by display name
      filteredUsers.sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
      
      setAllUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to load contacts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Filter users based on search text
   */
  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) {
      return allUsers;
    }
    
    const searchLower = searchText.toLowerCase();
    return allUsers.filter((user) =>
      user.displayName.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
  }, [allUsers, searchText]);

  /**
   * Toggle user selection
   */
  function handleSelectUser(user) {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(user.userID)) {
        newSet.delete(user.userID);
      } else {
        newSet.add(user.userID);
      }
      return newSet;
    });
  }

  /**
   * Handle Next button press
   */
  async function handleNext() {
    const selectedCount = selectedUsers.size;
    
    if (selectedCount === 0) {
      return;
    }
    
    if (selectedCount === 1) {
      // Create or navigate to 1:1 chat
      await handleCreate1on1Chat();
    } else {
      // Show group name modal
      setShowGroupModal(true);
    }
  }

  /**
   * Create or get existing 1:1 chat
   */
  async function handleCreate1on1Chat() {
    try {
      setIsCreating(true);
      
      const otherUserID = Array.from(selectedUsers)[0];
      const otherUser = allUsers.find((u) => u.userID === otherUserID);
      
      if (!otherUser) {
        throw new Error('Selected user not found');
      }
      
      // Check if chat already exists
      const existingChatID = await checkIfChatExists(
        currentUser.userID,
        otherUserID
      );
      
      if (existingChatID) {
        console.log('1:1 chat already exists:', existingChatID);
        // Navigate to existing chat
        router.replace(`/chat/${existingChatID}`);
        return;
      }
      
      // Create new 1:1 chat
      const chatData = await createOneOnOneChat(
        currentUser.userID,
        currentUser.displayName,
        otherUser.userID,
        otherUser.displayName
      );
      
      // Add to local SQLite cache (optimistic)
      await insertChat({
        ...chatData,
        // Convert Firestore timestamps to numbers for SQLite
        lastMessageTimestamp: chatData.lastMessageTimestamp?.toMillis?.() || Date.now(),
        createdAt: chatData.createdAt?.toMillis?.() || Date.now(),
        updatedAt: chatData.updatedAt?.toMillis?.() || Date.now(),
      });
      
      // Add to Zustand store (optimistic UI)
      addChat(chatData);
      
      console.log('1:1 chat created:', chatData.chatID);
      
      // Navigate to new chat
      router.replace(`/chat/${chatData.chatID}`);
    } catch (error) {
      console.error('Error creating 1:1 chat:', error);
      Alert.alert('Error', 'Failed to create chat. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  /**
   * Create group chat with given name
   */
  async function handleCreateGroup(groupName) {
    try {
      setIsCreating(true);
      setShowGroupModal(false);
      
      // Get selected user objects
      const selectedUserObjects = allUsers.filter((u) =>
        selectedUsers.has(u.userID)
      );
      
      // Build member arrays (include current user)
      const memberIDs = [
        currentUser.userID,
        ...selectedUserObjects.map((u) => u.userID),
      ];
      const memberNames = [
        currentUser.displayName,
        ...selectedUserObjects.map((u) => u.displayName),
      ];
      
      // Create group chat
      const chatData = await createGroupChat(
        groupName,
        memberIDs,
        memberNames,
        currentUser.userID
      );
      
      // Add to local SQLite cache (optimistic)
      await insertChat({
        ...chatData,
        // Convert Firestore timestamps to numbers for SQLite
        lastMessageTimestamp: chatData.lastMessageTimestamp?.toMillis?.() || Date.now(),
        createdAt: chatData.createdAt?.toMillis?.() || Date.now(),
        updatedAt: chatData.updatedAt?.toMillis?.() || Date.now(),
      });
      
      // Add to Zustand store (optimistic UI)
      addChat(chatData);
      
      console.log('Group chat created:', chatData.chatID);
      
      // Navigate to new group chat
      router.replace(`/chat/${chatData.chatID}`);
    } catch (error) {
      console.error('Error creating group chat:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  /**
   * Render contact list item
   */
  function renderItem({ item }) {
    return (
      <ContactListItem
        user={item}
        isSelected={selectedUsers.has(item.userID)}
        onSelect={handleSelectUser}
      />
    );
  }

  /**
   * Render empty state
   */
  function renderEmptyState() {
    if (isLoading) {
      return null;
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>
          {searchText.trim() ? 'No contacts found' : 'No users available'}
        </Text>
        {searchText.trim() ? (
          <Text style={styles.emptySubtext}>Try a different search</Text>
        ) : (
          <Text style={styles.emptySubtext}>
            Sign up more users to start chatting
          </Text>
        )}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Chat',
          headerStyle: {
            backgroundColor: '#4CAF50',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={handleNext}
              disabled={selectedUsers.size === 0 || isCreating}
              style={styles.nextButton}
            >
              <Text
                style={[
                  styles.nextButtonText,
                  (selectedUsers.size === 0 || isCreating) && styles.nextButtonTextDisabled,
                ]}
              >
                {isCreating ? 'Creating...' : 'Next'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      
      <View style={styles.container}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Selection Info */}
        {selectedUsers.size > 0 && (
          <View style={styles.selectionInfo}>
            <Text style={styles.selectionText}>
              {selectedUsers.size} {selectedUsers.size === 1 ? 'contact' : 'contacts'} selected
            </Text>
            {selectedUsers.size >= 2 && (
              <Text style={styles.selectionHint}>
                Creating a group chat
              </Text>
            )}
          </View>
        )}
        
        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading contacts...</Text>
          </View>
        )}
        
        {/* Contact List */}
        {!isLoading && (
          <FlatList
            data={filteredUsers}
            renderItem={renderItem}
            keyExtractor={(item) => item.userID}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={
              filteredUsers.length === 0 && styles.emptyListContent
            }
          />
        )}
        
        {/* Group Name Modal */}
        <GroupNameModal
          visible={showGroupModal}
          memberCount={selectedUsers.size}
          onCancel={() => setShowGroupModal(false)}
          onCreate={handleCreateGroup}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  selectionInfo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#e8f5e9',
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
  },
  selectionHint: {
    fontSize: 12,
    color: '#558b2f',
    marginTop: 2,
  },
  nextButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  nextButtonTextDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
  },
});
