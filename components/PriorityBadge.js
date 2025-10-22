/**
 * Priority Badge Component
 *
 * Displays a badge on urgent messages with the reason for urgency.
 * Shows a red pill badge with "!" icon, tappable to see full reason.
 * Includes optional dismiss functionality.
 */

import React, {useState} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
} from "react-native";
import colors from "../constants/colors";

/**
 * Badge tooltip/modal showing urgency reason
 */
function PriorityTooltip({visible, onClose, reason, confidence}) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.tooltipOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.tooltipContainer}>
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipIcon}>⚠️</Text>
            <Text style={styles.tooltipTitle}>Priority Message</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.tooltipClose}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            >
              <Text style={styles.tooltipCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.tooltipReason}>{reason}</Text>

          {confidence !== undefined && (
            <View style={styles.confidenceBar}>
              <Text style={styles.confidenceLabel}>
                Confidence: {Math.round(confidence * 100)}%
              </Text>
              <View style={styles.confidenceBarTrack}>
                <View
                  style={[
                    styles.confidenceBarFill,
                    {width: `${confidence * 100}%`},
                  ]}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.tooltipButton}
            onPress={onClose}
          >
            <Text style={styles.tooltipButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Main Priority Badge Component
 */
export default function PriorityBadge({
  priority,
  reason,
  confidence,
  onDismiss,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Only show badge for urgent messages
  if (priority !== "urgent") {
    return null;
  }

  const handlePress = () => {
    setShowTooltip(true);
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.badge}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <Text style={styles.badgeIcon}>!</Text>
          <Text style={styles.badgeText}>Urgent</Text>
        </TouchableOpacity>

        {onDismiss && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <PriorityTooltip
        visible={showTooltip}
        onClose={() => setShowTooltip(false)}
        reason={reason}
        confidence={confidence}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: "#FF3B30",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeIcon: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.white,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.white,
  },
  dismissButton: {
    marginLeft: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: {
    fontSize: 12,
    color: colors.mediumGray,
    fontWeight: "bold",
  },
  // Tooltip Modal Styles
  tooltipOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tooltipContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    maxWidth: 320,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  tooltipIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  tooltipTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  tooltipClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipCloseText: {
    fontSize: 16,
    color: colors.mediumGray,
    fontWeight: "600",
  },
  tooltipReason: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  confidenceBar: {
    marginBottom: 16,
  },
  confidenceLabel: {
    fontSize: 12,
    color: colors.mediumGray,
    marginBottom: 6,
  },
  confidenceBarTrack: {
    height: 6,
    backgroundColor: colors.lightGray,
    borderRadius: 3,
    overflow: "hidden",
  },
  confidenceBarFill: {
    height: "100%",
    backgroundColor: "#FF3B30",
    borderRadius: 3,
  },
  tooltipButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  tooltipButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
});

