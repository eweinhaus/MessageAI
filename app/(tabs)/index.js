// Home Screen - Chat List
import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  RefreshControl, 
  ActivityIndicator,
  TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import useUserStore from '../../store/userStore';
import useChatStore from '../../store/chatStore';
import ChatListItem from '../../components/ChatListItem';
import { getAllChats, insertChat } from '../../db/messageDb';
import { syncChatsFromFirestore } from '../../utils/syncManager';
import { registerListener, unregisterListener } from '../../utils/listenerManager';

export default function HomeScreen() {
  const router = useRouter();
  const { currentUser } = useUserStore();
  const { chats, setChats, addChat, updateChat } = useChatStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Load chats from SQLite on mount (instant display)
  useEffect(() => {
    async function loadChatsFromCache() {
      if (!currentUser) return;
      
      try {
        console.log('[HomeScreen] Loading chats from SQLite cache...');
        const cachedChats = await getAllChats();
        setChats(cachedChats);
        console.log(`[HomeScreen] Loaded ${cachedChats.length} chats from cache`);
      } catch (error) {
        console.error('[HomeScreen] Error loading chats from cache:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadChatsFromCache();
  }, [currentUser]);
  
  // Set up Firestore real-time listener
  useEffect(() => {
    if (!currentUser) return;
    
    const listenerId1 = `home-chats-participants-${currentUser.userID}`;
    const listenerId2 = `home-chats-members-${currentUser.userID}`;
    
    const setupListeners = () => {
      console.log('[HomeScreen] Setting up Firestore listeners...');
      
      // Query chats where user is a participant (1:1 chats)
      const chatsQuery1 = query(
        collection(db, 'chats'),
        where('participantIDs', 'array-contains', currentUser.userID)
      );
      
      // Query chats where user is a member (group chats)
      const chatsQuery2 = query(
        collection(db, 'chats'),
        where('memberIDs', 'array-contains', currentUser.userID)
      );
      
      // Subscribe to both queries
      const unsubscribe1 = onSnapshot(
        chatsQuery1,
        (snapshot) => {
          handleSnapshot(snapshot);
        },
        (error) => {
          console.error('[HomeScreen] Firestore listener error (query 1):', error);
        }
      );
      
      const unsubscribe2 = onSnapshot(
        chatsQuery2,
        (snapshot) => {
          handleSnapshot(snapshot);
        },
        (error) => {
          console.error('[HomeScreen] Firestore listener error (query 2):', error);
        }
      );
      
      // Register listeners with manager
      registerListener(listenerId1, unsubscribe1, {
        collection: 'chats',
        setupFn: setupListeners,
      });
      registerListener(listenerId2, unsubscribe2, {
        collection: 'chats',
        setupFn: setupListeners,
      });
      
      console.log('[HomeScreen] Registered both chat listeners');
      
      return () => {
        unsubscribe1();
        unsubscribe2();
      };
    };
    
    setupListeners();
    
    // Cleanup listeners on unmount
    return () => {
      console.log('[HomeScreen] Cleaning up Firestore listeners');
      unregisterListener(listenerId1);
      unregisterListener(listenerId2);
    };
  }, [currentUser]);
  
  // Handle Firestore snapshot updates
  const handleSnapshot = useCallback(async (snapshot) => {
    try {
      snapshot.docChanges().forEach(async (change) => {
        const chatData = { ...change.doc.data(), chatID: change.doc.id };
        
        // Convert Firestore timestamps to milliseconds
        const chat = {
          chatID: chatData.chatID,
          type: chatData.type,
          participantIDs: chatData.participantIDs || [],
          participantNames: chatData.participantNames || [],
          memberIDs: chatData.memberIDs || [],
          memberNames: chatData.memberNames || [],
          groupName: chatData.groupName || null,
          createdBy: chatData.createdBy || null,
          lastMessageText: chatData.lastMessageText || null,
          lastMessageTimestamp: chatData.lastMessageTimestamp?.toMillis?.() || chatData.lastMessageTimestamp || null,
          lastMessageSenderID: chatData.lastMessageSenderID || null,
          createdAt: chatData.createdAt?.toMillis?.() || chatData.createdAt || Date.now(),
          updatedAt: chatData.updatedAt?.toMillis?.() || chatData.updatedAt || Date.now(),
        };
        
        if (change.type === 'added' || change.type === 'modified') {
          console.log(`[HomeScreen] Chat ${change.type}: ${chat.chatID}`);
          
          // Write to SQLite
          await insertChat(chat);
          
          // Update Zustand store
          if (change.type === 'added') {
            addChat(chat);
          } else {
            updateChat(chat.chatID, chat);
          }
        } else if (change.type === 'removed') {
          console.log(`[HomeScreen] Chat removed: ${chat.chatID}`);
          // TODO: Handle chat deletion (future feature)
        }
      });
    } catch (error) {
      console.error('[HomeScreen] Error handling snapshot:', error);
    }
  }, [addChat, updateChat]);
  
  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;
    
    setIsRefreshing(true);
    try {
      console.log('[HomeScreen] Manual refresh triggered');
      const syncedChats = await syncChatsFromFirestore(currentUser.userID);
      setChats(syncedChats);
      console.log('[HomeScreen] Refresh complete');
    } catch (error) {
      console.error('[HomeScreen] Error refreshing chats:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser, setChats]);
  
  // Navigate to new chat screen
  const handleNewChat = () => {
    router.push('/contacts/newChat');
  };
  
  // Render chat list item
  const renderChatItem = ({ item }) => (
    <ChatListItem chat={item} />
  );
  
  // Render empty state
  const renderEmptyState = () => {
    if (isLoading) {
      return null; // Show loading spinner instead
    }
    
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateIcon}>💬</Text>
        <Text style={styles.emptyStateTitle}>No conversations yet</Text>
        <Text style={styles.emptyStateText}>
          Start a conversation by tapping the + button above
        </Text>
        <TouchableOpacity 
          style={styles.emptyStateButton}
          onPress={handleNewChat}
        >
          <Text style={styles.emptyStateButtonText}>Start Chatting</Text>
        </TouchableOpacity>
      </View>
    );
  };
  
  // Show loading spinner on initial load
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.chatID}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#4CAF50']}
            tintColor="#4CAF50"
          />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={chats.length === 0 ? styles.emptyContainer : null}
      />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
