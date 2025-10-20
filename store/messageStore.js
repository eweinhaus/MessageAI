// Message Store - Zustand state management for messages
import { create } from 'zustand';

/**
 * Message Store
 * Manages all message-related state (messages organized by chat)
 */
const useMessageStore = create((set, get) => ({
  // State
  messagesByChat: {}, // Object: { [chatID]: [messages] }
  isLoading: false, // Loading state for async operations

  // Actions
  /**
   * Set messages for a specific chat
   * @param {string} chatID - Chat ID
   * @param {Array} messages - Array of message objects
   */
  setMessagesForChat: (chatID, messages) => {
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatID]: messages,
      },
    }));
  },

  /**
   * Add a single message to a chat
   * @param {string} chatID - Chat ID
   * @param {Object} message - Message object
   */
  addMessage: (chatID, message) => {
    set((state) => {
      const existingMessages = state.messagesByChat[chatID] || [];
      
      // Check if message already exists (by messageID)
      const existingIndex = existingMessages.findIndex(
        (m) => m.messageID === message.messageID
      );
      
      if (existingIndex >= 0) {
        // Update existing message
        const updatedMessages = [...existingMessages];
        updatedMessages[existingIndex] = message;
        
        return {
          messagesByChat: {
            ...state.messagesByChat,
            [chatID]: updatedMessages,
          },
        };
      } else {
        // Add new message
        return {
          messagesByChat: {
            ...state.messagesByChat,
            [chatID]: [...existingMessages, message],
          },
        };
      }
    });
  },

  /**
   * Update a specific message
   * @param {string} chatID - Chat ID
   * @param {string} messageID - Message ID to update
   * @param {Object} updates - Fields to update
   */
  updateMessage: (chatID, messageID, updates) => {
    set((state) => {
      const existingMessages = state.messagesByChat[chatID] || [];
      
      const updatedMessages = existingMessages.map((message) =>
        message.messageID === messageID ? { ...message, ...updates } : message
      );
      
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatID]: updatedMessages,
        },
      };
    });
  },

  /**
   * Get messages for a specific chat
   * @param {string} chatID - Chat ID
   * @returns {Array} Array of message objects
   */
  getMessagesForChat: (chatID) => {
    const state = get();
    return state.messagesByChat[chatID] || [];
  },

  /**
   * Mark a message as read
   * @param {string} chatID - Chat ID
   * @param {string} messageID - Message ID
   * @param {string} userID - User ID who read the message
   */
  markAsRead: (chatID, messageID, userID) => {
    set((state) => {
      const existingMessages = state.messagesByChat[chatID] || [];
      
      const updatedMessages = existingMessages.map((message) => {
        if (message.messageID === messageID) {
          // Add userID to readBy array if not already present
          const readBy = message.readBy || [];
          if (!readBy.includes(userID)) {
            return { ...message, readBy: [...readBy, userID] };
          }
        }
        return message;
      });
      
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatID]: updatedMessages,
        },
      };
    });
  },

  /**
   * Set loading state
   * @param {boolean} isLoading - Loading state
   */
  setLoading: (isLoading) => {
    set({ isLoading });
  },

  /**
   * Clear all messages (e.g., on logout)
   */
  clearMessages: () => {
    set({ messagesByChat: {} });
  },

  /**
   * Clear messages for a specific chat
   * @param {string} chatID - Chat ID
   */
  clearChatMessages: (chatID) => {
    set((state) => {
      const { [chatID]: removed, ...rest } = state.messagesByChat;
      return { messagesByChat: rest };
    });
  },
}));

export default useMessageStore;

