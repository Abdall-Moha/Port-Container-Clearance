
import mongoose from "mongoose";

// Defines the structure and relationships of a Bill of Lading.
const billOfLadingSchema = new mongoose.Schema(
  {
    blNumber: {
      type: String,
      required: [true, "Bill of Lading number is required."],
      trim: true,
      uppercase: true,
      unique: true,
    },

    importer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    shippingLine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingLine",
      required: true,
    },

    port: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Port",
      required: true,
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
const BillOfLading =
  mongoose.models.BillOfLading ||
  mongoose.model("BillOfLading", billOfLadingSchema);

export default BillOfLading;
