// Home Screen - Chat List (Placeholder for PR 5)
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import useUserStore from '../../store/userStore';
import Avatar from '../../components/Avatar';

export default function HomeScreen() {
  const { currentUser, logout } = useUserStore();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
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
