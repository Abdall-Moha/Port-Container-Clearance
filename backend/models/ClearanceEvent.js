
import mongoose from "mongoose";

// All valid clearance stages.
const clearanceStages = [
  "ARRIVED",
  "DOCUMENTS_SUBMITTED",
  "CUSTOMS_REVIEW",
  "DUTY_ASSESSED",
  "DUTY_PAID",
  "INSPECTION",
  "RELEASED",
  "COLLECTED",
];

const clearanceEventSchema = new mongoose.Schema(
  {
    // The container whose clearance history is being recorded.
    container: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },

    // The stage before the transition.
    // Null can be used for an initial ARRIVED event if we add one later.
    fromStage: {
      type: String,
      enum: clearanceStages,
      default: null,
    },

    // The stage after the transition.
    toStage: {
      type: String,
      enum: clearanceStages,
      required: true,
    },

    // The user who performed the transition.
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Explanation for the transition, especially when moving backwards.
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Quickly retrieve a container's events in chronological order.
clearanceEventSchema.index({
  container: 1,
  createdAt: 1,
});

// A container can have only one initial ARRIVED event, even if registration is retried.
clearanceEventSchema.index(
  { container: 1 },
  {
    unique: true,
    partialFilterExpression: { toStage: "ARRIVED" },
  },
);

// A container can have only one DUTY_PAID transition event.
clearanceEventSchema.index(
  { container: 1, toStage: 1 },
  {
    unique: true,
    partialFilterExpression: { toStage: "DUTY_PAID" },
  },
);

const ClearanceEvent = mongoose.model(
  "ClearanceEvent",
  clearanceEventSchema,
);

export default ClearanceEvent;
