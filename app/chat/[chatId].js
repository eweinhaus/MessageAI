// Chat Detail Screen - Conversation View
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import useChatStore from '../../store/chatStore';
import useMessageStore from '../../store/messageStore';
import useUserStore from '../../store/userStore';
import MessageList from '../../components/MessageList';
import MessageInput from '../../components/MessageInput';
import ChatHeader from '../../components/ChatHeader';
import SummaryModal from '../../components/SummaryModal';
import ActionItemsModal from '../../components/ActionItemsModal';
import SmartSearchModal from '../../components/SmartSearchModal';
import { getMessagesForChat, insertMessage, updateMessage } from '../../db/messageDb';
import { sendMessage } from '../../services/messageService';
import { analyzePriorities, summarizeThread, extractActionItems, updateActionItemStatus, smartSearch } from '../../services/aiService';
import { Ionicons } from '@expo/vector-icons';
import { PRIMARY_GREEN } from '../../constants/colors';
import { registerListener, unregisterListener } from '../../utils/listenerManager';
import ErrorToast from '../../components/ErrorToast';

// Note: No debounce timers needed - priority analysis is now immediate

/**
 * Immediate priority analysis - no delay, no debounce
 * Analyzes ALL unanalyzed messages immediately when triggered
 * @param {string} chatId - Chat ID to analyze
 */
async function immediatePriorityAnalysis(chatId) {
  try {
    console.log(`[ChatDetail] Immediate priority analysis for chat ${chatId}`);
    await analyzePriorities(chatId, {
      messageCount: 1000, // Analyze up to 1000 messages (all unanalyzed ones)
      forceRefresh: true, // Always get fresh results to catch new messages
    });
    console.log(`[ChatDetail] Immediate priority analysis complete for ${chatId}`);
  } catch (error) {
    // Silently swallow errors (rate limits, network issues, etc.)
    // Don't disrupt user experience with background operations
    console.warn(`[ChatDetail] Priority analysis failed (silent):`, error);
  }
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const { chatId, messageId } = useLocalSearchParams(); // messageId from search navigation
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight() || 0;
  const topInset = Math.max(insets.top - headerHeight, 0);
  const bottomInset = insets.bottom || 0;
  const { getChatByID } = useChatStore();
  const { setMessagesForChat, addMessage, updateMessage: updateMessageInStore } = useMessageStore();
  const currentUser = useUserStore((state) => state.currentUser);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiLoading, setAILoading] = useState({});
  const [priorities, setPriorities] = useState({});
  const [error, setError] = useState(null);
  
  // Summary modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  
  // Action items modal state
  const [showActionItemsModal, setShowActionItemsModal] = useState(false);
  const [actionItemsData, setActionItemsData] = useState([]);
  const [actionItemsLoading, setActionItemsLoading] = useState(false);
  const [actionItemsError, setActionItemsError] = useState(null);
  const [actionItemsCached, setActionItemsCached] = useState(false);
  
  // Smart search modal state
  const [showSmartSearchModal, setShowSmartSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  
  // Ref for MessageList to enable jump-to-message
  const messageListRef = useRef(null);
  
  const chat = getChatByID(chatId);
  
  // Determine chat name and if it's a group
  let chatName = 'Chat';
  let isGroup = false;
  
  if (chat) {
    if (chat.type === 'group') {
      chatName = chat.groupName;
      isGroup = true;
    } else if (chat.type === '1:1' && chat.participantIDs) {
      // Find the other user's index
      const otherUserIndex = chat.participantIDs[0] === currentUser?.userID ? 1 : 0;
      chatName = chat.participantNames?.[otherUserIndex] || 'Chat';
    }
  }

  // Load messages from SQLite and set up Firestore listener
  useEffect(() => {
    if (!chatId || !currentUser) return;

    let unsubscribe;
    const listenerId = `chat-messages-${chatId}`;

    const setupChat = async () => {
      try {
        // 1. Load messages from SQLite (instant UI)
        console.log(`[ChatDetail] Loading messages for chat ${chatId} from SQLite`);
        const localMessages = await getMessagesForChat(chatId);
        setMessagesForChat(chatId, localMessages);
        setIsLoading(false);

        // 2. Trigger priority analysis on chat open to ensure recent messages are analyzed
        // This ensures red urgency badges appear for existing messages
        if (localMessages.length > 0) {
          console.log(`[ChatDetail] Chat opened with ${localMessages.length} messages, triggering immediate priority analysis`);
          immediatePriorityAnalysis(chatId);
        }

        // 3. Set up Firestore listener for real-time updates
        console.log(`[ChatDetail] Setting up Firestore listener for chat ${chatId}`);
        const messagesRef = collection(db, `chats/${chatId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        unsubscribe = onSnapshot(
          q,
          async (snapshot) => {
            console.log(`[ChatDetail] Received ${snapshot.docChanges().length} message changes`);
            
            for (const change of snapshot.docChanges()) {
              const messageData = {
                messageID: change.doc.id,
                ...change.doc.data(),
              };

              if (change.type === 'added' || change.type === 'modified') {
                // Normalize Firestore Timestamp to milliseconds if needed
                const normalized = {
                  ...messageData,
                  timestamp:
                    messageData?.timestamp?.toMillis?.() ?? messageData?.timestamp ?? Date.now(),
                  createdAt:
                    messageData?.createdAt?.toMillis?.() ?? messageData?.createdAt ?? Date.now(),
                  readBy: messageData?.readBy || [],
                };

                // DELIVERY STATUS TRACKING (PR9)
                // If this is someone else's message and it was just added or modified, mark as delivered
                if ((change.type === 'added' || change.type === 'modified') && normalized.senderID !== currentUser?.userID) {
                  // Update delivery status to 'delivered' for received messages
                  if (normalized.deliveryStatus === 'sent') {
                    console.log(`[ChatDetail] Marking message ${normalized.messageID} as delivered`);
                    
                    // Write back to Firestore so sender can see delivered status
                    try {
                      const messageRef = doc(db, `chats/${chatId}/messages`, normalized.messageID);
                      await updateDoc(messageRef, { deliveryStatus: 'delivered' });
                      
                      // Only update local state after successful Firestore write (fix race condition)
                      normalized.deliveryStatus = 'delivered';
                    } catch (error) {
                      console.error('[ChatDetail] Error updating delivery status in Firestore:', error);
                      // Keep original status if Firestore write fails to maintain consistency
                    }
                  }
                }

                // IMMEDIATE PRIORITY ANALYSIS
                // Trigger automatic priority detection for ALL new messages (sent or received)
                if (change.type === 'added') {
                  console.log(`[ChatDetail] New message detected, triggering immediate priority analysis`);
                  immediatePriorityAnalysis(chatId);
                }

                // Write to SQLite (wrapped in try-catch to prevent crashes)
                try {
                  await insertMessage({ ...normalized, syncStatus: 'synced' });
                } catch (error) {
                  console.error('[ChatDetail] Error inserting message to SQLite:', error);
                  // Continue anyway - message will still show in UI from Zustand
                }

                // Update Zustand store (UI updates automatically)
                addMessage(chatId, normalized);
              }
            }
          },
          (error) => {
            console.error('[ChatDetail] Firestore listener error:', error);
          }
        );

        // Register listener with manager for lifecycle handling
        if (unsubscribe) {
          registerListener(listenerId, unsubscribe, {
            collection: `chats/${chatId}/messages`,
            setupFn: setupChat, // Store setup function for resume
          });
          console.log(`[ChatDetail] Registered listener: ${listenerId}`);
        }
      } catch (error) {
        console.error('[ChatDetail] Error setting up chat:', error);
        setIsLoading(false);
      }
    };

    setupChat();

    // Cleanup: unsubscribe from Firestore listener on unmount
    return () => {
      console.log(`[ChatDetail] Cleaning up listener for chat ${chatId}`);
      unregisterListener(listenerId);
    };
  }, [chatId, currentUser]);

  // Set up Firestore listener for message priorities
  useEffect(() => {
    if (!chatId) return;

    const listenerId = `chat-priorities-${chatId}`;

    const prioritiesRef = collection(db, `chats/${chatId}/priorities`);
    const unsubscribe = onSnapshot(
      prioritiesRef,
      (snapshot) => {
        const newPriorities = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          newPriorities[doc.id] = {
            priority: data.priority,
            reason: data.reason,
            confidence: data.confidence,
          };
        });
        setPriorities(newPriorities);
      },
      (error) => {
        console.error('[ChatDetail] Priorities listener error:', error);
      }
    );

    registerListener(listenerId, unsubscribe, {
      collection: `chats/${chatId}/priorities`,
    });

    return () => {
      unregisterListener(listenerId);
    };
  }, [chatId]);

  // Set up Firestore listener for action items
  useEffect(() => {
    if (!chatId) return;

    const listenerId = `chat-actionItems-${chatId}`;

    const actionItemsRef = collection(db, `chats/${chatId}/actionItems`);
    const q = query(actionItemsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
          items.push({
            id: doc.id, // Include document ID
            ...doc.data(),
          });
        });
        console.log(`[ChatDetail] Loaded ${items.length} action items from Firestore`);
        setActionItemsData(items);
      },
      (error) => {
        console.error('[ChatDetail] Action items listener error:', error);
      }
    );

    registerListener(listenerId, unsubscribe, {
      collection: `chats/${chatId}/actionItems`,
    });

    return () => {
      unregisterListener(listenerId);
    };
  }, [chatId]);

  // Handle AI Priority Analysis (deprecated - AI button removed)
  const handleAnalyzePriorities = async () => {
    // This function is kept for backwards compatibility but AI button is removed
    console.warn('[ChatDetail] handleAnalyzePriorities called but AI button is disabled');
    setError({ type: 'info', message: 'Priority analysis runs automatically in the background' });
  };

  // Handle AI Thread Summarization
  const handleSummarizeThread = async () => {
    setShowAIPanel(false);
    setAILoading((prev) => ({ ...prev, summary: true }));
    setSummaryLoading(true);
    setSummaryError(null);
    setShowSummaryModal(true);

    try {
      const result = await summarizeThread(chatId, {
        messageCount: 50,
        forceRefresh: false,
      });

      if (result.success) {
        setSummaryData(result.data);
        setError({ 
          type: 'success', 
          message: result.cached ? 'Loaded summary from cache' : 'Summary generated!' 
        });
      } else {
        console.error('[ChatDetail] Summarization failed:', result.error);
        setSummaryError(result.message);
        setError({ type: 'error', message: result.message });
      }
    } catch (err) {
      console.error('[ChatDetail] Unexpected error:', err);
      const errorMsg = 'Something went wrong. Please try again.';
      setSummaryError(errorMsg);
      setError({ type: 'error', message: errorMsg });
    } finally {
      setSummaryLoading(false);
      setAILoading((prev) => ({ ...prev, summary: false }));
    }
  };

  // Handle Summary Refresh
  const handleRefreshSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const result = await summarizeThread(chatId, {
        messageCount: 50,
        forceRefresh: true, // Force fresh summary
      });

      if (result.success) {
        setSummaryData(result.data);
        setError({ type: 'success', message: 'Summary refreshed!' });
      } else {
        console.error('[ChatDetail] Summary refresh failed:', result.error);
        setSummaryError(result.message);
      }
    } catch (err) {
      console.error('[ChatDetail] Unexpected error during refresh:', err);
      const errorMsg = 'Failed to refresh summary. Please try again.';
      setSummaryError(errorMsg);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Handle Action Items Extraction
  const handleExtractActionItems = async () => {
    setShowAIPanel(false);
    setAILoading((prev) => ({ ...prev, actionItems: true }));
    setActionItemsLoading(true);
    setActionItemsError(null);
    setShowActionItemsModal(true);

    try {
      const result = await extractActionItems(chatId, {
        messageCount: 50,
        forceRefresh: false,
      });

      if (result.success) {
        // Don't set actionItemsData here - let the Firestore listener handle it
        setActionItemsCached(result.cached);
        const count = result.data.actionItems?.length || 0;
        setError({ 
          type: 'success', 
          message: result.cached ? 
            `Loaded ${count} action item${count !== 1 ? 's' : ''} from cache` : 
            `Found ${count} action item${count !== 1 ? 's' : ''}!`
        });
        
        // Firestore listener will update actionItemsData with document IDs
      } else {
        console.error('[ChatDetail] Action item extraction failed:', result.error);
        setActionItemsError(result.message);
        setError({ type: 'error', message: result.message });
      }
    } catch (err) {
      console.error('[ChatDetail] Unexpected error:', err);
      const errorMsg = 'Something went wrong. Please try again.';
      setActionItemsError(errorMsg);
      setError({ type: 'error', message: errorMsg });
    } finally {
      setActionItemsLoading(false);
      setAILoading((prev) => ({ ...prev, actionItems: false }));
    }
  };

  // Handle Action Items Refresh
  const handleRefreshActionItems = async () => {
    setActionItemsLoading(true);
    setActionItemsError(null);

    try {
      const result = await extractActionItems(chatId, {
        messageCount: 50,
        forceRefresh: true, // Force fresh extraction
      });

      if (result.success) {
        setActionItemsData(result.data.actionItems || []);
        setActionItemsCached(false);
        const count = result.data.actionItems?.length || 0;
        setError({ type: 'success', message: `Found ${count} action item${count !== 1 ? 's' : ''}!` });
      } else {
        console.error('[ChatDetail] Action items refresh failed:', result.error);
        setActionItemsError(result.message);
      }
    } catch (err) {
      console.error('[ChatDetail] Unexpected error during refresh:', err);
      const errorMsg = 'Failed to refresh action items. Please try again.';
      setActionItemsError(errorMsg);
    } finally {
      setActionItemsLoading(false);
    }
  };

  // Handle marking action item as complete
  const handleMarkActionItemComplete = async (itemId) => {
    const result = await updateActionItemStatus(chatId, itemId, 'completed');
    
    if (result.success) {
      // Firestore listener will automatically update local state
      setError({ type: 'success', message: 'Action item marked as complete!' });
    } else {
      setError({ type: 'error', message: 'Failed to update action item.' });
    }
  };

  // Handle marking action item as pending (reopen)
  const handleMarkActionItemPending = async (itemId) => {
    const result = await updateActionItemStatus(chatId, itemId, 'pending');
    
    if (result.success) {
      // Firestore listener will automatically update local state
      setError({ type: 'success', message: 'Action item reopened!' });
    } else {
      setError({ type: 'error', message: 'Failed to update action item.' });
    }
  };

  // Handle viewing the context message for an action item
  const handleViewActionItemMessage = (messageId) => {
    setShowActionItemsModal(false);
    
    // Jump to the message
    if (messageListRef.current) {
      messageListRef.current.scrollToMessage(messageId);
    } else {
      setError({ type: 'info', message: 'Message not found' });
    }
  };

  // Quick action: Mark action item complete from summary modal
  const handleMarkActionComplete = async (item) => {
    try {
      if (!item || !item.id) {
        console.warn('[ChatDetail] Action item missing ID:', item);
        return;
      }
      
      const result = await updateActionItemStatus(chatId, item.id, 'completed');
      
      if (result.success) {
        setError({ type: 'success', message: 'Action item marked as complete!' });
        // Refresh summary to reflect updated status
        setTimeout(() => handleRefreshSummary(), 500);
      } else {
        setError({ type: 'error', message: 'Failed to update action item.' });
      }
    } catch (error) {
      console.error('[ChatDetail] Error marking action complete:', error);
      setError({
        type: 'error',
        message: 'Failed to update action item',
      });
    }
  };

  // Quick action: Jump to chat/message from summary modal
  const handleJumpToChatFromSummary = async (item) => {
    try {
      setShowSummaryModal(false);

      // If item has messageId, attempt to scroll to it
      if (item.messageId || item.sourceMessageId) {
        const messageId = item.messageId || item.sourceMessageId;
        console.log('[ChatDetail] Jump to message:', messageId);

        // Jump to the message in current chat
        if (messageListRef.current) {
          messageListRef.current.scrollToMessage(messageId);
        } else {
          setError({ type: 'info', message: 'Message not found' });
        }
      }

      // If from different chat, navigate
      if (item.chatId && item.chatId !== chatId) {
        router.push(`/chat/${item.chatId}`);
      }
    } catch (error) {
      console.error('[ChatDetail] Error jumping to message:', error);
    }
  };

  // Handle Smart Search
  const handleSmartSearch = () => {
    setShowAIPanel(false);
    setShowSmartSearchModal(true);
    setSearchResults([]);
    setSearchError(null);
  };

  // Handle search query submission
  const handleSearchSubmit = async (query) => {
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const result = await smartSearch(chatId, query, {
        limit: 10,
      });

      if (result.success) {
        setSearchResults(result.data.results || []);
        const count = result.data.results?.length || 0;
        if (count === 0) {
          setSearchError('No results found. Try different keywords.');
        }
      } else {
        console.error('[ChatDetail] Smart search failed:', result.error);
        setSearchError(result.message || 'Search failed. Please try again.');
      }
    } catch (err) {
      console.error('[ChatDetail] Unexpected search error:', err);
      setSearchError('Something went wrong. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle jump to message from search results
  const handleJumpToMessage = (messageId) => {
    setShowSmartSearchModal(false);
    
    // Jump to the message
    if (messageListRef.current) {
      messageListRef.current.scrollToMessage(messageId);
    } else {
      setError({ type: 'info', message: 'Message not found' });
    }
  };

  // Placeholder handler for decision tracking
  const handleTrackDecisions = () => {
    setShowAIPanel(false);
    setError({ type: 'info', message: 'Decision tracking coming soon!' });
  };

  // Navigate to member list
  const handleHeaderPress = () => {
    // For groups, navigate to member list
    if (isGroup) {
      router.push(`/chat/members/${chatId}`);
    } else {
      // For 1:1 chats, show user profile placeholder
      // Future: Navigate to dedicated user profile screen
      setError({ 
        type: 'info', 
        message: 'User profiles coming soon!' 
      });
    }
  };

  // Handle sending a message
  const handleSendMessage = async (text) => {
    if (!currentUser) return;
    
    try {
      await sendMessage(
        chatId,
        currentUser.userID,
        currentUser.displayName,
        text
      );
    } catch (error) {
      console.error('[ChatDetail] Error sending message:', error);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // Hide default header, use custom ChatHeader
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {/* Custom Header with AI Button */}
        <ChatHeader
          chat={chat}
          currentUserID={currentUser?.userID}
          onPress={handleHeaderPress}
          chatId={chatId}
          showAIButton={false}
          onAIPress={() => setShowAIPanel(true)}
          aiLoading={aiLoading}
        />
        
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.container}>
            <MessageList
              ref={messageListRef}
              chatID={chatId}
              isGroup={isGroup}
              isLoading={isLoading}
              topInset={0}
              bottomInset={bottomInset}
              priorities={priorities}
              initialMessageId={messageId} // Highlight specific message after scrolling to bottom
            />
            <MessageInput
              chatID={chatId}
              onSend={handleSendMessage}
              currentUserId={currentUser?.userID}
              currentUserName={currentUser?.displayName}
            />
          </View>
        </KeyboardAvoidingView>

        {/* AI Insights Panel - REMOVED */}

        {/* Summary Modal */}
        <SummaryModal
          visible={showSummaryModal}
          onClose={() => setShowSummaryModal(false)}
          summary={summaryData}
          loading={summaryLoading}
          error={summaryError}
          onRefresh={handleRefreshSummary}
          onMarkComplete={handleMarkActionComplete}
          onJumpToChat={handleJumpToChatFromSummary}
        />

        {/* Action Items Modal */}
        <ActionItemsModal
          visible={showActionItemsModal}
          onClose={() => setShowActionItemsModal(false)}
          actionItems={actionItemsData}
          loading={actionItemsLoading}
          error={actionItemsError}
          onRefresh={handleRefreshActionItems}
          onViewMessage={handleViewActionItemMessage}
          onMarkComplete={handleMarkActionItemComplete}
          onMarkPending={handleMarkActionItemPending}
          cached={actionItemsCached}
        />

        {/* Smart Search Modal */}
        <SmartSearchModal
          visible={showSmartSearchModal}
          onClose={() => setShowSmartSearchModal(false)}
          onSearch={handleSearchSubmit}
          onJumpToMessage={handleJumpToMessage}
          loading={searchLoading}
          results={searchResults}
          error={searchError}
        />

        {/* Error Toast */}
        {error && (
          <ErrorToast
            message={error.message}
            type={error.type}
            onDismiss={() => setError(null)}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
});
