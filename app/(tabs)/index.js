// Home Screen - Chat List (Placeholder for PR 5)
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import useUserStore from '../../store/userStore';
import Avatar from '../../components/Avatar';
import { createOneOnOneChat, sendMessage, getAllUserChats } from '../../services/firestore';

export default function HomeScreen() {
  const { currentUser, logout } = useUserStore();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // TEST FUNCTION - Remove after PR 3 testing
  const testFirestoreFunctions = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'No user logged in');
      return;
    }

    try {
      console.log('🧪 Testing Firestore functions...');

      // Create a dummy test user for chat
      const testUserID = 'test-user-123';
      const testUserName = 'Test User';

      // 1. Create a 1:1 chat
      console.log('📝 Creating 1:1 chat...');
      const chat = await createOneOnOneChat(
        currentUser.userID,
        currentUser.displayName,
        testUserID,
        testUserName
      );
      console.log('✅ Chat created:', chat.chatID);

      // 2. Send a test message
      console.log('💬 Sending test message...');
      const message = await sendMessage(
        chat.chatID,
        currentUser.userID,
        currentUser.displayName,
        'Hello! This is a test message from PR 3.'
      );
      console.log('✅ Message sent:', message.messageID);

      // 3. Get all user chats
      console.log('📋 Fetching all chats...');
      const allChats = await getAllUserChats(currentUser.userID);
      console.log('✅ Found', allChats.length, 'chat(s)');

      Alert.alert(
        '✅ Success!',
        `Created chat: ${chat.chatID}\nSent message: ${message.messageID}\nTotal chats: ${allChats.length}\n\nCheck Firebase Console to see the documents!`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Test failed:', error);
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* User Info */}
      {currentUser && (
        <View style={styles.userInfo}>
          <Avatar 
            displayName={currentUser.displayName} 
            userID={currentUser.userID}
            size={60}
          />
          <Text style={styles.userName}>{currentUser.displayName}</Text>
          <Text style={styles.userEmail}>{currentUser.email}</Text>
        </View>
      )}

      {/* Placeholder */}
      <View style={styles.content}>
        <Text style={styles.text}>Chat List</Text>
        <Text style={styles.subtext}>PR 5: Home Screen & Chat List</Text>
        <Text style={styles.info}>
          ✅ Authentication is working!
        </Text>

        {/* TEST BUTTON - Remove after PR 3 testing */}
        <TouchableOpacity 
          style={styles.testButton} 
          onPress={testFirestoreFunctions}
        >
          <Text style={styles.testButtonText}>🧪 Test Firestore Functions</Text>
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  userInfo: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  info: {
    fontSize: 16,
    color: '#4CAF50',
    marginTop: 10,
  },
  testButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 30,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  logoutButton: {
    backgroundColor: '#f44336',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    margin: 20,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
