/**
 * Type Badge Component
 *
 * Displays a small badge showing the type of an action item
 * (commitment, question, or task) with appropriate icon and color.
 */

import React from "react";
import {View, Text, StyleSheet} from "react-native";
import colors from "../constants/colors";

/**
 * Type Badge Component
 * @param {Object} props
 * @param {string} props.type - Action item type: "commitment", "question", "task"
 * @param {Object} [props.style] - Additional style overrides
 */
export default function TypeBadge({type, style}) {
  const config = getTypeConfig(type);

  if (!config) {
    return null;
  }

  return (
    <View style={[styles.badge, {backgroundColor: config.color}, style]}>
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={styles.label}>{config.label}</Text>
    </View>
  );
}

/**
 * Get configuration for each action item type
 */
function getTypeConfig(type) {
  const configs = {
    commitment: {
      icon: "💪",
      label: "Commitment",
      color: "#34C759", // Green
    },
    question: {
      icon: "❓",
      label: "Question",
      color: "#5856D6", // Purple
    },
    task: {
      icon: "📋",
      label: "Task",
      color: "#007AFF", // Blue
    },
  };

  return configs[type];
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  icon: {
    fontSize: 12,
    marginRight: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.white,
  },
});

