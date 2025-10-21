// MessageList Component - Scrollable list of messages
import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MessageBubble from './MessageBubble';
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
 */
export default function MessageList({
  chatID,
  isGroup = false,
  isLoading = false,
  topInset = 0,
  bottomInset = 0,
}) {
  const flatListRef = useRef(null);
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
  const currentUser = useUserStore((state) => state.currentUser);
  
  // Track which messages have been marked as read to avoid duplicate writes
  const [markedAsRead, setMarkedAsRead] = useState(new Set());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      // Small delay to ensure layout has completed
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  /**
   * Determine if a message should be grouped with the previous one
   * Messages are grouped if they're from the same sender and within 5 minutes
   */
  const isMessageGrouped = (currentMsg, prevMsg) => {
    if (!prevMsg) return false;
    
    // Must be from same sender
    if (currentMsg.senderID !== prevMsg.senderID) return false;
    
    // Must be within 5 minutes
    const timeDiff = currentMsg.timestamp - prevMsg.timestamp;
    const fiveMinutes = 5 * 60 * 1000;
    
    return timeDiff < fiveMinutes;
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
    const isGrouped = isMessageGrouped(item, prevMessage);

    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showSenderInfo={isGroup}
        isGrouped={isGrouped}
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
        <Text style={styles.emptyEmoji}>👋</Text>
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
        
        // Mark as read in Firestore (with debounce)
        setTimeout(async () => {
          try {
            console.log(`[MessageList] Marking message ${message.messageID} as read`);
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
    [currentUser, chatID, markedAsRead]
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
   */
  const getItemLayout = (data, index) => ({
    length: 60,
    offset: 60 * index,
    index,
  });

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
        { paddingBottom: 8 + Math.max(bottomInset, 0) },
      ]}
      ListEmptyComponent={renderEmptyState}
      showsVerticalScrollIndicator={true}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={20}
      windowSize={21}
      // PR9: Viewability tracking for read receipts
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      // Note: getItemLayout commented out for now as message heights vary
      // Will optimize in future if needed
      // getItemLayout={getItemLayout}
    />
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 8,
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
  emptyEmoji: {
    fontSize: 48,
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

