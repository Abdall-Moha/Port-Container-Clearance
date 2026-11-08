import mongoose from "mongoose";

// Keeps the exact duty rate and calculated amount used for this container.
// This snapshot is saved once so later rate changes cannot alter the amount due.
const dutyAssessmentSchema = new mongoose.Schema(
  {
    dutyRate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DutyRate",
      required: true,
    },
    hsChapter: { type: String, required: true },
    cifValue: { type: Number, required: true, min: 0.01 },
    dutyPercentage: { type: Number, required: true, min: 0, max: 100 },
    portFee: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    assessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assessedAt: { type: Date, required: true },
  },
  { _id: false },
);

// Validates a container number using the ISO 6346 check digit algorithm.
// Receives a container number such as MSKU1234566.
// Returns true if the format and check digit are correct.
function validateContainerNumber(containerNumber) {
  const normalizedNumber = containerNumber.toUpperCase();

  // Four letters followed by seven digits.
  if (!/^[A-Z]{4}[0-9]{7}$/.test(normalizedNumber)) {
    return false;
  }

  const letterValues = {
    A: 10,
    B: 12,
    C: 13,
    D: 14,
    E: 15,
    F: 16,
    G: 17,
    H: 18,
    I: 19,
    J: 20,
    K: 21,
    L: 23,
    M: 24,
    N: 25,
    O: 26,
    P: 27,
    Q: 28,
    R: 29,
    S: 30,
    T: 31,
    U: 32,
    V: 34,
    W: 35,
    X: 36,
    Y: 37,
    Z: 38,
  };

  let sum = 0;

  for (let i = 0; i < 10; i++) {
    const character = normalizedNumber[i];

    const value = isNaN(Number(character))
      ? letterValues[character]
      : Number(character);

    sum += value * Math.pow(2, i);
  }

  const remainder = sum % 11;
  const calculatedCheckDigit = remainder === 10 ? 0 : remainder;

  const actualCheckDigit = Number(normalizedNumber[10]);

  return calculatedCheckDigit === actualCheckDigit;
}

// Defines the structure, validation, and relationships of a container.
const containerSchema = new mongoose.Schema(
  {
    containerNumber: {
      type: String,
      required: [true, "Container number is required."],
      trim: true,
      uppercase: true,
      validate: {
        validator: validateContainerNumber,
        message: "Invalid container number or ISO 6346 check digit.",
      },
    },

    billOfLading: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillOfLading",
      required: true,
    },

    importer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    size: {
      type: String,
      required: [true, "Container size is required."],
      enum: ["20FT", "40FT"],
    },

    cargoDescription: {
      type: String,
      required: [true, "Cargo description is required."],
      trim: true,
    },

    hsCode: {
      type: String,
      required: [true, "HS Code is required."],
      trim: true,
    },

    cifValue: {
      type: Number,
      required: [true, "CIF value is required."],
      min: [0.01, "CIF value must be greater than zero."],
    },

    arrivalDate: {
      type: Date,
      required: [true, "Arrival date is required."],
    },

    currentStage: {
      type: String,
      enum: [
        "ARRIVED",
        "DOCUMENTS_SUBMITTED",
        "CUSTOMS_REVIEW",
        "DUTY_ASSESSED",
        "DUTY_PAID",
        "INSPECTION",
        "RELEASED",
        "COLLECTED",
      ],
      default: "ARRIVED",
    },

    // The confirmed duty calculation. It stays unchanged if an Admin later edits rates.
    dutyAssessment: {
      type: dutyAssessmentSchema,
      default: undefined,
    },

    // Active document upload leases prevent review or assessment from overtaking an upload.
    // Each lease expires automatically if the server stops before it can release it.
    documentUploadReservations: {
      type: [
        {
          reservationId: { type: String, required: true },
          expiresAt: { type: Date, required: true },
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ["ACTIVE", "HELD", "COMPLETED", "INACTIVE"],
      default: "ACTIVE",
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

// Prevent duplicate active clearances while allowing completed containers to be registered again.
containerSchema.index(
  { containerNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["ACTIVE", "HELD"] },
    },
  },
);

// Prevents Mongoose from compiling the same model multiple times.
const Container =
  mongoose.models.Container || mongoose.model("Container", containerSchema);

export default Container;
