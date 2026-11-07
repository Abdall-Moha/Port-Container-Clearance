import mongoose from "mongoose";

// Stores the next daily receipt sequence so concurrent payments receive different numbers.
const receiptCounterSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      unique: true,
    },
    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// Prevents Mongoose from compiling the same model multiple times.
const ReceiptCounter =
  mongoose.models.ReceiptCounter ||
  mongoose.model("ReceiptCounter", receiptCounterSchema);

export default ReceiptCounter;
