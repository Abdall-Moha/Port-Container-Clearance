
import mongoose from "mongoose";

// Store notifications sent to users through the application.
const NotificationSchema = new mongoose.Schema(
  {
    // The user who receives this notification.
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The container related to this notification, if applicable.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      default: null,
    },

    // Identify the reason for the notification.
    type: {
      type: String,
      enum: [
        "CLEARANCE_STAGE",
        "DOCUMENT_REVIEW",
        "PAYMENT",
        "INSPECTION",
        "RELEASE_ORDER",
        "DEMURRAGE",
        "GENERAL",
      ],
      default: "GENERAL",
      required: true,
    },

    // Store the notification title in both supported languages.
    titleEnglish: {
      type: String,
      required: true,
      trim: true,
    },

    titleSomali: {
      type: String,
      required: true,
      trim: true,
    },

    // Store the notification message in both supported languages.
    messageEnglish: {
      type: String,
      required: true,
      trim: true,
    },

    messageSomali: {
      type: String,
      required: true,
      trim: true,
    },

    // Track whether the user has opened or read the notification.
    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Record the simulated SMS delivery result.
    smsStatus: {
      type: String,
      enum: ["NOT_REQUESTED", "SIMULATED", "SKIPPED_NO_PHONE"],
      default: "NOT_REQUESTED",
    },

    smsSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Make it faster to find a user's latest notifications and unread notifications.
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1 });

const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);

export default Notification;
