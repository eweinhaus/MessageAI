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
import {useRouter} from "expo-router";
import {
  collection,
  query,
  where,
  onSnapshot,
  collectionGroup,
  doc,
  getDoc,
} from "firebase/firestore";
import {db} from "../../config/firebaseConfig";
import useUserStore from "../../store/userStore";
import ActionItemsList from "../../components/ActionItemsList";
import Icon from "../../components/Icon";
import colors from "../../constants/colors";
import {updateActionItemStatus} from "../../services/aiService";
import ErrorToast from "../../components/ErrorToast";

export default function GlobalActionItemsScreen() {
  const router = useRouter();
  const {currentUser} = useUserStore();
  const [actionItems, setActionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDecisionsOnly, setShowDecisionsOnly] = useState(false);
  const [error, setError] = useState(null);
  const [chatNames, setChatNames] = useState({});
  
  // Handler to navigate to chat with specific message
  const handleViewContext = (item) => {
    if (item.chatId && item.sourceMessageId) {
      router.push({
        pathname: `/chat/${item.chatId}`,
        params: { messageId: item.sourceMessageId }
      });
    }
  };
  
  // Handler to mark action item as complete
  const handleMarkComplete = async (itemId) => {
    try {
      // Find the item to get chatId
      const item = actionItems.find((i) => i.id === itemId);
      if (!item) {
        console.error("[Action Items] Item not found:", itemId);
        return;
      }

      console.log("[Action Items] Marking complete:", itemId);
      
      // Optimistically update UI
      setActionItems((prevItems) =>
        prevItems.map((i) =>
          i.id === itemId ? {...i, status: "completed"} : i,
        ),
      );

      const result = await updateActionItemStatus(
          item.chatId,
          itemId,
          "completed",
      );

      if (!result.success) {
        // Revert on failure
        setActionItems((prevItems) =>
          prevItems.map((i) =>
            i.id === itemId ? {...i, status: "pending"} : i,
          ),
        );
        setError(result.message || "Failed to mark item complete");
      }
    } catch (err) {
      console.error("[Action Items] Error marking complete:", err);
      setError("Failed to mark item complete");
      // Revert optimistic update
      setActionItems((prevItems) =>
        prevItems.map((i) =>
          i.id === itemId ? {...i, status: "pending"} : i,
        ),
      );
    }
  };
  
  // Handler to mark action item as pending (reopen)
  const handleMarkPending = async (itemId) => {
    try {
      const item = actionItems.find((i) => i.id === itemId);
      if (!item) {
        console.error("[Action Items] Item not found:", itemId);
        return;
      }

      console.log("[Action Items] Reopening:", itemId);
      
      // Optimistically update UI
      setActionItems((prevItems) =>
        prevItems.map((i) =>
          i.id === itemId ? {...i, status: "pending"} : i,
        ),
      );

      const result = await updateActionItemStatus(
          item.chatId,
          itemId,
          "pending",
      );

      if (!result.success) {
        // Revert on failure
        setActionItems((prevItems) =>
          prevItems.map((i) =>
            i.id === itemId ? {...i, status: "completed"} : i,
          ),
        );
        setError(result.message || "Failed to reopen item");
      }
    } catch (err) {
      console.error("[Action Items] Error reopening:", err);
      setError("Failed to reopen item");
      // Revert optimistic update
      setActionItems((prevItems) =>
        prevItems.map((i) =>
          i.id === itemId ? {...i, status: "completed"} : i,
        ),
      );
    }
  };

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

  // Fetch chat names for all unique chatIds
  useEffect(() => {
    if (actionItems.length === 0) return;

    const fetchChatNames = async () => {
      // Get unique chat IDs
      const uniqueChatIds = [...new Set(actionItems.map((item) => item.chatId))];
      const names = {...chatNames}; // Keep existing names

      // Fetch names for chats we don't have yet
      const fetchPromises = uniqueChatIds
          .filter((chatId) => chatId && !names[chatId])
          .map(async (chatId) => {
            try {
              const chatDoc = await getDoc(doc(db, "chats", chatId));
              if (chatDoc.exists()) {
                const data = chatDoc.data();
                // For 1:1 chats, use participant names
                // For group chats, use groupName
                const name = data.type === "group" ?
                  data.groupName :
                  data.participantNames?.join(" & ") || "Unknown Chat";
                return {chatId, name};
              }
              return {chatId, name: "Unknown Chat"};
            } catch (error) {
              console.error(`[Action Items] Failed to fetch chat ${chatId}:`, error);
              return {chatId, name: "Unknown Chat"};
            }
          });

      const results = await Promise.all(fetchPromises);
      results.forEach(({chatId, name}) => {
        names[chatId] = name;
      });

      setChatNames(names);
    };

    fetchChatNames();
  }, [actionItems]);

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
      {/* Error Toast */}
      {error && (
        <ErrorToast
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

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
            actionItems={filteredItems}
            loading={false}
            chatNames={chatNames}
            onViewMessage={handleViewContext}
            onMarkComplete={handleMarkComplete}
            onMarkPending={handleMarkPending}
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

