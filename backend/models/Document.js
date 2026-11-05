
import mongoose from "mongoose";

// Defines a required document belonging to a container.
const documentSchema = new mongoose.Schema(
  {
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    documentType: {
      type: String,
      required: [true, "Document type is required."],
      enum: [
        "COMMERCIAL_INVOICE",
        "PACKING_LIST",
        "BILL_OF_LADING",
        "CERTIFICATE_OF_ORIGIN",
      ],
    },

    // Stores the number of the newest uploaded version.
    latestVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    reviewStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    reviewedVersionNumber: {
      type: Number,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// A container cannot have two records for the same document type.
documentSchema.index(
  { container: 1, documentType: 1 },
  { unique: true },
);

// Prevents Mongoose from compiling the same model multiple times.
const Document =
  mongoose.models.Document ||
  mongoose.model("Document", documentSchema);

export default Document;
