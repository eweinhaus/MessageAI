import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Messages',
          tabBarLabel: 'Chats',
        }}
      />
    </Tabs>
  );
}

