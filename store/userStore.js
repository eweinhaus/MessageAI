// User Store - Zustand State Management for Authentication
import { create } from 'zustand';
import { subscribeToAuth, logout as authLogout } from '../services/auth';
import { setUserOffline, cleanupPresence } from '../services/presenceService';
import { clearAllData } from '../db/database';
import { getUserProfile } from '../services/firestore';

// Flag to prevent multiple initializations
let isInitialized = false;

/**
 * User Store
 * Manages current user authentication state across the app
 */
const useUserStore = create((set, get) => ({
  // State
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  /**
   * Set the current user
   * Called when user signs in or auth state changes
   * @param {Object|null} user - Firebase user object or null
   */
  setCurrentUser: (user) => {
    set({
      currentUser: user,
      isAuthenticated: !!user,
      isLoading: false,
      error: null,
    });
  },

  /**
   * Set loading state
   * @param {boolean} loading - Loading status
   */
  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  /**
   * Set error state
   * @param {Error|string|null} error - Error object or message
   */
  setError: (error) => {
    set({ 
      error: error ? error.message || error : null,
      isLoading: false,
    });
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Logout the current user
   * Clears user state, local data, and calls Firebase logout
   */
  logout: async () => {
    try {
      set({ isLoading: true });
      
      // Get current user before logout
      const user = get().currentUser;
      
      // Set user offline before logging out (non-blocking)
      // This may fail if auth token is already invalidated, which is fine
      if (user?.userID) {
        try {
          await setUserOffline(user.userID);
        } catch (presenceError) {
          // Silently handle presence errors during logout
          // The user is logging out anyway, so this is not critical
          console.warn('[Logout] Could not set user offline (expected during logout):', presenceError.message);
        }
        cleanupPresence();
      }
      
      // Clear all local data to prevent data leakage between users
      console.log('[Logout] Clearing local data (SQLite, stores)...');
      try {
        // Clear SQLite database
        await clearAllData();
        console.log('[Logout] SQLite data cleared');
        
        // Clear Zustand stores (import at function level to avoid circular deps)
        const { default: useChatStore } = await import('./chatStore');
        const { default: useMessageStore } = await import('./messageStore');
        
        useChatStore.getState().clearChats();
        useMessageStore.getState().clearMessages();
        console.log('[Logout] Zustand stores cleared');
      } catch (clearError) {
        console.error('[Logout] Error clearing local data:', clearError);
        // Don't block logout if clearing fails
      }
      
      await authLogout();
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      
      console.log('[Logout] Logout complete');
    } catch (error) {
      console.error('Error logging out:', error);
      set({
        error: error.message || 'Failed to logout',
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * Initialize the store
   * Sets up Firebase auth listener
   * Should be called once on app launch
   */
  initialize: () => {
    // Prevent multiple initializations (important for Fast Refresh in dev)
    if (isInitialized) {
      console.log('User store already initialized');
      return;
    }

    console.log('Initializing user store...');
    isInitialized = true;
    set({ isLoading: true });

    // Subscribe to Firebase auth state changes
    const unsubscribe = subscribeToAuth(async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? firebaseUser.uid : 'null');
      
      if (firebaseUser) {
        // User is signed in - fetch profile from Firestore for accurate display name
        try {
          const firestoreProfile = await getUserProfile(firebaseUser.uid);
          
          const user = {
            userID: firebaseUser.uid,
            email: firebaseUser.email,
            // Use Firestore display name first (most reliable), fall back to Firebase Auth, then email
            displayName: firestoreProfile?.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0],
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
          };
          
          console.log('[UserStore] User profile loaded:', user.displayName);
          get().setCurrentUser(user);
        } catch (error) {
          console.error('[UserStore] Error loading Firestore profile:', error);
          // Fallback to Firebase Auth data if Firestore fetch fails
          const user = {
            userID: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
          };
          get().setCurrentUser(user);
        }
      } else {
        // User is signed out
        get().setCurrentUser(null);
      }
    });

    // Store unsubscribe function for cleanup if needed
    return unsubscribe;
  },
}));

export default useUserStore;

