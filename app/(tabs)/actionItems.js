// Global Action Items Tab
import React, {useEffect, useState} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {collection, query, where, onSnapshot, collectionGroup} from "firebase/firestore";
import {db} from "../../config/firebaseConfig";
import useUserStore from "../../store/userStore";
import ActionItemsList from "../../components/ActionItemsList";
import Icon from "../../components/Icon";
import colors from "../../constants/colors";

export default function GlobalActionItemsScreen() {
  const {currentUser} = useUserStore();
  const [actionItems, setActionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDecisionsOnly, setShowDecisionsOnly] = useState(false);

  // Real-time listener for all action items
  useEffect(() => {
    if (!currentUser) return;

    console.log("[Global Action Items] Setting up listener for user:", currentUser.userID);

    // Collection group query for all action items across all chats
    const actionItemsQuery = query(
        collectionGroup(db, "actionItems"),
        where("userId", "==", currentUser.userID),
    );

    const unsubscribe = onSnapshot(
        actionItemsQuery,
        (snapshot) => {
          const items = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            items.push({
              id: doc.id,
              ...data,
              // Normalize timestamps
              createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
              completedAt: data.completedAt?.toMillis?.() || data.completedAt || null,
              deadline: data.deadline?.toMillis?.() || data.deadline || null,
            });
          });

          console.log(`[Global Action Items] Fetched ${items.length} action items`);
          setActionItems(items);
          setIsLoading(false);
        },
        (error) => {
          console.error("[Global Action Items] Listener error:", error);
          setIsLoading(false);
        },
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Filter items based on decision toggle
  const filteredItems = showDecisionsOnly ?
    actionItems.filter((item) => item.isDecision === true) :
    actionItems;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading action items...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Header with filter toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {showDecisionsOnly ? "Decisions" : "Action Items"}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filteredItems.length}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.filterButton,
            showDecisionsOnly && styles.filterButtonActive,
          ]}
          onPress={() => setShowDecisionsOnly(!showDecisionsOnly)}
        >
          <Icon
            name={showDecisionsOnly ? "checkbox" : "checkbox-outline"}
            size={20}
            color={showDecisionsOnly ? "#fff" : colors.primary}
          />
          <Text
            style={[
              styles.filterText,
              showDecisionsOnly && styles.filterTextActive,
            ]}
          >
            Decisions Only
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Items List */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon
            name={showDecisionsOnly ? "checkbox-outline" : "list-outline"}
            size={64}
            color="#ccc"
          />
          <Text style={styles.emptyText}>
            {showDecisionsOnly ?
              "No decisions tracked yet" :
              "No action items yet"}
          </Text>
          <Text style={styles.emptySubtext}>
            {showDecisionsOnly ?
              "Decisions from your chats will appear here" :
              "Action items from your chats will appear here"}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.listContainer}>
          <ActionItemsList
            items={filteredItems}
            chatId={null} // Global view, no specific chat
            onViewContext={null} // TODO: Implement navigation to source message
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  countBadge: {
    marginLeft: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: "center",
  },
  countText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#fff",
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  filterTextActive: {
    color: "#fff",
  },
  listContainer: {
    flex: 1,
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

