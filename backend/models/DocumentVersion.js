
import mongoose from "mongoose";

// Stores an individual uploaded version of a required document.
const documentVersionSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },

    versionNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    // Original name supplied by the uploader.
    fileName: {
      type: String,
      required: true,
      trim: true,
    },

    // Private file location on the backend server.
    filePath: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
      enum: ["application/pdf", "image/jpeg", "image/png"],
    },

    fileSize: {
      type: Number,
      required: true,
      min: 1,
      max: 5 * 1024 * 1024,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
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

// Prevents two versions from having the same number for one document.
documentVersionSchema.index(
  { document: 1, versionNumber: 1 },
  { unique: true },
);

// Prevents Mongoose from compiling the same model multiple times.
const DocumentVersion =
  mongoose.models.DocumentVersion ||
  mongoose.model("DocumentVersion", documentVersionSchema);

export default DocumentVersion;
