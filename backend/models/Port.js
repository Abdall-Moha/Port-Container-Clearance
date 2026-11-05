
import mongoose from "mongoose";

// Defines the structure and validation rules for a port.
const portSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Port name is required."],
      trim: true,
      unique: true,
    },

    code: {
      type: String,
      required: [true, "Port code is required."],
      trim: true,
      uppercase: true,
      unique: true,
    },

    location: {
      type: String,
      required: [true, "Port location is required."],
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Prevents Mongoose from compiling the same model multiple times.
const Port = mongoose.models.Port || mongoose.model("Port", portSchema);

export default Port;
