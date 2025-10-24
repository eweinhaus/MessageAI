// MessageList Component - Scrollable list of messages
import React, { useRef, useEffect, useMemo, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MessageBubble from './MessageBubble';
import Icon from './Icon';
import useMessageStore from '../store/messageStore';
import useUserStore from '../store/userStore';
import { markMessageAsRead } from '../services/firestore';
import { BACKGROUND_CHAT, TEXT_SECONDARY } from '../constants/colors';

/**
 * MessageList Component
 * Displays all messages for a chat in a scrollable list
 * 
 * @param {Object} props
 * @param {string} props.chatID - Chat ID to display messages for
 * @param {boolean} props.isGroup - Whether this is a group chat (shows sender info)
 * @param {boolean} props.isLoading - Loading state
 * @param {Object} props.priorities - Message priorities (messageId -> priority data)
 */
const MessageList = forwardRef(({
  chatID,
  isGroup = false,
  isLoading = false,
  topInset = 0,
  bottomInset = 0,
  priorities = {},
  initialMessageId = null, // Optional: highlight specific message after scrolling to bottom
}, ref) => {
  const flatListRef = useRef(null);
  const highlightTimeoutRef = useRef(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  
  // Use a stable selector to avoid infinite loops
  const messages = useMessageStore(
    (state) => state.messagesByChat[chatID],
    (a, b) => {
      // Custom equality check - only re-render if messages actually changed
      if (!a && !b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a === b;
    }
  ) || [];
  const markAsRead = useMessageStore((state) => state.markAsRead);
  const currentUser = useUserStore((state) => state.currentUser);
  
  // Track which messages have been marked as read to avoid duplicate writes
  const [markedAsRead, setMarkedAsRead] = useState(new Set());
  
  // Track if we've done initial scroll - use ref to avoid stale state
  const hasInitialScrolledRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const pendingMessageIdRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const scrollRetryTimerRef = useRef(null);
  const isInitialLoadRef = useRef(true); // Track if this is the initial load

  // Reset initial scroll flag when chatID changes
  useEffect(() => {
    console.log('[MessageList] Chat changed, resetting scroll state for chatID:', chatID);
    hasInitialScrolledRef.current = false;
    isInitialLoadRef.current = true; // Reset initial load flag
    setHighlightedMessageId(null);
    shouldAutoScrollRef.current = true;
    pendingMessageIdRef.current = initialMessageId || null;
    isNearBottomRef.current = true;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    if (scrollRetryTimerRef.current) {
      clearTimeout(scrollRetryTimerRef.current);
      scrollRetryTimerRef.current = null;
    }
  }, [chatID, initialMessageId]);

  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Expose scrollToMessage method via ref
  useImperativeHandle(ref, () => ({
    scrollToMessage(messageId) {
      const index = messages.findIndex(m => m.messageID === messageId);
      if (index !== -1 && flatListRef.current) {
        try {
          // Scroll to the message
          flatListRef.current.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5, // Center the message
          });
          
          // Highlight the message
          setHighlightedMessageId(messageId);
          
          // Clear any existing timeout
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
          }
          
          // Clear highlight after 2 seconds
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
            highlightTimeoutRef.current = null;
          }, 2000);
        } catch (error) {
          console.warn('[MessageList] scrollToIndex failed, falling back to scrollToOffset:', error);
          // Fallback: estimate offset (60px per message)
          const offset = index * 60;
          flatListRef.current?.scrollToOffset({ offset, animated: true });
          setHighlightedMessageId(messageId);
          
          // Clear any existing timeout
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
          }
          
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
            highlightTimeoutRef.current = null;
          }, 2000);
        }
      } else {
        console.warn('[MessageList] Message not found:', messageId);
      }
    }
  }), [messages]);

  // Helper function to scroll to bottom with calculated offset
  const scrollToCalculatedBottom = useCallback(() => {
    if (!flatListRef.current) return;

    const contentHeight = messages.length * 60;
    const layoutHeight = 530;
    const exactOffset = Math.max(0, contentHeight - layoutHeight);

    console.log('[MessageList] Scrolling to calculated bottom:', {
      messageCount: messages.length,
      contentHeight,
      layoutHeight,
      exactOffset
    });

    flatListRef.current.scrollToOffset({
      offset: exactOffset,
      animated: false
    });
  }, [messages.length]);

  const scrollToSpecificMessage = useCallback((messageId, attempt = 0) => {
    if (!flatListRef.current) {
      return;
    }
    const index = messages.findIndex((m) => m.messageID === messageId);
    if (index === -1) {
      pendingMessageIdRef.current = messageId;
      return;
    }
    try {
      flatListRef.current.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.5,
      });
      setHighlightedMessageId(messageId);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimeoutRef.current = null;
      }, 2000);
      hasInitialScrolledRef.current = true;
      isNearBottomRef.current = false;
      pendingMessageIdRef.current = null;
    } catch (error) {
      if (attempt < 4) {
        scrollRetryTimerRef.current = setTimeout(() => scrollToSpecificMessage(messageId, attempt + 1), 80);
      } else {
        console.warn('[MessageList] Failed to scroll to specific message:', error);
        const offset = index * 60;
        flatListRef.current?.scrollToOffset({ offset, animated: false });
        hasInitialScrolledRef.current = true;
        pendingMessageIdRef.current = null;
      }
    }
  }, [messages]);

  // Highlight a specific message without scrolling (used after scrolling to bottom)
  const highlightSpecificMessage = useCallback((messageId) => {
    console.log('[MessageList] Highlighting message without scrolling:', messageId);
    setHighlightedMessageId(messageId);

    // Clear any existing timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    // Clear highlight after 2 seconds
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimeoutRef.current = null;
    }, 2000);

    pendingMessageIdRef.current = null;
  }, []);

  useEffect(() => {
    // Only trigger initial scroll once, when messages are first loaded
    if (isLoading || !flatListRef.current || messages.length === 0 || hasInitialScrolledRef.current) {
      return;
    }

    console.log('[MessageList] Initial scroll effect - first time setup:', {
      isLoading,
      hasRef: !!flatListRef.current,
      messageCount: messages.length,
      hasInitialScrolled: hasInitialScrolledRef.current,
      pendingMessageId: pendingMessageIdRef.current
    });

    // Always scroll to bottom first when opening a chat (user preference)
    // This ensures the most recent messages are visible immediately
    console.log('[MessageList] Triggering initial scroll to bottom (always prioritize recent messages)');

    // Use a longer delay to ensure all messages are loaded and rendered before scrolling
    setTimeout(() => {
      scrollToCalculatedBottom();

      // Double-scroll to ensure exact bottom
      setTimeout(() => {
        scrollToCalculatedBottom();
        console.log('[MessageList] Final initial scroll to exact bottom');

        hasInitialScrolledRef.current = true;
        isInitialLoadRef.current = false;
      }, 100);
    }, 300);
  }, [isLoading, messages.length, scrollToCalculatedBottom]); // Include scroll function dependency

  // Handle highlighting of specific message after initial scroll is complete
  useEffect(() => {
    if (!hasInitialScrolledRef.current || isInitialLoadRef.current || !pendingMessageIdRef.current) {
      return;
    }

    console.log('[MessageList] Highlighting specific message after initial scroll:', pendingMessageIdRef.current);

    // Wait longer to ensure initial scroll is completely stable
    setTimeout(() => {
      highlightSpecificMessage(pendingMessageIdRef.current);
    }, 500);
  }, [hasInitialScrolledRef.current, isInitialLoadRef.current]); // Only depend on scroll completion flags

  // Auto-scroll to bottom when new messages arrive (after initial load)
  useEffect(() => {
    // Don't interfere during initial load or if not scrolled yet
    if (isInitialLoadRef.current || !hasInitialScrolledRef.current) {
      return;
    }

    if (!flatListRef.current || messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage && lastMessage.senderID === currentUser?.userID;

    // Only auto-scroll for own messages or if user is already near bottom
    const shouldScroll = isOwnMessage || (shouldAutoScrollRef.current && isNearBottomRef.current);

    console.log('[MessageList] Auto-scroll decision:', {
      messageCount: messages.length,
      isOwnMessage,
      shouldAutoScroll: shouldAutoScrollRef.current,
      isNearBottom: isNearBottomRef.current,
      shouldScroll,
      hasInitialScrolled: hasInitialScrolledRef.current,
      isInitialLoad: isInitialLoadRef.current,
      currentUserId: currentUser?.userID,
      lastMessageSender: lastMessage?.senderID
    });

    if (shouldScroll) {
      // Use requestAnimationFrame for smooth auto-scroll on new messages
      requestAnimationFrame(() => {
        scrollToCalculatedBottom();
      });
    }
  }, [messages.length, currentUser, scrollToCalculatedBottom]); // Include scroll function dependency

  /**
   * Determine if a message should be grouped with the previous one
   * Messages are grouped if they're from the same sender and within 10 minutes
   */
  const isMessageGrouped = (currentMsg, prevMsg) => {
    if (!prevMsg) return false;
    
    // Must be from same sender
    if (currentMsg.senderID !== prevMsg.senderID) return false;
    
    // Must be within 10 minutes
    const timeDiff = currentMsg.timestamp - prevMsg.timestamp;
    const tenMinutes = 10 * 60 * 1000;
    
    return timeDiff < tenMinutes;
  };

  /**
   * Determine if a message is the last in a group
   * (i.e., the next message is NOT grouped with this one)
   */
  const isLastInGroup = (currentMsg, nextMsg) => {
    if (!nextMsg) return true; // Last message overall
    
    // If next message is from different sender, this is last in group
    if (currentMsg.senderID !== nextMsg.senderID) return true;
    
    // If next message is more than 10 minutes later, this is last in group
    const timeDiff = nextMsg.timestamp - currentMsg.timestamp;
    const tenMinutes = 10 * 60 * 1000;
    
    return timeDiff >= tenMinutes;
  };

  /**
   * Render individual message item
   */
  const renderMessage = ({ item, index }) => {
    const senderId =
      item?.senderID ??
      item?.senderId ??
      (typeof item?.sender === 'object'
        ? item?.sender?.userID || item?.sender?.id || item?.sender?.uid
        : item?.sender) ??
      item?.userID ??
      item?.userId ??
      null;

    const normalizedSenderId =
      typeof senderId === 'string' || typeof senderId === 'number'
        ? String(senderId)
        : Array.isArray(senderId)
        ? String(senderId[0])
        : senderId;

    const isOwn =
      normalizedSenderId !== null &&
      normalizedSenderId !== undefined &&
      normalizedSenderId === currentUser?.userID;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
    const isGrouped = isMessageGrouped(item, prevMessage);
    const isLast = isLastInGroup(item, nextMessage);

    // Get priority data for this message
    const priorityData = priorities[item.messageID];

    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showSenderInfo={isGroup}
        isGrouped={isGrouped}
        isLastInGroup={isLast}
        priority={priorityData?.priority}
        priorityReason={priorityData?.reason}
        priorityConfidence={priorityData?.confidence}
        isHighlighted={item.messageID === highlightedMessageId}
      />
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Icon name="wave" size="xxlarge" color={TEXT_SECONDARY} style={styles.emptyIcon} />
        <Text style={styles.emptyText}>Say hello!</Text>
      </View>
    );
  };

  /**
   * Handle viewable items changed - mark messages as read (PR9)
   * Debounced to prevent excessive Firestore writes
   */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (!currentUser?.userID || !chatID) return;

      viewableItems.forEach(({ item }) => {
        const message = item;
        
        // Only mark messages from other users as read
        if (message.senderID === currentUser.userID) return;
        
        // Check if already marked as read by current user
        const readBy = message.readBy || [];
        if (readBy.includes(currentUser.userID)) return;
        
        // Check if we've already queued this message (debounce)
        if (markedAsRead.has(message.messageID)) return;
        
        // Mark locally to prevent duplicate writes
        setMarkedAsRead((prev) => new Set([...prev, message.messageID]));
        
        // Mark as read in Firestore and update local store (with debounce)
        setTimeout(async () => {
          try {
            console.log(`[MessageList] Marking message ${message.messageID} as read`);
            
            // Update local message store first (optimistic update for instant UI feedback)
            markAsRead(chatID, message.messageID, currentUser.userID);
            
            // Then update Firestore
            await markMessageAsRead(chatID, message.messageID, currentUser.userID);
          } catch (error) {
            console.error('[MessageList] Error marking message as read:', error);
            // Remove from local set on error so it can be retried
            setMarkedAsRead((prev) => {
              const newSet = new Set(prev);
              newSet.delete(message.messageID);
              return newSet;
            });
          }
        }, 500); // 500ms debounce
      });
    },
    [currentUser, chatID, markedAsRead, markAsRead]
  );

  /**
   * Viewability config - message must be 60% visible to be considered "read"
   */
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 300, // Must be visible for 300ms
  }).current;

  /**
   * Key extractor for FlatList
   */
  const keyExtractor = (item) => item.messageID;

  /**
   * Get item layout for performance optimization
   * Assumes average message height of 60px
   * Note: This is an approximation - actual heights vary (sender name, multi-line, urgent)
   * onScrollToIndexFailed provides fallback for mis-estimates
   */
  const getItemLayout = (data, index) => ({
    length: 60,
    offset: 60 * index,
    index,
  });

  const handleScroll = useCallback((event) => {
    // Don't interfere with initial scroll positioning
    if (isInitialLoadRef.current || !hasInitialScrolledRef.current) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom < 120;
    shouldAutoScrollRef.current = distanceFromBottom < 120; // Set based on actual position

    console.log('[MessageList] Scroll position:', {
      contentOffsetY: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      distanceFromBottom,
      isNearBottom: isNearBottomRef.current,
      shouldAutoScroll: shouldAutoScrollRef.current
    });
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    // Don't interfere with initial scroll positioning
    if (isInitialLoadRef.current || !hasInitialScrolledRef.current) {
      return;
    }
    shouldAutoScrollRef.current = false;
    console.log('[MessageList] User scroll drag started, auto-scroll disabled');
  }, []);

  const handleMomentumScrollEnd = useCallback((event) => {
    // Don't interfere with initial scroll positioning
    if (isInitialLoadRef.current || !hasInitialScrolledRef.current) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom < 120;
    shouldAutoScrollRef.current = distanceFromBottom < 120;

    console.log('[MessageList] User scroll ended:', {
      distanceFromBottom,
      isNearBottom: isNearBottomRef.current,
      shouldAutoScroll: shouldAutoScrollRef.current
    });
  }, []);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      contentContainerStyle={[
        styles.contentContainer,
        messages.length === 0 && styles.emptyContainer,
        { paddingTop: 4 + Math.max(topInset, 0) },
        { paddingBottom: 20 + Math.max(bottomInset, 0) }, // Minimal space for MessageInput
      ]}
      ListEmptyComponent={renderEmptyState}
      showsVerticalScrollIndicator={true}
      removeClippedSubviews={true}
      onScroll={!isInitialLoadRef.current ? handleScroll : undefined}
      onScrollBeginDrag={!isInitialLoadRef.current ? handleScrollBeginDrag : undefined}
      onMomentumScrollEnd={!isInitialLoadRef.current ? handleMomentumScrollEnd : undefined}
      scrollEventThrottle={16}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={20}
      windowSize={7}
      // PR9: Viewability tracking for read receipts
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={getItemLayout}
      onScrollToIndexFailed={(info) => {
        // Fallback when scrollToIndex fails
        const offset = info.averageItemLength * info.index;
        flatListRef.current?.scrollToOffset({ offset, animated: true });
      }}
    />
  );
});

export default MessageList;

const styles = StyleSheet.create({
  contentContainer: {
    backgroundColor: BACKGROUND_CHAT,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    color: TEXT_SECONDARY,
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 12,
  },
});

