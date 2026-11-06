
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // The container this payment belongs to.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    // The user who made the payment.
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Mobile money provider selected by the user.
    provider: {
      type: String,
      enum: ["EVC_PLUS", "ZAAD", "EDAHAB"],
      required: true,
    },

    // Phone number used for the payment.
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // Payment amount in USD.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
      enum: ["USD"],
    },

    // Transaction status.
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    // Receipt generated after successful payment.
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Save the duty calculation used for this payment.
    // These values must not change if the Admin updates the rate later.
    hsChapter: {
      type: String,
      required: true,
    },

    cifValue: {
      type: Number,
      required: true,
      min: 0,
    },

    dutyPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    portFee: {
      type: Number,
      required: true,
      min: 0,
    },

    // Time when the payment was successful.
    paidAt: {
      type: Date,
      default: null,
    },

    // Explanation when a payment fails.
    failureReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Allow only one successful payment per container.
// Failed payments do not prevent the user from trying again.
paymentSchema.index(
  { container: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "SUCCESS",
    },
  },
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
