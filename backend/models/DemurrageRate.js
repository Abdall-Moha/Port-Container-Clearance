import mongoose from "mongoose";

// Stores the Admin-configured daily demurrage amount for one container size.
const demurrageRateSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      required: true,
      enum: ["20FT", "40FT"],
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0,
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
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// A unique size index prevents simultaneous duplicate configurations.
demurrageRateSchema.index({ size: 1 }, { unique: true });

const DemurrageRate = mongoose.models.DemurrageRate ||
  mongoose.model("DemurrageRate", demurrageRateSchema);

export default DemurrageRate;
