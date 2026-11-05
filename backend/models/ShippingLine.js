
import mongoose from "mongoose";

// Defines the structure and validation rules for a shipping line.
const shippingLineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Shipping line name is required."],
      trim: true,
      unique: true,
    },

    code: {
      type: String,
      required: [true, "Shipping line code is required."],
      trim: true,
      uppercase: true,
      unique: true,
    },

    webhookUrl: {
      type: String,
      trim: true,
      default: "",
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
const ShippingLine =
  mongoose.models.ShippingLine ||
  mongoose.model("ShippingLine", shippingLineSchema);

export default ShippingLine;
