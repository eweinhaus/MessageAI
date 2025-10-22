// Login Screen - Email/Password Auth
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
import { signInWithEmail, signUpWithEmail } from '../../services/auth';
import useUserStore from '../../store/userStore';

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, setError, clearError } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);

  // Email/password form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  // Google OAuth disabled for MVP - can be re-enabled post-MVP
  // See git history or OAUTH_SETUP_NOTES.md for implementation details

  // Redirect to main app if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

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

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>MVP Build - Email/Password Auth</Text>
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
