// Auth Layout - Stack navigator for authentication screens
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen 
        name="login" 
        options={{
          title: 'Sign In',
        }}
      />
    </Stack>
  );
}
