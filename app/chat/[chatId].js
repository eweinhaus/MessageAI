// Chat Detail Screen - Conversation View
import React, { useEffect, useState } from 'react';
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
import { getMessagesForChat, insertMessage, updateMessage } from '../../db/messageDb';
import { sendMessage } from '../../services/messageService';
import { Ionicons } from '@expo/vector-icons';
import { PRIMARY_GREEN } from '../../constants/colors';

export default function ChatDetailScreen() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight() || 0;
  const topInset = Math.max(insets.top - headerHeight, 0);
  const bottomInset = insets.bottom || 0;
  const { getChatByID } = useChatStore();
  const { setMessagesForChat, addMessage, updateMessage: updateMessageInStore } = useMessageStore();
  const currentUser = useUserStore((state) => state.currentUser);
  
  const [isLoading, setIsLoading] = useState(true);
  
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

    const setupChat = async () => {
      try {
        // 1. Load messages from SQLite (instant UI)
        console.log(`[ChatDetail] Loading messages for chat ${chatId} from SQLite`);
        const localMessages = await getMessagesForChat(chatId);
        setMessagesForChat(chatId, localMessages);
        setIsLoading(false);

        // 2. Set up Firestore listener for real-time updates
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
                    normalized.deliveryStatus = 'delivered';
                    
                    // Write back to Firestore so sender can see delivered status
                    try {
                      const messageRef = doc(db, `chats/${chatId}/messages`, normalized.messageID);
                      await updateDoc(messageRef, { deliveryStatus: 'delivered' });
                    } catch (error) {
                      console.error('[ChatDetail] Error updating delivery status in Firestore:', error);
                      // Continue anyway - will be delivered locally
                    }
                  }
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
      } catch (error) {
        console.error('[ChatDetail] Error setting up chat:', error);
        setIsLoading(false);
      }
    };

    setupChat();

    // Cleanup: unsubscribe from Firestore listener on unmount
    return () => {
      if (unsubscribe) {
        console.log(`[ChatDetail] Cleaning up Firestore listener for chat ${chatId}`);
        unsubscribe();
      }
    };
  }, [chatId, currentUser]);

  // Navigate to member list
  const handleHeaderPress = () => {
    // For groups, navigate to member list
    // For 1:1, could navigate to user profile (future feature)
    if (isGroup) {
      router.push(`/chat/members/${chatId}`);
    } else {
      // For 1:1 chats, could open user profile
      // For now, just navigate to member list as well
      router.push(`/chat/members/${chatId}`);
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
        {/* Custom Header */}
        <ChatHeader
          chat={chat}
          currentUserID={currentUser?.userID}
          onPress={handleHeaderPress}
        />
        
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.container}>
            <MessageList
              chatID={chatId}
              isGroup={isGroup}
              isLoading={isLoading}
              topInset={0}
              bottomInset={bottomInset}
            />
            <MessageInput
              chatID={chatId}
              onSend={handleSendMessage}
            />
          </View>
        </KeyboardAvoidingView>
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
