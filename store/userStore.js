// User Store - Zustand State Management for Authentication
import { create } from 'zustand';
import { subscribeToAuth, logout as authLogout } from '../services/auth';

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
   * Clears user state and calls Firebase logout
   */
  logout: async () => {
    try {
      set({ isLoading: true });
      await authLogout();
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
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
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? firebaseUser.uid : 'null');
      
      if (firebaseUser) {
        // User is signed in
        const user = {
          userID: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
        };
        
        get().setCurrentUser(user);
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

