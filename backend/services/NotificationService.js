
import Notification from "../models/Notification.js";
import User from "../models/User.js";

// Create notifications for one or more users when a system event happens.
async function createEventNotifications({
  recipientIds,
  containerId = null,
  type = "GENERAL",
  titleEnglish,
  titleSomali,
  messageEnglish,
  messageSomali,
  sendSMS = true,
}) {
  // Make sure the required notification information has been provided.
  if (
    !Array.isArray(recipientIds) ||
    recipientIds.length === 0 ||
    !titleEnglish ||
    !titleSomali ||
    !messageEnglish ||
    !messageSomali
  ) {
    throw new Error("Valid recipients and notification messages are required");
  }

  // Remove duplicate user IDs so nobody receives the same notification twice.
  const uniqueRecipientIds = [...new Set(recipientIds.map(String))];

  // Find the users who should receive the notifications.
  const users = await User.find({
    _id: { $in: uniqueRecipientIds },
  }).select("_id phone");

  if (users.length === 0) {
    throw new Error("No valid notification recipients were found");
  }

  // Prepare one notification document for each recipient.
  const notificationData = users.map((user) => {
    const hasPhoneNumber = Boolean(user.phone);

    return {
      recipient: user._id,
      container: containerId,
      type,

      titleEnglish,
      titleSomali,
      messageEnglish,
      messageSomali,

      isRead: false,

      // Record simulated SMS delivery without contacting a real SMS provider.
      smsStatus: sendSMS
        ? hasPhoneNumber
          ? "SIMULATED"
          : "SKIPPED_NO_PHONE"
        : "NOT_REQUESTED",

      smsSentAt:
        sendSMS && hasPhoneNumber
          ? new Date()
          : null,
    };
  });

  // Save all notifications in the database.
  const notifications = await Notification.insertMany(notificationData);

  return notifications;
}

export default createEventNotifications;
