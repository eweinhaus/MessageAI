// UI Store - Global loading and error state management
import { create } from 'zustand';

const useUIStore = create((set, get) => ({
  // Loading state
  loadingCount: 0,
  loadingMessage: '',
  
  // Error state
  globalError: null,
  errorVisible: false,
  
  // Toast messages
  toastMessage: null,
  toastType: 'info', // 'info' | 'success' | 'warning' | 'error'
  
  /**
   * Increment loading counter
   * @param {string} message - Optional loading message
   */
  startLoading: (message = '') => {
    set((state) => ({
      loadingCount: state.loadingCount + 1,
      loadingMessage: message || state.loadingMessage,
    }));
  },
  
  /**
   * Decrement loading counter
   */
  stopLoading: () => {
    set((state) => ({
      loadingCount: Math.max(0, state.loadingCount - 1),
      loadingMessage: state.loadingCount <= 1 ? '' : state.loadingMessage,
    }));
  },
  
  /**
   * Check if app is loading
   * @returns {boolean}
   */
  isLoading: () => {
    return get().loadingCount > 0;
  },
  
  /**
   * Set global error
   * @param {Error|string} error - Error object or message
   */
  setError: (error) => {
    const errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';
    
    set({
      globalError: errorMessage,
      errorVisible: true,
    });
    
    // Auto-clear error after 5 seconds
    setTimeout(() => {
      get().clearError();
    }, 5000);
  },
  
  /**
   * Clear global error
   */
  clearError: () => {
    set({
      globalError: null,
      errorVisible: false,
    });
  },
  
  /**
   * Show toast message
   * @param {string} message - Toast message
   * @param {string} type - Toast type ('info' | 'success' | 'warning' | 'error')
   * @param {number} duration - Duration in ms (default 3000)
   */
  showToast: (message, type = 'info', duration = 3000) => {
    set({
      toastMessage: message,
      toastType: type,
    });
    
    // Auto-clear toast
    setTimeout(() => {
      get().clearToast();
    }, duration);
  },
  
  /**
   * Clear toast message
   */
  clearToast: () => {
    set({
      toastMessage: null,
      toastType: 'info',
    });
  },
}));

/**
 * Higher-order function to wrap async operations with loading state
 * @param {Function} asyncFn - Async function to wrap
 * @param {string} loadingMessage - Optional loading message
 * @returns {Function} Wrapped function
 */
export function withLoading(asyncFn, loadingMessage = '') {
  return async (...args) => {
    const { startLoading, stopLoading, setError } = useUIStore.getState();
    
    try {
      startLoading(loadingMessage);
      const result = await asyncFn(...args);
      return result;
    } catch (error) {
      console.error('[UIStore] Error in async operation:', error);
      setError(error);
      throw error;
    } finally {
      stopLoading();
    }
  };
}

export default useUIStore;

