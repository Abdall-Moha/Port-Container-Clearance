
import mongoose from "mongoose";

// Schema for container release orders.
const releaseOrderSchema = new mongoose.Schema(
  {
    // Container receiving the release order.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    // Unique reference printed on this Release Order and its PDF.
    releaseOrderNumber: {
      type: String,
      required: true,
      immutable: true,
    },

    // Current authorization status. A revoked order is never reactivated.
    status: {
      type: String,
      enum: ["ISSUED", "REVOKED"],
      default: "ISSUED",
      required: true,
    },

    // Point to the revoked order this order replaces, if any.
    replaces: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReleaseOrder",
      default: null,
    },

    // Time this order was issued. Legacy records are backfilled by the migration script.
    issuedAt: {
      type: Date,
      default: Date.now,
    },

    // Customs Officer who issued the release order.
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Salted hash of the six-digit code used by the Clearing Agent at the port gate.
    // Legacy records may still contain the original six-digit value until collection.
    gateCode: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (value) => /^\d{6}$/.test(value) || /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(value),
        message: "Gate Code must be a six-digit code or its secure stored hash.",
      },
    },

    // Whether the Gate Code has already been used.
    gateCodeUsed: {
      type: Boolean,
      default: false,
    },

    // Clearing Agent who collected the container.
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Date and time when the container was collected.
    collectedAt: {
      type: Date,
      default: null,
    },

    // Kept for compatibility with older API clients and records; status is authoritative.
    isRevoked: {
      type: Boolean,
      default: false,
    },

    // Customs Officer who revoked the release order.
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Reason for revoking the release order.
    revocationReason: {
      type: String,
      trim: true,
      default: "",
    },

    // Date and time when the release order was revoked.
    revokedAt: {
      type: Date,
      default: null,
    },

    // Private location of the generated PDF file.
    pdfPath: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Quickly retrieve release orders by collection status.
releaseOrderSchema.index({
  gateCodeUsed: 1,
  isRevoked: 1,
});

// Permit one active issued order per container while keeping all revoked orders as history.
releaseOrderSchema.index(
  { releaseOrderNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { releaseOrderNumber: { $type: "string" } },
    name: "unique_release_order_number",
  },
);

releaseOrderSchema.index(
  { container: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ISSUED" },
    name: "one_issued_release_order_per_container",
  },
);

// Find order history for a container in issue order.
releaseOrderSchema.index({ container: 1, createdAt: -1 });

// Prevent model recompilation errors during development.
const ReleaseOrder =
  mongoose.models.ReleaseOrder ||
  mongoose.model("ReleaseOrder", releaseOrderSchema);

export default ReleaseOrder;
