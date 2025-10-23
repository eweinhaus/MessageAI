/**
 * Cloud Functions for MessageAI
 *
 * This function triggers when a new message is written to Firestore
 * and sends push notifications to all recipients (excluding the sender).
 */

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const https = require("https");

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for cost control
setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

/**
 * Helper function to send push notification via Expo Push Service
 * Supports both Expo push tokens and native FCM tokens
 * @param {string} token - Push token (Expo or FCM format)
 * @param {object} notification - Notification data {title, body}
 * @param {object} data - Additional data payload
 * @return {Promise<object>} - Result of push send
 */
async function sendPushNotification(token, notification, data) {
  // Check if this is an Expo push token
  const isExpoToken = token.startsWith("ExponentPushToken[");

  if (isExpoToken) {
    // Send via Expo Push Service
    return sendExpoNotification(token, notification, data);
  } else {
    // Send via FCM (for native builds)
    return sendFCMNotification(token, notification, data);
  }
}

/**
 * Send notification via Expo Push Service
 * @param {string} expoPushToken - Expo push token
 * @param {object} notification - {title, body}
 * @param {object} data - Additional data
 * @return {Promise<object>} - Result
 */
function sendExpoNotification(expoPushToken, notification, data) {
  return new Promise((resolve, reject) => {
    const message = {
      to: expoPushToken,
      sound: "default",
      title: notification.title,
      body: notification.body,
      data: data,
      priority: "high",
      channelId: "messages",
    };

    const postData = JSON.stringify(message);

    const options = {
      hostname: "exp.host",
      port: 443,
      path: "/--/api/v2/push/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(responseData);
          if (response.data && response.data.status === "ok") {
            resolve({success: true, response});
          } else {
            reject(new Error(`Expo push failed: ${responseData}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Expo response: ${responseData}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send notification via Firebase Cloud Messaging
 * @param {string} fcmToken - FCM token
 * @param {object} notification - {title, body}
 * @param {object} data - Additional data
 * @return {Promise<string>} - Message ID
 */
async function sendFCMNotification(fcmToken, notification, data) {
  // Ensure all data values are strings (FCM requirement)
  const stringifiedData = {};
  for (const [key, value] of Object.entries(data)) {
    stringifiedData[key] = String(value);
  }

  const payload = {
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: stringifiedData,
    token: fcmToken,
    android: {
      priority: "high",
      notification: {
        channelId: "messages",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  return admin.messaging().send(payload);
}

// AI Features - Priority Detection
const {analyzePriorities} = require("./analyzePriorities");
exports.analyzePriorities = analyzePriorities;

// AI Features - Thread Summarization
const {summarizeThread} = require("./summarizeThread");
exports.summarizeThread = summarizeThread;

// AI Features - Action Item Extraction
const {extractActionItems} = require("./extractActionItems");
exports.extractActionItems = extractActionItems;

// AI Features - Smart Search
const {smartSearch} = require("./smartSearch");
exports.smartSearch = smartSearch;

/**
 * Triggered when new message created in
 * /chats/{chatID}/messages/{messageID}
 * Sends push notifications to all recipients except the sender
 */
exports.onMessageCreated = onDocumentCreated(
    "chats/{chatID}/messages/{messageID}",
    async (event) => {
      const messageID = event.params.messageID;
      const chatID = event.params.chatID;

      try {
      // Get the message data
        const messageData = event.data.data();

        if (!messageData) {
          logger.warn(`No message data found for ${messageID}`);
          return null;
        }

        const {senderID, senderName, text, timestamp} = messageData;

        logger.info(
            `Processing notification for message ${messageID}`,
            {
              chatID,
              senderID,
              senderName,
              textPreview: text?.substring(0, 50),
            },
        );

        // Get the chat document to find all participants
        const chatRef = admin.firestore().collection("chats").doc(chatID);
        let chatDoc = await chatRef.get();

        // AUTO-CREATE CHAT FAILSAFE
        // If chat doesn't exist but message was created, auto-create the chat
        // This prevents the "notification received but chat not appearing" bug
        if (!chatDoc.exists) {
          logger.warn(`Chat ${chatID} not found, attempting auto-create...`);

          try {
            // Check if this is a 1:1 chat (format: userA_userB)
            if (chatID.includes("_")) {
              const userIDs = chatID.split("_");

              if (userIDs.length === 2) {
                const [userA, userB] = userIDs;

                // Get user documents
                const userADoc = await admin.firestore()
                    .collection("users").doc(userA).get();
                const userBDoc = await admin.firestore()
                    .collection("users").doc(userB).get();

                if (userADoc.exists && userBDoc.exists) {
                  const userAData = userADoc.data();
                  const userBData = userBDoc.data();

                  // Create the missing chat document
                  const chatData = {
                    chatID,
                    type: "1:1",
                    participantIDs: [userA, userB],
                    participantNames: [
                      userAData.displayName,
                      userBData.displayName,
                    ],
                    lastMessageText: text || "",
                    lastMessageTimestamp: timestamp ||
                      admin.firestore.FieldValue.serverTimestamp(),
                    lastMessageSenderID: senderID,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  };

                  await chatRef.set(chatData);
                  logger.info(`✅ Auto-created missing 1:1 chat: ${chatID}`);

                  // Re-fetch the chat document
                  chatDoc = await chatRef.get();
                } else {
                  logger.error("Cannot auto-create chat: user(s) not found", {
                    userAExists: userADoc.exists,
                    userBExists: userBDoc.exists,
                  });
                }
              }
            } else {
              logger.warn(
                  "Chat ID format not recognized for auto-create: " + chatID,
              );
            }
          } catch (autoCreateError) {
            logger.error("Failed to auto-create chat:", autoCreateError);
          }

          // If still doesn't exist after auto-create attempt, bail out
          if (!chatDoc.exists) {
            logger.error(
                `Chat ${chatID} still doesn't exist after auto-create attempt`,
            );
            return null;
          }
        }

        const chatData = chatDoc.data();

        // Get recipient IDs (exclude sender)
        let recipientIDs = [];

        if (chatData.type === "1:1") {
        // For 1:1 chats, use participantIDs
          recipientIDs = (chatData.participantIDs || [])
              .filter((id) => id !== senderID);
        } else if (chatData.type === "group") {
        // For group chats, use memberIDs
          recipientIDs = (chatData.memberIDs || [])
              .filter((id) => id !== senderID);
        }

        if (recipientIDs.length === 0) {
          logger.info("No recipients to notify (excluding sender)");
          return null;
        }

        logger.info(`Found ${recipientIDs.length} recipients to notify`);

        // Get FCM tokens for all recipients
        const userRefs = recipientIDs.map((id) =>
          admin.firestore().collection("users").doc(id).get(),
        );

        const userDocs = await Promise.all(userRefs);

        // Build and send notifications
        const notificationPromises = [];

        for (let i = 0; i < userDocs.length; i++) {
          const userDoc = userDocs[i];
          const recipientID = recipientIDs[i];

          if (!userDoc.exists) {
            logger.warn(`User document not found for ${recipientID}`);
            continue;
          }

          const userData = userDoc.data();
          const fcmToken = userData.fcmToken;

          if (!fcmToken) {
            logger.info(
                `No FCM token for user ${recipientID}, skipping`,
            );
            continue;
          }

          // Build notification payload
          const notificationData = {
            title: senderName || "New message",
            body: text ? text.substring(0, 80) : "Sent a message",
          };

          const dataPayload = {
            chatID: chatID,
            messageID: messageID,
            senderID: senderID,
            timestamp: String(timestamp || Date.now()),
            type: "new_message",
          };

          // Send notification using the unified helper function
          const sendPromise = sendPushNotification(
              fcmToken,
              notificationData,
              dataPayload,
          )
              .then((response) => {
                logger.info(
                    `Successfully sent notification to ${recipientID}`,
                    {response},
                );
                return {success: true, recipientID};
              })
              .catch((error) => {
                logger.error(`Error sending notification to ${recipientID}`, {
                  error: error.message,
                  code: error.code,
                });

                // If token is invalid, remove it from user document
                if (error.code === "messaging/invalid-registration-token" ||
                error.code ===
                  "messaging/registration-token-not-registered" ||
                error.message?.includes("DeviceNotRegistered")) {
                  logger.info(
                      `Removing invalid token for user ${recipientID}`,
                  );
                  return userDoc.ref
                      .update({
                        fcmToken: admin.firestore.FieldValue.delete(),
                      })
                      .then(() => ({
                        success: false,
                        recipientID,
                        tokenRemoved: true,
                      }));
                }

                return {success: false, recipientID, error: error.message};
              });

          notificationPromises.push(sendPromise);
        }

        // Wait for all notifications to be sent
        const results = await Promise.all(notificationPromises);

        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.length - successCount;

        logger.info(`Notification summary for message ${messageID}`, {
          total: results.length,
          successful: successCount,
          failed: failureCount,
        });

        return {
          messageID,
          chatID,
          recipientCount: recipientIDs.length,
          notificationsSent: successCount,
          notificationsFailed: failureCount,
        };
      } catch (error) {
        logger.error(`Error processing notification for message ${messageID}`, {
          error: error.message,
          stack: error.stack,
        });

        // Don't throw - we don't want to retry on every error
        // Cloud Functions will log the error for debugging
        return null;
      }
    },
);
