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
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (displayName) {
      try {
        await updateProfile(user, { displayName });
      } catch (e) {
        // non-fatal
        console.warn('Unable to set displayName on profile:', e?.message);
      }
    }

    await createUserProfile(user.uid, displayName || email.split('@')[0], email);
    return userCredential;
  } catch (error) {
    console.error('Error signing up with email:', error);
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
    return userCredential;
  } catch (error) {
    console.error('Error signing in with email:', error);
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
    console.error('Error sending password reset email:', error);
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
 */
export async function logout() {
  try {
    await firebaseSignOut(auth);
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

