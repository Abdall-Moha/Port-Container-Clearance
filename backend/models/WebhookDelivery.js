import mongoose from "mongoose";

// Schema for recording each individual webhook delivery attempt.
const webhookAttemptSchema = new mongoose.Schema(
  {
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    attemptedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    outcome: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
    },

    responseStatus: {
      type: Number,
      default: null,
    },

    responseBody: {
      type: String,
      default: "",
    },

    errorMessage: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  },
);

// Schema for recording webhook deliveries to shipping lines.
const webhookDeliverySchema = new mongoose.Schema(
  {
    // Shipping line receiving the webhook.
    shippingLine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingLine",
      required: true,
    },

    // Container connected to this webhook.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    // Clearance event that triggered this webhook.
    clearanceEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClearanceEvent",
      required: true,
    },

    // Unique ID used to identify this webhook event.
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Shipping line endpoint used for this delivery.
    webhookUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // Information sent to the shipping line.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Total number of delivery attempts, including manual resends.
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Number of attempts in the current automatic retry cycle.
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Current delivery status.
    status: {
      type: String,
      enum: ["PENDING", "SENDING", "DELIVERED", "FAILED"],
      default: "PENDING",
    },

    // History of every individual delivery attempt.
    attemptHistory: {
      type: [webhookAttemptSchema],
      default: [],
    },

    // Time when the last delivery attempt happened.
    lastAttemptAt: {
      type: Date,
      default: null,
    },

    // Time when the next automatic retry should happen.
    nextRetryAt: {
      type: Date,
      default: null,
    },

    // Identifies the worker currently sending this delivery and expires after a crash.
    processingToken: {
      type: String,
      default: null,
    },

    // Allows another worker to reclaim a delivery after its sender stops unexpectedly.
    processingUntil: {
      type: Date,
      default: null,
    },

    // HTTP status returned by the latest attempt.
    responseStatus: {
      type: Number,
      default: null,
    },

    // Response returned by the latest attempt.
    responseBody: {
      type: String,
      default: "",
    },

    // Error message from the latest failed attempt.
    errorMessage: {
      type: String,
      default: "",
    },

    // Time when the webhook was successfully delivered.
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Quickly find webhook deliveries belonging to a container.
webhookDeliverySchema.index({
  container: 1,
  createdAt: -1,
});

// Find webhook deliveries waiting for another attempt.
webhookDeliverySchema.index({
  status: 1,
  nextRetryAt: 1,
});

const WebhookDelivery =
  mongoose.models.WebhookDelivery ||
  mongoose.model("WebhookDelivery", webhookDeliverySchema);

export default WebhookDelivery;
