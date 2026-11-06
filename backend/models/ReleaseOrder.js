
import mongoose from "mongoose";

// Schema for container release orders.
const releaseOrderSchema = new mongoose.Schema(
  {
    // Container receiving the release order.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
      unique: true,
    },

    // Customs Officer who issued the release order.
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Six-digit code used by the Clearing Agent at the port gate.
    gateCode: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{6}$/, "Gate Code must contain exactly 6 digits."],
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

    // Whether Admin has revoked this release order.
    isRevoked: {
      type: Boolean,
      default: false,
    },

    // Admin who revoked the release order.
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

// Prevent model recompilation errors during development.
const ReleaseOrder =
  mongoose.models.ReleaseOrder ||
  mongoose.model("ReleaseOrder", releaseOrderSchema);

export default ReleaseOrder;
