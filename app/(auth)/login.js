// Login Screen - Google Sign-In + Email/Password
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import { authenticateWithGoogle, signInWithEmail, signUpWithEmail } from '../../services/auth';
import useUserStore from '../../store/userStore';

// Complete the web browser session
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, setError, clearError } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);

  // Email/password form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  // Build explicit redirect URI (Expo AuthSession proxy) with app scheme
  const redirectUri = makeRedirectUri({ scheme: 'messageai', useProxy: true });
  useEffect(() => {
    console.log('Auth redirect URI:', redirectUri);
  }, [redirectUri]);

  // Configure Google authentication
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    responseType: ResponseType.IdToken,
    scopes: ['openid', 'email', 'profile'],
    redirectUri,
  });

  // Handle Google authentication response
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        console.error('Google auth success but missing id_token:', response);
        setError('Missing id_token in Google auth response');
        setIsLoading(false);
        return;
      }
      handleGoogleSignIn(idToken);
    } else if (response?.type === 'error') {
      console.error('Google auth error:', response.error);
      setError(response.error);
      Alert.alert('Authentication Error', 'Failed to sign in with Google. Please try again.', [{ text: 'OK' }]);
      setIsLoading(false);
    } else if (response?.type === 'cancel') {
      setIsLoading(false);
    }
  }, [response]);

  // Redirect to main app if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  const handleGoogleSignIn = async (idToken) => {
    try {
      setIsLoading(true);
      clearError();
      await authenticateWithGoogle(idToken);
    } catch (error) {
      console.error('Error signing in:', error);
      setError(error);
      Alert.alert('Sign In Failed', error.message || 'Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    try {
      if (!email || !password || (mode === 'signup' && !displayName)) {
        Alert.alert('Missing info', 'Please fill all fields.');
        return;
      }
      setIsLoading(true);
      clearError();
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password, displayName.trim());
      }
    } catch (error) {
      console.error('Email auth error:', error);
      setError(error);
      Alert.alert('Auth Error', error.message || 'Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignInPress = async () => {
    try {
      setIsLoading(true);
      clearError();
      await promptAsync({ useProxy: true, redirectUri });
    } catch (error) {
      console.error('Error prompting Google sign-in:', error);
      setError(error);
      setIsLoading(false);
      Alert.alert('Sign In Error', 'Failed to open sign-in prompt. Please try again.', [{ text: 'OK' }]);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
      {/* App Branding */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>💬</Text>
        </View>
        <Text style={styles.appName}>MessageAI</Text>
        <Text style={styles.tagline}>Simple messaging, powered by AI</Text>
      </View>

      {/* Email/Password Section */}
      <View style={styles.form}>
        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            placeholder="Display name"
            autoCapitalize="words"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleEmailAuth} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          <Text style={styles.switchText}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.divider} />
      </View>

      {/* Google Sign-In Section */}
      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.signInButton, (isLoading || !request) && styles.signInButtonDisabled]}
          onPress={handleSignInPress}
          disabled={isLoading || !request}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.signInButtonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>MVP Build - Email/Password + Google</Text>
      </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 10,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#000', marginBottom: 6 },
  tagline: { fontSize: 14, color: '#666' },

  form: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#2563EB',
    textAlign: 'center',
    marginTop: 12,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 18,
  },
  divider: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { marginHorizontal: 12, color: '#999', fontSize: 12 },

  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 16,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    maxWidth: 300,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  signInButtonDisabled: { backgroundColor: '#ccc', elevation: 0 },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 12,
    backgroundColor: '#fff',
    color: '#4285F4',
    width: 24,
    height: 24,
    textAlign: 'center',
    lineHeight: 24,
    borderRadius: 12,
  },
  signInButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  footer: { paddingVertical: 24, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#999' },
});
