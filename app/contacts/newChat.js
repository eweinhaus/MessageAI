// New Chat Screen - Contact Picker (Placeholder for PR 6)
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

export default function NewChatScreen() {
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
        }}
      />
      <View style={styles.container}>
        <Text style={styles.text}>New Chat</Text>
        <Text style={styles.subtext}>PR 6: Contact Picker & New Chat Creation</Text>
        <Text style={styles.info}>
          This screen will allow you to:
          {'\n'}- Browse all registered users
          {'\n'}- Select 1 user for 1:1 chat
          {'\n'}- Select 2+ users for group chat
          {'\n'}- Create new conversations
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

