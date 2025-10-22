// useTyping Hook - Manage typing indicators in a chat
import { useState, useEffect, useRef } from 'react';
import { setTyping, clearTyping, subscribeToTyping } from '../services/typingService';

/**
 * Hook to manage typing indicators in a chat
 * Automatically subscribes to typing status from other users
 * Provides methods to set/clear current user's typing status
 * 
 * @param {string} chatId - Chat ID
 * @param {string} currentUserId - Current user's ID
 * @param {string} currentUserName - Current user's display name (optional for read-only)
 * @returns {Object} { typingUsers, handleTyping, clearUserTyping }
 */
export function useTyping(chatId, currentUserId, currentUserName) {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  
  // Subscribe to typing indicators from other users
  useEffect(() => {
    if (!chatId || !currentUserId) {
      setTypingUsers([]);
      return;
    }
    
    console.log(`[useTyping] Subscribing to typing indicators for chat ${chatId}`);
    
    const unsubscribe = subscribeToTyping(chatId, currentUserId, (users) => {
      setTypingUsers(users);
    });
    
    // Cleanup on unmount
    return () => {
      console.log(`[useTyping] Unsubscribing from typing indicators for chat ${chatId}`);
      unsubscribe();
      
      // Clear any pending timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Clear typing status on unmount (if we have the user name)
      if (currentUserId && chatId && currentUserName) {
        clearTyping(chatId, currentUserId).catch(console.error);
      }
    };
  }, [chatId, currentUserId, currentUserName]);
  
  /**
   * Call this when user is typing
   * Automatically clears after 3 seconds of inactivity
   */
  const handleTyping = () => {
    if (!chatId || !currentUserId || !currentUserName) {
      console.warn('[useTyping] Cannot set typing - missing required params');
      return;
    }
    
    // Set typing status (throttled in service layer)
    setTyping(chatId, currentUserId, currentUserName);
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to clear typing after 3 seconds of no activity
    typingTimeoutRef.current = setTimeout(() => {
      clearTyping(chatId, currentUserId).catch(console.error);
      typingTimeoutRef.current = null;
    }, 3000);
  };
  
  /**
   * Manually clear typing status (e.g., on message send)
   */
  const clearUserTyping = () => {
    if (!chatId || !currentUserId) {
      return;
    }
    
    // Clear timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    // Clear typing status in Firestore
    clearTyping(chatId, currentUserId).catch(console.error);
  };
  
  return {
    typingUsers, // Array of { userId, displayName }
    handleTyping, // Call on text input change
    clearUserTyping, // Call on message send
  };
}

