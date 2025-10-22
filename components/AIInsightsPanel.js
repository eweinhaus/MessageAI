/**
 * AI Insights Panel Component
 *
 * Bottom sheet/modal displaying available AI features:
 * - Priority Detection
 * - Thread Summarization
 * - Action Item Extraction
 * - Smart Search
 * - Decision Tracking
 *
 * Shows loading states and handles errors gracefully.
 */

import React, {useState} from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import PressableWithFeedback from "./PressableWithFeedback";
import colors from "../constants/colors";

const {height: SCREEN_HEIGHT} = Dimensions.get("window");

/**
 * Individual AI feature button
 */
function AIFeatureButton({icon, title, description, onPress, disabled, loading}) {
  return (
    <PressableWithFeedback
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.featureButton, (disabled || loading) && styles.featureButtonDisabled]}
    >
      <View style={styles.featureIcon}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>

      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>

      {loading && (
        <ActivityIndicator size="small" color={colors.primary} />
      )}

      {!loading && (
        <Text style={styles.featureArrow}>›</Text>
      )}
    </PressableWithFeedback>
  );
}

/**
 * Main AI Insights Panel Component
 */
export default function AIInsightsPanel({
  visible,
  onClose,
  onAnalyzePriorities,
  onSummarizeThread,
  onExtractActionItems,
  onSmartSearch,
  onTrackDecisions,
  loading = {},
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.bottomSheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerContent}>
              <Text style={styles.headerIcon}>🧠</Text>
              <Text style={styles.headerTitle}>AI Insights</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Feature List */}
          <ScrollView
            style={styles.featureList}
            contentContainerStyle={styles.featureListContent}
            showsVerticalScrollIndicator={false}
          >
            <AIFeatureButton
              icon="🛑"
              title="Priority Detection"
              description="Flag urgent messages that need attention"
              onPress={onAnalyzePriorities}
              loading={loading.priorities}
            />

            <AIFeatureButton
              icon="📝"
              title="Summarize Thread"
              description="Get key points, decisions, and action items"
              onPress={onSummarizeThread}
              loading={loading.summary}
            />

            <AIFeatureButton
              icon="✅"
              title="Find Action Items"
              description="See tasks, commitments, and questions"
              onPress={onExtractActionItems}
              loading={loading.actionItems}
            />

            <AIFeatureButton
              icon="🔍"
              title="Smart Search"
              description="Find messages by meaning, not just keywords"
              onPress={onSmartSearch}
              loading={loading.search}
            />

            <AIFeatureButton
              icon="🎯"
              title="Track Decisions"
              description="See what the team has agreed on"
              onPress={onTrackDecisions}
              loading={loading.decisions}
            />
          </ScrollView>

          {/* Footer Note */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              AI features use GPT-4 and are cached for 24 hours
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
    alignItems: "center",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.mediumGray,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  closeButton: {
    position: "absolute",
    right: 20,
    top: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: colors.mediumGray,
    fontWeight: "600",
  },
  featureList: {
    flex: 1,
  },
  featureListContent: {
    padding: 16,
  },
  featureButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.lightGray,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  featureButtonDisabled: {
    opacity: 0.6,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  featureIconText: {
    fontSize: 24,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: colors.mediumGray,
  },
  featureArrow: {
    fontSize: 28,
    color: colors.mediumGray,
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
    backgroundColor: colors.background,
  },
  footerText: {
    fontSize: 12,
    color: colors.mediumGray,
    textAlign: "center",
  },
});

