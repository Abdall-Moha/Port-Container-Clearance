
import mongoose from "mongoose";

const dutyRateSchema = new mongoose.Schema(
  {
    // The first two digits of the HS Code.
    // Example: HS Code 850440 has chapter 85.
    hsChapter: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{2}$/, "HS Chapter must contain exactly two digits."],
    },

    // Customs duty percentage applied to the CIF value.
    dutyPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    // Fixed port fee for a 20ft container, in USD.
    portFee20FT: {
      type: Number,
      required: true,
      min: 0,
    },

    // Fixed port fee for a 40ft container, in USD.
    portFee40FT: {
      type: Number,
      required: true,
      min: 0,
    },

    // Inactive rates cannot be used for new duty assessments.
    isActive: {
      type: Boolean,
      default: true,
    },

    // Admin who created this rate.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Admin who last updated this rate.
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const DutyRate = mongoose.model("DutyRate", dutyRateSchema);

export default DutyRate;
