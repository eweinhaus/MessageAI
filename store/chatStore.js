// Chat Store - Zustand state management for chats
import { create } from 'zustand';

/**
 * Chat Store
 * Manages all chat-related state (chat list, current active chat)
 */
const useChatStore = create((set, get) => ({
  // State
  chats: [], // Array of chat objects
  currentChatID: null, // Currently active chat ID
  isLoading: false, // Loading state for async operations

  // Actions
  /**
   * Set all chats (replace entire list)
   * @param {Array} chats - Array of chat objects
   */
  setChats: (chats) => {
    set({ chats });
  },

  /**
   * Add a single chat to the list
   * @param {Object} chat - Chat object
   */
  addChat: (chat) => {
    set((state) => {
      // Check if chat already exists
      const existingIndex = state.chats.findIndex((c) => c.chatID === chat.chatID);
      
      if (existingIndex >= 0) {
        // Update existing chat
        const updatedChats = [...state.chats];
        updatedChats[existingIndex] = chat;
        return { chats: updatedChats };
      } else {
        // Add new chat
        return { chats: [...state.chats, chat] };
      }
    });
  },

  /**
   * Update a specific chat
   * @param {string} chatID - Chat ID to update
   * @param {Object} updates - Fields to update
   */
  updateChat: (chatID, updates) => {
    set((state) => {
      const updatedChats = state.chats.map((chat) =>
        chat.chatID === chatID ? { ...chat, ...updates } : chat
      );
      return { chats: updatedChats };
    });
  },

  /**
   * Set the currently active chat
   * @param {string} chatID - Chat ID to set as active
   */
  setCurrentChat: (chatID) => {
    set({ currentChatID: chatID });
  },

  /**
   * Get a chat by ID
   * @param {string} chatID - Chat ID
   * @returns {Object|null} Chat object or null if not found
   */
  getChatByID: (chatID) => {
    const state = get();
    return state.chats.find((chat) => chat.chatID === chatID) || null;
  },

  /**
   * Set loading state
   * @param {boolean} isLoading - Loading state
   */
  setLoading: (isLoading) => {
    set({ isLoading });
  },

  /**
   * Clear all chats (e.g., on logout)
   */
  clearChats: () => {
    set({ chats: [], currentChatID: null });
  },
}));

export default useChatStore;

