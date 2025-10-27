// AI Summary Page - Shows global unread message summary
import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  RefreshControl, 
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../constants/colors';
import { summarizeUnreadGlobal } from '../../services/aiService';
import useUserStore from '../../store/userStore';

/**
 * Badge component for chat names in key points
 */
function ChatBadge({ chatName }) {
  return (
    <View style={styles.chatBadge}>
      <Text style={styles.chatBadgeText}>{chatName}</Text>
    </View>
  );
}

/**
 * Section component for organizing content
 */
function SummarySection({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function SummaryPage() {
  const router = useRouter();
  const { currentUser } = useUserStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Load summary on mount
  const loadSummary = useCallback(async (forceRefresh = false) => {
    if (!currentUser) return;
    
    try {
      setError(null);

      const result = await summarizeUnreadGlobal({
        forceRefresh,
        mode: 'rich', // Use rich mode for better summaries
      });

      if (result.success) {
        if (result.data?.hasUnread) {
          setSummary(result.data);
          setUnreadCount(result.data.totalMessageCount || 0);
        } else {
          // No unread messages
          setSummary(null);
          setUnreadCount(0);
        }
      } else {
        setError(result.message || 'Failed to load summary');
      }
    } catch (err) {
      console.error('[SummaryPage] Error loading summary:', err);
      setError('Failed to load summary. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  // Initial load
  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);
  
  // Pull to refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadSummary(true); // Force refresh
  }, [loadSummary]);

  // Navigate to chat
  const handleChatPress = (chatId) => {
    router.push(`/chat/${chatId}`);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading summary...</Text>
          <Text style={styles.loadingSubtext}>
            Analyzing your unread messages
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                loadSummary(true);
              }}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  // No unread messages state
  if (!summary || !summary.hasUnread) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={80} color={colors.primary} />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyText}>
              No unread messages to summarize
            </Text>
            <Text style={styles.emptySubtext}>
              Pull down to refresh
            </Text>
        </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  // Summary content
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header with unread count */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {unreadCount} Unread Message{unreadCount !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.headerSubtitle}>
            Across {summary.chatCount || 0} conversation{summary.chatCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Overall Summary */}
        {summary.summary && (
          <View style={styles.overallSummary}>
            <Text style={styles.overallSummaryText}>{summary.summary}</Text>
          </View>
        )}
        
        {/* Key Points */}
        {summary.keyPoints && summary.keyPoints.length > 0 && (
          <SummarySection title="Key Points" icon="list">
            {summary.keyPoints.map((point, index) => (
              <TouchableOpacity
                key={index}
                style={styles.listItem}
                onPress={() => point.chatId && handleChatPress(point.chatId)}
              >
                <View style={styles.listItemContent}>
                  <Text style={styles.bullet}>•</Text>
                  <View style={styles.listItemTextContainer}>
                    <Text style={styles.listItemText}>{point.text}</Text>
                    {point.chatName && <ChatBadge chatName={point.chatName} />}
                  </View>
                </View>
                {point.chatId && (
                  <Ionicons name="chevron-forward" size={20} color={colors.mediumGray} />
                )}
              </TouchableOpacity>
            ))}
          </SummarySection>
        )}

        {/* Decisions */}
        {summary.decisions && summary.decisions.length > 0 && (
          <SummarySection title="Decisions Made" icon="checkmark-circle">
            {summary.decisions.map((decision, index) => (
              <TouchableOpacity
                key={index}
                style={styles.listItem}
                onPress={() => decision.chatId && handleChatPress(decision.chatId)}
              >
                <View style={styles.listItemContent}>
                  <Text style={styles.decisionIcon}>✓</Text>
                  <View style={styles.listItemTextContainer}>
                    <Text style={styles.listItemText}>{decision.text}</Text>
                    {decision.chatName && <ChatBadge chatName={decision.chatName} />}
                  </View>
                </View>
                {decision.chatId && (
                  <Ionicons name="chevron-forward" size={20} color={colors.mediumGray} />
                )}
              </TouchableOpacity>
            ))}
          </SummarySection>
        )}

        {/* Action Items */}
        {summary.actionItems && summary.actionItems.length > 0 && (
          <SummarySection title="Action Items" icon="checkbox">
            {summary.actionItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.listItem}
                onPress={() => item.chatId && handleChatPress(item.chatId)}
              >
                <View style={styles.listItemContent}>
                  <View style={styles.checkboxIcon} />
                  <View style={styles.listItemTextContainer}>
                    <Text style={styles.listItemText}>{item.task || item.text}</Text>
                    {item.chatName && <ChatBadge chatName={item.chatName} />}
                  </View>
                </View>
                {item.chatId && (
                  <Ionicons name="chevron-forward" size={20} color={colors.mediumGray} />
                )}
              </TouchableOpacity>
            ))}
          </SummarySection>
        )}

        {/* Footer hint */}
        <Text style={styles.footerHint}>Pull down to refresh summary</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.mediumGray,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.primary,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.mediumGray,
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.mediumGray,
  },
  overallSummary: {
    backgroundColor: colors.primary + '15',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  overallSummaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  listItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listItemTextContainer: {
    flex: 1,
  },
  listItemText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 6,
  },
  bullet: {
    fontSize: 18,
    color: colors.primary,
    marginRight: 12,
    marginTop: 2,
  },
  decisionIcon: {
    fontSize: 16,
    color: colors.primary,
    marginRight: 12,
    marginTop: 3,
    fontWeight: '700',
  },
  checkboxIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 12,
    marginTop: 2,
  },
  chatBadge: {
    backgroundColor: colors.primary + '20',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  chatBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  footerHint: {
    marginTop: 16,
    marginHorizontal: 16,
    fontSize: 13,
    color: colors.mediumGray,
    textAlign: 'center',
  },
});
