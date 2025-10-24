// Global Smart Search Tab
import React, {useState} from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import Icon from "../../components/Icon";
import colors from "../../constants/colors";
import {searchMessagesGlobal} from "../../services/aiService";

export default function GlobalSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [stage, setStage] = useState(null); // "stage1" or "stage2"

  // Suggested searches
  const suggestedQueries = [
    "When is the deadline for the proposal?",
    "Who volunteered to review the document?",
    "What did we decide about the budget?",
    "Messages about the client meeting",
  ];

  const handleSearch = async () => {
    if (!query.trim() || query.length < 2) {
      return;
    }

    Keyboard.dismiss();
    setIsSearching(true);
    setResults([]);
    setStage(null);

    try {
      // Stage 1: Fast search
      console.log("[Search] Starting stage 1 (fast)...");
      const stage1Result = await searchMessagesGlobal(query, "stage1");

      if (stage1Result.success && stage1Result.data) {
        setResults(stage1Result.data.results || []);
        setStage("stage1");
        console.log(`[Search] Stage 1 complete: ${stage1Result.data.results?.length || 0} results`);
      }

      setIsSearching(false);

      // Stage 2: Deep search (automatically after stage 1)
      if (stage1Result.success) {
        setIsRefining(true);
        console.log("[Search] Starting stage 2 (deep)...");

        const stage2Result = await searchMessagesGlobal(query, "stage2");

        if (stage2Result.success && stage2Result.data) {
          setResults(stage2Result.data.results || []);
          setStage("stage2");
          console.log(`[Search] Stage 2 complete: ${stage2Result.data.results?.length || 0} results`);
        }

        setIsRefining(false);
      }
    } catch (error) {
      console.error("[Search] Error:", error);
      setIsSearching(false);
      setIsRefining(false);
    }
  };

  const handleSuggestedQuery = (suggestedQuery) => {
    setQuery(suggestedQuery);
    handleSearch();
  };

  const renderResult = ({item}) => {
    const timestamp = new Date(item.timestamp);
    const timeStr = timestamp.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Relevance badge color
    const relevanceColor =
      item.relevance >= 0.9 ? "#4CAF50" :
      item.relevance >= 0.7 ? "#FF9800" :
      "#999";

    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => {
          // Navigate to chat with message highlighted
          router.push(`/chat/${item.chatID}`);
        }}
      >
        <View style={styles.resultHeader}>
          <View style={[styles.relevanceBadge, {backgroundColor: relevanceColor}]}>
            <Text style={styles.relevanceText}>
              {Math.round(item.relevance * 100)}%
            </Text>
          </View>
          <Text style={styles.chatName}>{item.chatName}</Text>
        </View>

        <Text style={styles.messageText} numberOfLines={3}>
          {item.text}
        </Text>

        <View style={styles.resultFooter}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          <Text style={styles.timestamp}>{timeStr}</Text>
        </View>

        {item.reason && (
          <Text style={styles.reason} numberOfLines={2}>
            💡 {item.reason}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={24} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages by meaning..."
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.searchButton, (!query.trim() || isSearching) && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={!query.trim() || isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sparkles" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Status indicator */}
      {isRefining && (
        <View style={styles.statusBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>
            Refining results ({results.length} found)...
          </Text>
        </View>
      )}

      {/* Content */}
      {results.length === 0 && !isSearching && !query ? (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggested Searches:</Text>
          {suggestedQueries.map((suggestedQuery, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionCard}
              onPress={() => {
                setQuery(suggestedQuery);
              }}
            >
              <Icon name="search-outline" size={20} color={colors.primary} />
              <Text style={styles.suggestionText}>{suggestedQuery}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : results.length === 0 && !isSearching ? (
        <View style={styles.emptyContainer}>
          <Icon name="search-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>
            Try a different search query
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item, index) => `${item.messageID}-${index}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {results.length} result{results.length !== 1 ? "s" : ""}
              </Text>
              {stage && (
                <Text style={styles.stageIndicator}>
                  {stage === "stage1" ? "Fast Search" : "Deep Search"}
                </Text>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    alignItems: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonDisabled: {
    backgroundColor: "#ccc",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: "#f0f8ff",
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.primary,
  },
  suggestionsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 16,
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    marginBottom: 12,
  },
  suggestionText: {
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  resultsCount: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  stageIndicator: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
  },
  resultCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  relevanceBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 12,
  },
  relevanceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  chatName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  messageText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  resultFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  senderName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
  },
  reason: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});

