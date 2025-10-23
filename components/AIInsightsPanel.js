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
import Icon from "./Icon";
import colors from "../constants/colors";

const {height: SCREEN_HEIGHT} = Dimensions.get("window");

/**
 * Individual AI feature button
 */
function AIFeatureButton({iconName, title, description, onPress, disabled, loading}) {
  return (
    <PressableWithFeedback
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.featureButton, (disabled || loading) && styles.featureButtonDisabled]}
    >
      <View style={styles.featureIconWrapper}>
        <View style={styles.featureIconBg}>
          <Icon name={iconName} size={20} color={colors.primary} />
        </View>
      </View>

      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>

      {loading && (
        <ActivityIndicator size="small" color={colors.primary} />
      )}

      {!loading && (
        <Icon name="chevronRight" size={24} color={colors.mediumGray} />
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
              <View style={styles.headerStatusDot} />
              <Text style={styles.headerTitle}>AI Insights</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            >
              <Icon name="close" size="medium" color={colors.mediumGray} />
            </TouchableOpacity>
          </View>

          {/* Feature List */}
          <ScrollView
            style={styles.featureList}
            contentContainerStyle={styles.featureListContent}
            showsVerticalScrollIndicator={false}
          >
            <AIFeatureButton
              iconName="alert"
              title="Priority Detection"
              description="Flag urgent messages that need attention"
              onPress={onAnalyzePriorities}
              loading={loading.priorities}
            />

            <AIFeatureButton
              iconName="document"
              title="Summarize Thread"
              description="Get key points, decisions, and action items"
              onPress={onSummarizeThread}
              loading={loading.summary}
            />

            <AIFeatureButton
              iconName="checkCircle"
              title="Find Action Items"
              description="See tasks, commitments, and questions"
              onPress={onExtractActionItems}
              loading={loading.actionItems}
            />

            <AIFeatureButton
              iconName="search"
              title="Smart Search"
              description="Find messages by meaning, not just keywords"
              onPress={onSmartSearch}
              loading={loading.search}
            />

            <AIFeatureButton
              iconName="target"
              title="Track Decisions"
              description="See what the team has agreed on"
              onPress={onTrackDecisions}
              loading={loading.decisions}
            />
          </ScrollView>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SCREEN_HEIGHT * 0.7,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
    alignItems: "center",
  },
  dragHandle: {
    width: 44,
    height: 4,
    backgroundColor: colors.mediumGray,
    borderRadius: 2,
    marginBottom: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerStatusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.primaryLight,
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
  featureIconWrapper: {
    width: 48,
    alignItems: "center",
    marginRight: 12,
  },
  featureIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
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
});

