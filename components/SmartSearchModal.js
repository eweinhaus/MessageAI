/**
 * Smart Search Modal Component
 *
 * Allows users to perform semantic search across chat messages.
 * Shows results with relevance scores, sender info, and jump-to-message functionality.
 */

import React, {useState} from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {PRIMARY_COLOR, BACKGROUND_COLOR, BORDER_COLOR, TEXT_GRAY} from "../constants/colors";

/**
 * Format timestamp for display
 * @param {any} timestamp - Firestore timestamp or Date
 * @return {string} Formatted date/time string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "";

  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 day ago - show time
    if (diff < 86400000) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    // Less than 7 days ago - show day and time
    if (diff < 604800000) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    // Older - show date
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch (e) {
    return "";
  }
}

/**
 * Get color for relevance score
 * @param {number} relevance - Relevance score (0-1)
 * @return {string} Color hex code
 */
function getRelevanceColor(relevance) {
  if (relevance >= 0.9) return "#4CAF50"; // Green - highly relevant
  if (relevance >= 0.7) return "#2196F3"; // Blue - relevant
  if (relevance >= 0.5) return "#FF9800"; // Orange - somewhat relevant
  return "#9E9E9E"; // Gray - low relevance
}

/**
 * Smart Search Modal
 *
 * @param {Object} props
 * @param {boolean} props.visible - Modal visibility
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onSearch - Search handler (query) => Promise
 * @param {Function} props.onJumpToMessage - Jump handler (messageId) => void
 * @param {boolean} props.loading - Loading state
 * @param {Array} props.results - Search results
 * @param {string} props.error - Error message
 */
export default function SmartSearchModal({
  visible,
  onClose,
  onSearch,
  onJumpToMessage,
  loading = false,
  results = [],
  error = null,
}) {
  const [query, setQuery] = useState("");

  const handleSearch = () => {
    if (query.trim().length === 0) return;
    Keyboard.dismiss();
    onSearch(query.trim());
  };

  const handleClear = () => {
    setQuery("");
  };

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const renderEmpty = () => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#f44336" />
          <Text style={styles.emptyTitle}>Search Error</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleSearch}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (results.length === 0 && query.trim().length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color="#bbb" />
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptyText}>
            Try different keywords or check your spelling
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search" size={64} color="#bbb" />
        <Text style={styles.emptyTitle}>Search Messages</Text>
        <Text style={styles.emptyText}>
          Enter a query to find relevant messages by meaning, not just keywords
        </Text>
        <View style={styles.exampleContainer}>
          <Text style={styles.exampleTitle}>Example queries:</Text>
          <Text style={styles.exampleText}>• "deployment date"</Text>
          <Text style={styles.exampleText}>• "who's responsible for..."</Text>
          <Text style={styles.exampleText}>• "bug fixes"</Text>
        </View>
      </View>
    );
  };

  const renderResultItem = ({item}) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => onJumpToMessage(item.messageID)}
    >
      {/* Header with sender and timestamp */}
      <View style={styles.resultHeader}>
        <View style={styles.senderInfo}>
          <Text style={styles.senderName}>{item.senderName || "Unknown"}</Text>
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>

        {/* Relevance badge */}
        <View
          style={[
            styles.relevanceBadge,
            {backgroundColor: getRelevanceColor(item.relevance)},
          ]}
        >
          <Text style={styles.relevanceText}>
            {Math.round(item.relevance * 100)}%
          </Text>
        </View>
      </View>

      {/* Message text */}
      <Text style={styles.messageText} numberOfLines={3}>
        {item.text}
      </Text>

      {/* Reason for relevance */}
      {item.reason && (
        <View style={styles.reasonContainer}>
          <Ionicons name="information-circle" size={14} color={TEXT_GRAY} />
          <Text style={styles.reasonText} numberOfLines={2}>
            {item.reason}
          </Text>
        </View>
      )}

      {/* Jump button */}
      <View style={styles.jumpButton}>
        <Ionicons name="arrow-forward" size={16} color={PRIMARY_COLOR} />
        <Text style={styles.jumpButtonText}>Jump to message</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Smart Search</Text>
          <View style={{width: 28}} />
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by meaning (e.g., 'deployment date')"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoFocus={false}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.searchButton,
              (loading || query.trim().length === 0) && styles.searchButtonDisabled,
            ]}
            onPress={handleSearch}
            disabled={loading || query.trim().length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results count */}
        {results.length > 0 && !loading && (
          <View style={styles.resultsCountContainer}>
            <Text style={styles.resultsCountText}>
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </Text>
          </View>
        )}

        {/* Results list */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            <Text style={styles.loadingText}>Searching messages...</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderResultItem}
            keyExtractor={(item, index) => item.messageID || `result-${index}`}
            contentContainerStyle={[
              styles.resultsList,
              results.length === 0 && styles.resultsListEmpty,
            ]}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={true}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === "ios" ? 60 : 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    backgroundColor: "#fff",
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: "#333",
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonDisabled: {
    backgroundColor: "#ccc",
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  resultsCountContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f9f9f9",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  resultsCountText: {
    fontSize: 14,
    color: TEXT_GRAY,
  },
  resultsList: {
    padding: 16,
  },
  resultsListEmpty: {
    flexGrow: 1,
  },
  resultCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  senderInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  senderName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginRight: 8,
  },
  timestamp: {
    fontSize: 13,
    color: TEXT_GRAY,
  },
  relevanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  relevanceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#333",
    marginBottom: 8,
  },
  reasonContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginBottom: 8,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_GRAY,
    fontStyle: "italic",
    marginLeft: 6,
  },
  jumpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  jumpButtonText: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    fontWeight: "600",
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: TEXT_GRAY,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: TEXT_GRAY,
    textAlign: "center",
    lineHeight: 21,
  },
  exampleContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    width: "100%",
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 14,
    color: TEXT_GRAY,
    marginBottom: 4,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

