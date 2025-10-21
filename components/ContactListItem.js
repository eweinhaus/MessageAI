// Contact List Item Component - Display user in contact picker
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { usePresence } from '../hooks/usePresence';

/**
 * ContactListItem Component
 * Displays a contact with avatar, name, and selection state
 * 
 * @param {Object} props
 * @param {Object} props.user - User object {userID, displayName, email}
 * @param {boolean} props.isSelected - Whether this contact is selected
 * @param {Function} props.onSelect - Callback when contact is tapped
 */
export default function ContactListItem({ user, isSelected, onSelect }) {
  // Get real-time presence data for this user
  const { isOnline, lastSeen } = usePresence(user.userID);
  
  // Format last seen time
  const getLastSeenText = () => {
    // If explicitly marked as online, show "Online"
    if (isOnline) return 'Online';
    
    // If no last seen timestamp, show "Offline"
    if (!lastSeen) return 'Offline';
    
    const now = Date.now();
    const diff = now - lastSeen;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    // Show relative time for offline users
    if (minutes < 1) return 'Last seen just now';
    if (minutes < 60) return `Last seen ${minutes}m ago`;
    if (hours < 24) return `Last seen ${hours}h ago`;
    if (days < 7) return `Last seen ${days}d ago`;
    return 'Offline';
  };
  
  const statusText = getLastSeenText();
  
  return (
    <TouchableOpacity
      testID={`contact-item-${user.userID}`}
      style={[styles.container, isSelected && styles.containerSelected]}
      onPress={() => onSelect(user)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        <Avatar
          displayName={user.displayName}
          userID={user.userID}
          size={50}
        />
        {/* Online indicator on avatar */}
        {isOnline && (
          <View style={styles.onlineIndicator} testID="contact-online-indicator" />
        )}
      </View>
      
      <View style={styles.info}>
        <Text testID="contact-name" style={styles.name}>{user.displayName}</Text>
        <View style={styles.statusRow}>
          {user.email && (
            <Text testID="contact-email" style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          )}
          <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
            {statusText}
          </Text>
        </View>
      </View>
      
      {isSelected && (
        <View style={styles.checkmarkContainer} testID="contact-checkmark">
          <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
        </View>
      )}
      
      {!isSelected && (
        <View style={styles.checkmarkPlaceholder} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  containerSelected: {
    backgroundColor: '#f0f9f0',
  },
  avatarContainer: {
    position: 'relative',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  email: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  statusText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  statusTextOnline: {
    color: '#4CAF50',
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  checkmarkPlaceholder: {
    width: 28,
    marginLeft: 8,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

