/**
 * Action Items List Component
 *
 * Displays a scrollable list of action items extracted from conversation.
 * Shows task, assignee, deadline, type badge, priority badge, and actions.
 * Supports filtering by status and sorting by priority/deadline.
 */

import React, {useState} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Icon from "./Icon";
import TypeBadge from "./TypeBadge";
import colors from "../constants/colors";

/**
 * Format date/time string for display
 */
function formatDeadline(deadline) {
  if (!deadline) return null;

  // If it's already a descriptive string (like "EOD", "tomorrow"), use it
  if (typeof deadline === "string" && deadline.length < 30) {
    return deadline;
  }

  // Otherwise try to parse and format
  try {
    const date = new Date(deadline);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  } catch (e) {
    // Fall through to return original string
  }

  return deadline;
}

/**
 * Single Action Item Card
 */
function ActionItemCard({
  item,
  onViewMessage,
  onMarkComplete,
  onMarkPending,
}) {
  const isCompleted = item.status === "completed";

  // Priority color
  const priorityColors = {
    high: "#FF3B30",
    medium: "#FF9500",
    low: "#8E8E93",
  };

  return (
    <View style={[styles.card, isCompleted && styles.cardCompleted]}>
      {/* Header: Type and Priority */}
      <View style={styles.cardHeader}>
        <TypeBadge type={item.type} style={styles.typeBadge} />
        <View style={[
          styles.priorityDot,
          {backgroundColor: priorityColors[item.priority]},
        ]} />
        <Text style={styles.priorityText}>
          {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
        </Text>
      </View>

      {/* Task */}
      <Text style={[styles.taskText, isCompleted && styles.taskTextCompleted]}>
        {item.task}
      </Text>

      {/* Assignee */}
      {item.assignee && (
        <View style={styles.metaRow}>
          <Icon name="person" size="small" color={colors.mediumGray} />
          <Text style={styles.metaText}>{item.assignee}</Text>
        </View>
      )}

      {/* Deadline */}
      {item.deadline && (
        <View style={styles.metaRow}>
          <Icon name="calendar" size="small" color={colors.mediumGray} />
          <Text style={styles.metaText}>
            {formatDeadline(item.deadline)}
          </Text>
        </View>
      )}

      {/* Context */}
      {item.context && (
        <Text style={styles.contextText} numberOfLines={2}>
          {item.context}
        </Text>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onViewMessage && onViewMessage(item)}
        >
          <Icon name="search" size="small" color={colors.primary} />
          <Text style={styles.actionButtonText}>View Context</Text>
        </TouchableOpacity>

        {!isCompleted ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryActionButton]}
            onPress={() => onMarkComplete(item.id)}
          >
            <Icon name="checkmark" size="small" color={colors.white} />
            <Text style={styles.primaryActionButtonText}>Mark Done</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onMarkPending(item.id)}
          >
            <Icon name="refresh" size="small" color={colors.mediumGray} />
            <Text style={styles.actionButtonText}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * Filter Tabs
 */
function FilterTabs({activeFilter, onFilterChange}) {
  const filters = [
    {key: "all", label: "All"},
    {key: "pending", label: "Pending"},
    {key: "completed", label: "Completed"},
  ];

  return (
    <View style={styles.filterTabs}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[
            styles.filterTab,
            activeFilter === filter.key && styles.filterTabActive,
          ]}
          onPress={() => onFilterChange(filter.key)}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === filter.key && styles.filterTabTextActive,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Sort Buttons
 */
function SortButtons({activeSort, onSortChange}) {
  const sorts = [
    {key: "priority", label: "Priority", icon: "warning"},
    {key: "deadline", label: "Deadline", icon: "calendar"},
  ];

  return (
    <View style={styles.sortButtons}>
      <Text style={styles.sortLabel}>Sort by:</Text>
      {sorts.map((sort) => (
        <TouchableOpacity
          key={sort.key}
          style={[
            styles.sortButton,
            activeSort === sort.key && styles.sortButtonActive,
          ]}
          onPress={() => onSortChange(sort.key)}
        >
          <Icon
            name={sort.icon}
            size="small"
            color={activeSort === sort.key ? colors.primary : colors.mediumGray}
          />
          <Text
            style={[
              styles.sortButtonText,
              activeSort === sort.key && styles.sortButtonTextActive,
            ]}
          >
            {sort.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Main Action Items List Component
 */
export default function ActionItemsList({
  actionItems = [],
  loading = false,
  onViewMessage,
  onMarkComplete,
  onMarkPending,
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("priority");

  // Filter items
  const filteredItems = actionItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "pending") return item.status === "pending";
    if (filter === "completed") return item.status === "completed";
    return true;
  });

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sort === "priority") {
      const priorityOrder = {high: 0, medium: 1, low: 2};
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    } else if (sort === "deadline") {
      // Items with deadlines first, then sort by deadline
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;

      try {
        const dateA = new Date(a.deadline);
        const dateB = new Date(b.deadline);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateA - dateB;
        }
      } catch (e) {
        // Fall through to string comparison
      }

      return a.deadline.localeCompare(b.deadline);
    }
    return 0;
  });

  // Empty state
  if (!loading && sortedItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <FilterTabs activeFilter={filter} onFilterChange={setFilter} />
        <View style={styles.emptyContent}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>
            {filter === "all" ? "No Action Items" : `No ${filter} items`}
          </Text>
          <Text style={styles.emptyMessage}>
            {filter === "all" ?
              "No action items found in this conversation." :
              `There are no ${filter} action items.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filters and Sort */}
      <FilterTabs activeFilter={filter} onFilterChange={setFilter} />
      <SortButtons activeSort={sort} onSortChange={setSort} />

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Analyzing conversation...</Text>
        </View>
      )}

      {/* Items List */}
      {!loading && (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {sortedItems.map((item, index) => (
            <ActionItemCard
              key={item.id || index}
              item={item}
              onViewMessage={onViewMessage}
              onMarkComplete={onMarkComplete}
              onMarkPending={onMarkPending}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Filter Tabs
  filterTabs: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: colors.lightGray,
    borderRadius: 12,
    marginBottom: 12,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: colors.white,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.mediumGray,
  },
  filterTabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  // Sort Buttons
  sortButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sortLabel: {
    fontSize: 13,
    color: colors.mediumGray,
    marginRight: 8,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.lightGray,
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.mediumGray,
    marginLeft: 4,
  },
  sortButtonTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  // Scroll View
  scrollView: {
    flex: 1,
  },
  // Action Item Card
  card: {
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
  cardCompleted: {
    opacity: 0.6,
    borderColor: colors.mediumGray,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  typeBadge: {
    marginRight: 8,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.mediumGray,
  },
  taskText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  taskTextCompleted: {
    textDecorationLine: "line-through",
    color: colors.mediumGray,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  metaText: {
    fontSize: 14,
    color: colors.mediumGray,
    marginLeft: 6,
  },
  contextText: {
    fontSize: 13,
    color: colors.mediumGray,
    fontStyle: "italic",
    marginTop: 8,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.lightGray,
    flex: 1,
    marginRight: 8,
    justifyContent: "center",
  },
  primaryActionButton: {
    backgroundColor: colors.primary,
    marginRight: 0,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    marginLeft: 4,
  },
  primaryActionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.white,
    marginLeft: 4,
  },
  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.mediumGray,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
  },
  emptyContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: colors.mediumGray,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

