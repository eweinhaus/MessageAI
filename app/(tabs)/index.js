// Home Screen - Chat List with Priority Ordering
import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import Icon from '../../components/Icon';
import colors from '../../constants/colors';
import { getAllChats, insertChat, getMessagesForChat } from '../../db/messageDb';
import { syncChatsFromFirestore } from '../../utils/syncManager';
import { registerListener, unregisterListener } from '../../utils/listenerManager';
import { analyzePriorities } from '../../services/aiService';
import {
  calculateLocalScore,
  shouldRunAI,
  calculateFinalScore,
  sanitizeAISignals,
  isUrgent,
  normalizeTimestamp,
} from '../../services/priorityService';

/**
 * Calculate unread count for a chat
 * Counts messages where readBy array doesn't include current user
 * @param {string} chatId - Chat ID
 * @param {string} currentUserId - Current user ID
 * @return {Promise<number>} Unread count
 */
async function calculateUnreadCount(chatId, currentUserId) {
  try {
    const messages = await getMessagesForChat(chatId, 100);
    if (!messages || messages.length === 0) return 0;
    
    // Count messages not read by current user
    // Note: readBy is already parsed as an array by getMessagesForChat()
    const unreadCount = messages.filter((msg) => {
      const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
      return !readBy.includes(currentUserId) && msg.senderID !== currentUserId;
    }).length;
    
    return unreadCount;
  } catch (error) {
    console.error(`[HomeScreen] Error calculating unread count for ${chatId}:`, error);
    return 0;
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const { currentUser } = useUserStore();
  const { chats, setChats, addChat, updateChat } = useChatStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Priority ordering state
  const [sortedChats, setSortedChats] = useState([]);
  const [isRefiningPriorities, setIsRefiningPriorities] = useState(false);
  const [lastPriorityRunAt, setLastPriorityRunAt] = useState(null);
  
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
  
  // Priority-based sorting with AI refinement
  useEffect(() => {
    if (!chats || chats.length === 0) {
      setSortedChats([]);
      return;
    }

    let cancelled = false;

    async function sortChatsWithPriority() {
      try {
        // Step 1: Calculate unread counts and local scores for all chats
        const chatsWithScores = await Promise.all(
          chats.map(async (chat) => {
            // Calculate unread count from messages
            const unreadCount = await calculateUnreadCount(
              chat.chatID,
              currentUser.userID
            );
            
            // Calculate local score (now with accurate unread count)
            const chatWithUnread = {...chat, unreadCount};
            const localScore = calculateLocalScore(chatWithUnread);
            
            return {
              ...chat,
              unreadCount,
              localScore,
              priorityScore: localScore, // Default to local score
              isUnread: unreadCount > 0,
              isUrgent: false,
            };
          })
        );

        // Step 2: Sort by local score as baseline (instant feedback)
        const baselineSorted = [...chatsWithScores].sort((a, b) => {
          // Primary: priority score
          if (b.localScore !== a.localScore) {
            return b.localScore - a.localScore;
          }
          // Secondary: unread count
          if (b.unreadCount !== a.unreadCount) {
            return (b.unreadCount || 0) - (a.unreadCount || 0);
          }
          // Tertiary: last message timestamp
          const aTime = normalizeTimestamp(a.lastMessageTimestamp);
          const bTime = normalizeTimestamp(b.lastMessageTimestamp);
          return bTime - aTime;
        });

        // Set baseline immediately for instant UI update
        if (!cancelled) {
          setSortedChats(baselineSorted);
        }

        // Step 3: Determine which chats need AI analysis
        const candidates = chatsWithScores.filter((chat) => 
          shouldRunAI({
            localScore: chat.localScore,
            unreadCount: chat.unreadCount || 0,
            lastPriorityRunAt,
            throttleMinutes: 5,
          })
        );

        // Early exit if no candidates or throttled
        if (candidates.length === 0) {
          console.log('[HomeScreen] No chats need AI priority analysis');
          return;
        }

        // Limit to 5 chats to keep latency manageable
        const limitedCandidates = candidates.slice(0, 5);
        
        console.log(
          `[HomeScreen] Running AI priority analysis on ` +
          `${limitedCandidates.length} chats`
        );

        // Step 4: Fetch recent messages for each candidate
        setIsRefiningPriorities(true);
        
        const chatsWithMessages = await Promise.all(
          limitedCandidates.map(async (chat) => {
            try {
              const messages = await getMessagesForChat(chat.chatID, 30);
              return {
                chatId: chat.chatID,
                messages: messages || [],
              };
            } catch (error) {
              console.error(
                `[HomeScreen] Error fetching messages for ${chat.chatID}:`,
                error
              );
              return {
                chatId: chat.chatID,
                messages: [],
              };
            }
          })
        );

        // Filter out chats with no messages
        const validChats = chatsWithMessages.filter(
          (c) => c.messages.length > 0
        );

        if (validChats.length === 0 || cancelled) {
          return;
        }

        // Step 5: Call AI batch analysis
        const aiResult = await analyzePriorities(null, {
          chats: validChats,
          messageCount: 30,
          forceRefresh: false,
        });

        if (cancelled) return;

        if (aiResult.success && aiResult.data && aiResult.data.chats) {
          // Step 6: Merge AI signals with local scores
          const refinedChats = baselineSorted.map((chat) => {
            const aiData = aiResult.data.chats.find(
              (c) => c.chatId === chat.chatID
            );
            
            if (aiData && aiData.signals) {
              const sanitized = sanitizeAISignals(aiData.signals);
              const finalScore = calculateFinalScore(
                chat.localScore,
                sanitized
              );
              
              return {
                ...chat,
                priorityScore: finalScore,
                aiSignals: sanitized,
                isUrgent: isUrgent(sanitized),
              };
            }
            
            return chat;
          });

          // Step 7: Re-sort with final scores
          const finalSorted = [...refinedChats].sort((a, b) => {
            // Primary: priority score
            if (b.priorityScore !== a.priorityScore) {
              return b.priorityScore - a.priorityScore;
            }
            // Secondary: unread count
            if (b.unreadCount !== a.unreadCount) {
              return (b.unreadCount || 0) - (a.unreadCount || 0);
            }
            // Tertiary: last message timestamp
            const aTime = normalizeTimestamp(a.lastMessageTimestamp);
            const bTime = normalizeTimestamp(b.lastMessageTimestamp);
            return bTime - aTime;
          });

          if (!cancelled) {
            setSortedChats(finalSorted);
            setLastPriorityRunAt(Date.now());
            console.log('[HomeScreen] Priority refinement complete');
          }
        } else {
          console.error(
            '[HomeScreen] AI priority analysis failed:',
            aiResult.message
          );
        }
      } catch (error) {
        console.error('[HomeScreen] Error in priority sorting:', error);
      } finally {
        if (!cancelled) {
          setIsRefiningPriorities(false);
        }
      }
    }

    sortChatsWithPriority();

    // Cleanup on unmount or deps change
    return () => {
      cancelled = true;
    };
  }, [chats, lastPriorityRunAt]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;
    
    setIsRefreshing(true);
    try {
      console.log('[HomeScreen] Manual refresh triggered');
      const syncedChats = await syncChatsFromFirestore(currentUser.userID);
      setChats(syncedChats);
      // Force priority refresh by resetting timestamp
      setLastPriorityRunAt(null);
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
    <ChatListItem 
      chat={item}
      isUnread={item.isUnread}
      isUrgent={item.isUrgent}
      priorityScore={item.priorityScore}
    />
  );
  
  // Render empty state
  const renderEmptyState = () => {
    if (isLoading) {
      return null; // Show loading spinner instead
    }
    
    return (
      <View style={styles.emptyState}>
        <Icon name="message" size="xxlarge" color={colors.mediumGray} style={styles.emptyStateIcon} />
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
        {/* Priority refinement indicator */}
        {isRefiningPriorities && (
          <View style={styles.refiningBanner}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.refiningText}>Refining priority order...</Text>
          </View>
        )}
        
        <FlatList
          data={sortedChats}
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
          contentContainerStyle={
            sortedChats.length === 0 ? styles.emptyContainer : null
          }
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
  refiningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#E8F5E9',
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  refiningText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
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
