/**
 * SummaryModal Component
 * 
 * Displays AI-generated conversation summaries with:
 * - Key points
 * - Decisions made
 * - Action items
 * - Participant statistics
 * - Overall summary
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import colors from '../constants/colors';

/**
 * Format timestamp for display
 * @param {Object} timestamp - Firestore timestamp or date
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * SummaryModal component
 */
export default function SummaryModal({
  visible,
  onClose,
  summary,
  loading,
  error,
  onRefresh,
}) {
  // Loading state
  if (loading) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Summarizing conversation...</Text>
              <Text style={styles.loadingSubtext}>
                This may take a few seconds
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Error state
  if (error) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Empty state - don't render if modal not visible or no data
  if (!visible || !summary) {
    return null;
  }

  const hasKeyPoints = summary.keyPoints && summary.keyPoints.length > 0;
  const hasDecisions = summary.decisions && summary.decisions.length > 0;
  const hasActionItems = summary.actionItems && summary.actionItems.length > 0;
  const hasParticipants = summary.participants && summary.participants.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerIcon}>📝</Text>
              <Text style={styles.headerTitle}>Thread Summary</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
            {/* Overview Section */}
            {summary.summary && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Overview</Text>
                <View style={styles.overviewCard}>
                  <Text style={styles.summaryText}>{summary.summary}</Text>
                </View>
              </View>
            )}

            {/* Key Points Section */}
            {hasKeyPoints && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Key Points ({summary.keyPoints.length})
                </Text>
                {summary.keyPoints.map((point, index) => (
                  <View key={index} style={styles.bulletItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{point}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Decisions Section */}
            {hasDecisions && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Decisions Made ({summary.decisions.length})
                </Text>
                {summary.decisions.map((decision, index) => (
                  <View key={index} style={styles.decisionCard}>
                    <Text style={styles.decisionIcon}>✓</Text>
                    <Text style={styles.decisionText}>{decision}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action Items Section */}
            {hasActionItems && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Action Items ({summary.actionItems.length})
                </Text>
                {summary.actionItems.map((item, index) => (
                  <View key={index} style={styles.actionCard}>
                    <Text style={styles.actionTask}>{item.task}</Text>
                    <View style={styles.actionMetaContainer}>
                      {item.assignee && (
                        <View style={styles.actionMeta}>
                          <Text style={styles.actionMetaIcon}>👤</Text>
                          <Text style={styles.actionMetaText}>{item.assignee}</Text>
                        </View>
                      )}
                      {item.deadline && (
                        <View style={styles.actionMeta}>
                          <Text style={styles.actionMetaIcon}>📅</Text>
                          <Text style={styles.actionMetaText}>{item.deadline}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Participants Section */}
            {hasParticipants && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Most Active Participants</Text>
                <View style={styles.participantList}>
                  {summary.participants.slice(0, 5).map((participant, index) => (
                    <View key={index} style={styles.participantItem}>
                      <Text style={styles.participantName}>{participant.name}</Text>
                      <Text style={styles.participantCount}>
                        {participant.messageCount} message{participant.messageCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Cache Info */}
            {summary.cached && summary.createdAt && (
              <View style={styles.cacheInfoContainer}>
                <Text style={styles.cacheInfo}>
                  📦 Cached result • Updated {formatTime(summary.createdAt)}
                </Text>
              </View>
            )}

            {/* Empty sections message */}
            {!hasKeyPoints && !hasDecisions && !hasActionItems && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No key insights found in this conversation yet.
                </Text>
              </View>
            )}

            {/* Bottom padding for scroll */}
            <View style={{height: 20}} />
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
            >
              <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={onClose}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // Loading state
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  
  // Error state
  errorContainer: {
    padding: 32,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  closeIcon: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  
  // Content
  scrollView: {
    flex: 1,
  },
  
  // Sections
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  
  // Overview
  overviewCard: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  
  // Key Points
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    fontSize: 16,
    color: colors.primary,
    marginRight: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  
  // Decisions
  decisionCard: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  decisionIcon: {
    fontSize: 18,
    color: '#4caf50',
    marginRight: 10,
    marginTop: 1,
  },
  decisionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#2e7d32',
    fontWeight: '500',
  },
  
  // Action Items
  actionCard: {
    backgroundColor: '#fff3e0',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  actionTask: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e65100',
    fontWeight: '500',
    marginBottom: 8,
  },
  actionMetaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionMetaIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  actionMetaText: {
    fontSize: 14,
    color: '#666',
  },
  
  // Participants
  participantList: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 4,
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  participantName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  participantCount: {
    fontSize: 14,
    color: '#666',
  },
  
  // Cache info
  cacheInfoContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cacheInfo: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  
  // Empty state
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
  },
  
  // Actions
  actions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  refreshButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  doneButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

