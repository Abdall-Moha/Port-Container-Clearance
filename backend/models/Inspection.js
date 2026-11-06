import mongoose from "mongoose";

// Schema for inspections.
const inspectionSchema = new mongoose.Schema(
  {
    // The container being inspected.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    // Attempt number for this container: 1, 2, 3, etc.
    inspectionNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    // Date and time when the inspection is scheduled.
    scheduledAt: {
      type: Date,
      required: true,
    },

    // Customs Officer assigned to perform the inspection.
    inspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Officer who scheduled the inspection.
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Inspection result.
    result: {
      type: String,
      enum: ["PENDING", "PASS", "FAIL"],
      default: "PENDING",
    },

    // Officer's notes and explanation of the result.
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // Time when the inspection result was recorded.
    completedAt: {
      type: Date,
      default: null,
    },

    // Photos uploaded as evidence during the inspection.
    photos: [
      {
        // Original name of the uploaded photo.
        fileName: {
          type: String,
          required: true,
          trim: true,
        },

        // Private location of the photo on the backend server.
        filePath: {
          type: String,
          required: true,
          trim: true,
        },

        // Only JPG and PNG photos are allowed.
        mimeType: {
          type: String,
          required: true,
          enum: ["image/jpeg", "image/png"],
        },

        // Photo size in bytes. Maximum 5 MB.
        fileSize: {
          type: Number,
          required: true,
          min: 1,
          max: 5 * 1024 * 1024,
        },

        // User who uploaded the photo.
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        // Date and time when the photo was uploaded.
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Each inspection attempt must have a unique number per container.
inspectionSchema.index(
  {
    container: 1,
    inspectionNumber: 1,
  },
  {
    unique: true,
  },
);

// Quickly retrieve a container's inspection history.
inspectionSchema.index({
  container: 1,
  scheduledAt: -1,
});

// Ensure an inspection cannot contain more than 5 photos.
inspectionSchema.path("photos").validate(function (photos) {
  return photos.length <= 5;
}, "An inspection cannot have more than 5 photos.");

const Inspection = mongoose.model("Inspection", inspectionSchema);

export default Inspection;