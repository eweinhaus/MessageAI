// Contact List Item Component - Display user in contact picker
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';

/**
 * ContactListItem Component
 * Displays a contact with avatar, name, and selection state
 * 
 * @param {Object} props
 * @param {Object} props.user - User object {userID, displayName, email, isOnline}
 * @param {boolean} props.isSelected - Whether this contact is selected
 * @param {Function} props.onSelect - Callback when contact is tapped
 */
export default function ContactListItem({ user, isSelected, onSelect }) {
  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.containerSelected]}
      onPress={() => onSelect(user)}
      activeOpacity={0.7}
    >
      <Avatar
        displayName={user.displayName}
        userID={user.userID}
        size={50}
      />
      
      <View style={styles.info}>
        <Text style={styles.name}>{user.displayName}</Text>
        {user.email && (
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        )}
      </View>
      
      {isSelected && (
        <View style={styles.checkmarkContainer}>
          <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
        </View>
      )}
      
      {!isSelected && (
        <View style={styles.checkmarkPlaceholder} />
      )}
      
      {user.isOnline && !isSelected && (
        <View style={styles.onlineIndicator} />
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
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: '#666',
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
    right: 20,
    top: 20,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

