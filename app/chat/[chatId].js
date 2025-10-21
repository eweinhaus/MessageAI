// Chat Detail Screen - Conversation View
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import useChatStore from '../../store/chatStore';
import useMessageStore from '../../store/messageStore';
import useUserStore from '../../store/userStore';
import MessageList from '../../components/MessageList';
import { getMessagesForChat, insertMessage, updateMessage } from '../../db/messageDb';
import { Ionicons } from '@expo/vector-icons';
import { PRIMARY_GREEN } from '../../constants/colors';

export default function ChatDetailScreen() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams();
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
                // Write to SQLite (wrapped in try-catch to prevent crashes)
                try {
                  // Normalize Firestore Timestamp to milliseconds if needed
                  const normalized = {
                    ...messageData,
                    timestamp:
                      messageData?.timestamp?.toMillis?.() ?? messageData?.timestamp ?? Date.now(),
                    createdAt:
                      messageData?.createdAt?.toMillis?.() ?? messageData?.createdAt ?? Date.now(),
                  };

                  await insertMessage({ ...normalized, syncStatus: 'synced' });
                } catch (error) {
                  console.error('[ChatDetail] Error inserting message to SQLite:', error);
                  // Continue anyway - message will still show in UI from Zustand
                }

                // Update Zustand store (UI updates automatically)
                addMessage(chatId, {
                  ...messageData,
                  timestamp:
                    messageData?.timestamp?.toMillis?.() ?? messageData?.timestamp ?? Date.now(),
                });
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

  // Navigate to member list for groups
  const handleHeaderPress = () => {
    if (isGroup) {
      router.push(`/chat/members/${chatId}`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: chatName,
          headerStyle: {
            backgroundColor: PRIMARY_GREEN,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
          // For groups, make header tappable to view members
          headerRight: isGroup ? () => (
            <TouchableOpacity onPress={handleHeaderPress}>
              <Ionicons name="people-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
            </TouchableOpacity>
          ) : null,
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.container}>
          <MessageList 
            chatID={chatId} 
            isGroup={isGroup} 
            isLoading={isLoading}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
});
