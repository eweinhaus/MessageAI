// Chat Layout - Handles chat-related routes
import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Let individual screens control their headers
      }}
    >
      <Stack.Screen 
        name="[chatId]" 
        options={{ 
          headerShown: false,
          presentation: 'card',
        }} 
      />
      <Stack.Screen 
        name="members/[chatId]" 
        options={{ 
          headerShown: true,
          title: 'Members',
          presentation: 'card',
        }} 
      />
    </Stack>
  );
}

