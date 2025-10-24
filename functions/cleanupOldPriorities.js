/**
 * Cleanup Old Priorities Cloud Function
 *
 * Scheduled function that runs daily to remove old priority analysis data
 * Deletes priorities older than 7 days to keep Firestore tidy
 *
 * @module functions/cleanupOldPriorities
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

/**
 * Cleanup old priorities (scheduled daily)
 * Removes priority documents older than 7 days
 *
 * Schedule: Runs every day at 2:00 AM UTC
 */
exports.cleanupOldPriorities = onSchedule(
    {
      schedule: "0 2 * * *", // Daily at 2:00 AM UTC
      timeZone: "UTC",
      region: "us-central1",
    },
    async (event) => {
      const startTime = Date.now();
      logger.info("[Cleanup] Starting priority cleanup job");

      try {
        // Calculate cutoff timestamp (7 days ago)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const cutoffDate = admin.firestore.Timestamp.fromMillis(sevenDaysAgo);

        logger.info(
            `[Cleanup] Deleting priorities older than ${cutoffDate.toDate()}`,
        );

        // Query all priorities across all chats older than cutoff
        const prioritiesQuery = admin.firestore()
            .collectionGroup("priorities")
            .where("analyzedAt", "<", cutoffDate)
            .limit(500); // Process in batches to avoid timeout

        const snapshot = await prioritiesQuery.get();

        if (snapshot.empty) {
          logger.info("[Cleanup] No old priorities found");
          return {
            deleted: 0,
            duration: Date.now() - startTime,
          };
        }

        logger.info(
            "[Cleanup] Found " + snapshot.size + " old priorities " +
            "to delete",
        );

        // Delete in batches (Firestore batch limit is 500)
        const batch = admin.firestore().batch();
        let deleteCount = 0;

        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deleteCount++;
        });

        await batch.commit();

        const duration = Date.now() - startTime;
        logger.info(
            `[Cleanup] Deleted ${deleteCount} priorities in ${duration}ms`,
        );

        return {
          deleted: deleteCount,
          duration,
          cutoffDate: cutoffDate.toDate().toISOString(),
        };
      } catch (error) {
        logger.error("[Cleanup] Error during cleanup:", error);
        throw error;
      }
    },
);

