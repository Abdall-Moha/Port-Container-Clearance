
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Defines the structure, validation, and password security of every user.
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required."],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [8, "Password must contain at least 8 characters."],
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    role: {
      type: String,
      required: true,
      enum: [
        "ADMIN",
        "IMPORTER",
        "CLEARING_AGENT",
        "CUSTOMS_OFFICER",
      ],
      default: "IMPORTER",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    preferredLanguage: {
      type: String,
      enum: ["en", "so"],
      default: "en",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hashes the password before saving a new user or an updated password.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);
});

// Compares the entered password with the stored password hash.
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Prevents Mongoose from compiling the same model multiple times.
const User =
  mongoose.models.User || mongoose.model("User", userSchema);

export default User;
