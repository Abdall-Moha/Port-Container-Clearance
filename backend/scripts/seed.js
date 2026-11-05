import "dotenv/config";
import mongoose from "mongoose";
import connectDatabase from "../config/database.js";
import User from "../models/User.js";

// Creates the initial Admin from environment credentials only. It does nothing
// if that email already exists, reports errors without secrets, and always disconnects.
async function seedAdmin() {
  try {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error(
        "ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set.",
      );

    await connectDatabase();
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log("Admin account already exists; no account was created.");
      return;
    }

    await User.create({
      fullName: ADMIN_NAME.trim(),
      email,
      password: ADMIN_PASSWORD,
      role: "ADMIN",
      isActive: true,
      createdBy: null,
    });
    console.log("Initial Admin account created successfully.");
  } catch (error) {
    console.error(`Could not seed Admin: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
