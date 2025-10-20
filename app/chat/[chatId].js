// Chat Detail Screen - Conversation View (Placeholder for PR 7)
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import useChatStore from '../../store/chatStore';
import useUserStore from '../../store/userStore';

export default function ChatDetailScreen() {
  const { chatId } = useLocalSearchParams();
  const { getChatByID } = useChatStore();
  const currentUser = useUserStore((state) => state.currentUser);
  
  const chat = getChatByID(chatId);
  
  // For 1:1 chats, show the other user's name
  let chatName = 'Chat';
  if (chat) {
    if (chat.type === 'group') {
      chatName = chat.groupName;
    } else if (chat.type === '1:1' && chat.participantIDs) {
      // Find the other user's index
      const otherUserIndex = chat.participantIDs[0] === currentUser?.userID ? 1 : 0;
      chatName = chat.participantNames?.[otherUserIndex] || 'Chat';
    }
  }
  
  return (
    <>
      <Stack.Screen
        options={{
          title: chatName,
          headerStyle: {
            backgroundColor: '#4CAF50',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      />
      <View style={styles.container}>
        <Text style={styles.text}>Chat Detail</Text>
        <Text style={styles.subtext}>PR 7: Chat Detail Screen & Message Display</Text>
        <Text style={styles.info}>
          Chat ID: {chatId}
          {'\n\n'}This screen will display:
          {'\n'}- Message history
          {'\n'}- Real-time message updates
          {'\n'}- Message bubbles (own vs. others)
          {'\n'}- Timestamps
          {'\n'}- Sender attribution (for groups)
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 40,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  info: {
    fontSize: 14,
    color: '#333',
    lineHeight: 24,
    textAlign: 'center',
  },
});

