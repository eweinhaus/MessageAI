// MessageInput Component - Text input for sending messages
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIMARY_GREEN, BACKGROUND_COLOR, TEXT_PRIMARY } from '../constants/colors';
import { useNetworkStatus } from '../utils/networkStatus';

/**
 * MessageInput Component
 * Text input for composing and sending messages
 * 
 * @param {Object} props
 * @param {string} props.chatID - Chat ID
 * @param {Function} props.onSend - Callback when send button is pressed (receives text)
 */
export default function MessageInput({ chatID, onSend, bottomInset = 0 }) {
  const [text, setText] = useState('');
  const { isOnline } = useNetworkStatus();

  const handleSend = () => {
    const trimmedText = text.trim();
    
    if (trimmedText === '') {
      return;
    }

    // Call parent's onSend callback
    onSend(trimmedText);
    
    // Clear input
    setText('');
  };

  const canSend = text.trim() !== '';
  const isButtonDisabled = !canSend;

  return (
    <View
      style={[
        styles.container,
        Platform.OS === 'ios' ? styles.containerIOS : null,
      ]}
    >
      <TextInput
        style={styles.input}
        placeholder={isOnline ? "Type a message..." : "You're offline..."}
        placeholderTextColor="#999"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
        editable
        returnKeyType="default"
        blurOnSubmit={false}
      />
      
      <TouchableOpacity
        style={[
          styles.sendButton,
          isButtonDisabled && styles.sendButtonDisabled,
          !isButtonDisabled && !isOnline && styles.sendButtonOffline,
        ]}
        onPress={handleSend}
        disabled={isButtonDisabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name="send"
          size={20}
          color={isButtonDisabled ? '#999' : '#fff'}
        />
      </TouchableOpacity>

      {!isOnline && (
        <View style={styles.offlineHintContainer} pointerEvents="none">
          <Text style={styles.offlineHint}>Offline. Message will send when you're back online.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  containerIOS: {
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    fontSize: 16,
    color: TEXT_PRIMARY,
    maxHeight: 100, // ~4 lines
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  sendButtonOffline: {
    backgroundColor: '#8BC48A',
  },
  offlineHintContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? -22 : -18,
  },
  offlineHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

