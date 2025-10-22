// Authentication Service - Google Sign-In with Firebase
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseAuthChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInAnonymously,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { createUserProfile, getUserProfile } from './firestore';
import { getErrorMessage } from '../utils/errorMessages';

// Complete the web browser session
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Configuration
// Note: You need to add these to your .env file:
// EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id
// EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_android_client_id
const config = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

/**
 * Sign in with Google OAuth (hook-driven in UI)
 */
export async function signInWithGoogle() {
  try {
    const [request, response, promptAsync] = Google.useAuthRequest({
      webClientId: config.webClientId,
      iosClientId: config.iosClientId,
      androidClientId: config.androidClientId,
    });
    throw new Error('signInWithGoogle must be called from a component using useGoogleAuth hook');
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

/**
 * Authenticate Firebase using a Google ID token
 */
export async function authenticateWithGoogle(idToken) {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    const existingProfile = await getUserProfile(user.uid);
    if (!existingProfile) {
      await createUserProfile(
        user.uid,
        user.displayName || user.email?.split('@')[0] || 'User',
        user.email || ''
      );
    }

    return userCredential;
  } catch (error) {
    console.error('Error authenticating with Firebase:', error);
    throw error;
  }
}

/**
 * Email/Password - Sign up
 */
export async function signUpWithEmail(email, password, displayName) {
  let userCredential = null;
  
  try {
    // Step 1: Create Firebase Auth account
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('[Auth] Firebase Auth account created:', user.uid);

    // Step 2: Update Firebase Auth profile (optional, non-fatal)
    if (displayName) {
      try {
        await updateProfile(user, { displayName });
        console.log('[Auth] Firebase Auth displayName set');
      } catch (e) {
        // non-fatal
        console.warn('[Auth] Unable to set displayName on Auth profile:', e?.message);
      }
    }

    // Step 3: Create Firestore profile (CRITICAL - retry on failure)
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Auth] Creating Firestore profile (attempt ${attempt}/${maxRetries})...`);
        await createUserProfile(user.uid, displayName || email.split('@')[0], email);
        console.log('[Auth] ✓ Firestore profile created successfully');
        lastError = null;
        break; // Success!
      } catch (e) {
        lastError = e;
        console.error(`[Auth] Firestore profile creation failed (attempt ${attempt}):`, e.message);
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Auth] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If all retries failed, we have a problem
    if (lastError) {
      console.error('[Auth] ❌ CRITICAL: Failed to create Firestore profile after all retries');
      console.error('[Auth] User has Firebase Auth account but no Firestore profile');
      console.error('[Auth] Profile will be auto-created on next sign-in');
      // Don't throw - let them sign in, auto-repair will fix it
    }
    
    return userCredential;
  } catch (error) {
    // If Firebase Auth creation failed, there's nothing to clean up
    console.log('Sign up error:', error.code || error.message);
    const friendlyMessage = getErrorMessage(error);
    const enhancedError = new Error(friendlyMessage);
    enhancedError.code = error.code;
    throw enhancedError;
  }
}

/**
 * Email/Password - Sign in
 */
export async function signInWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Validate that Firestore profile exists and has required fields
    console.log('[Auth] Validating user profile...');
    const profile = await getUserProfile(user.uid);
    
    if (!profile) {
      // Profile doesn't exist - create it (likely failed during initial sign-up)
      console.warn('[Auth] User profile missing! Creating now...');
      await createUserProfile(
        user.uid,
        user.displayName || email.split('@')[0],
        user.email || email
      );
    } else if (!profile.userID || !profile.displayName || !profile.email) {
      // Profile exists but is missing required fields - repair it
      console.warn('[Auth] User profile incomplete! Repairing...');
      const updates = {};
      
      if (!profile.userID) updates.userID = user.uid;
      if (!profile.displayName) updates.displayName = user.displayName || email.split('@')[0];
      if (!profile.email) updates.email = user.email || email;
      
      const { updateUserProfile } = require('./firestore');
      await updateUserProfile(user.uid, updates);
      console.log('[Auth] Profile repaired:', updates);
    } else {
      console.log('[Auth] Profile validated ✓');
    }
    
    return userCredential;
  } catch (error) {
    // Log concise error info instead of full stack trace
    console.log('Sign in error:', error.code || error.message);
    const friendlyMessage = getErrorMessage(error);
    const enhancedError = new Error(friendlyMessage);
    enhancedError.code = error.code;
    throw enhancedError;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email) {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
  } catch (error) {
    // Log concise error info instead of full stack trace
    console.log('Password reset error:', error.code || error.message);
    const friendlyMessage = getErrorMessage(error);
    const enhancedError = new Error(friendlyMessage);
    enhancedError.code = error.code;
    throw enhancedError;
  }
}

/**
 * Anonymous sign-in (optional quick path)
 */
export async function signInGuest() {
  try {
    const cred = await signInAnonymously(auth);
    const user = cred.user;
    const existingProfile = await getUserProfile(user.uid);
    if (!existingProfile) {
      await createUserProfile(user.uid, 'Guest', '');
    }
    return cred;
  } catch (error) {
    console.error('Error with anonymous sign-in:', error);
    throw error;
  }
}

/**
 * Sign out current user
 * IMPORTANT: Clears FCM token to prevent notifications to wrong user
 */
export async function logout() {
  try {
    const user = auth.currentUser;
    
    // Clear FCM token BEFORE signing out to prevent token reuse
    if (user) {
      console.log('[Auth] Clearing FCM token for user:', user.uid);
      try {
        const { updateUserProfile } = require('./firestore');
        await updateUserProfile(user.uid, { 
          fcmToken: null,
          isOnline: false 
        });
        console.log('[Auth] FCM token cleared successfully');
      } catch (tokenError) {
        console.error('[Auth] Failed to clear FCM token:', tokenError);
        // Continue with logout even if token clearing fails
      }
    }
    
    await firebaseSignOut(auth);
    console.log('[Auth] User signed out successfully');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Subscribe to Firebase auth state changes
 */
export function subscribeToAuth(callback) {
  return firebaseAuthChanged(auth, (user) => {
    callback(user);
  });
}

/**
 * Google hook (unused by email/password flow but kept available)
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: config.webClientId,
    iosClientId: config.iosClientId,
    androidClientId: config.androidClientId,
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      authenticateWithGoogle(id_token);
    }
  }, [response]);

  return {
    promptAsync,
    loading: !request,
    error: response?.type === 'error' ? response.error : null,
  };
}

