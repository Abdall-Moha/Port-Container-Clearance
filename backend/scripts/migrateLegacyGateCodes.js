import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDatabase from "../config/database.js";
import ReleaseOrder from "../models/ReleaseOrder.js";
import { hashGateCode } from "../services/GateCodeService.js";

dotenv.config();

// Hash legacy plaintext Gate Codes without changing any other Release Order fields.
async function migrateLegacyGateCodes() {
  if (process.env.CONFIRM_LEGACY_GATE_CODE_MIGRATION !== "yes") {
    throw new Error("Set CONFIRM_LEGACY_GATE_CODE_MIGRATION=yes after verifying MONGO_URI to run this migration.");
  }

  // Prevent automatic index changes while this data-only migration runs.
  mongoose.set("autoIndex", false);
  await connectDatabase();

  try {
    const collection = ReleaseOrder.collection;
    const cursor = collection.find({}, { projection: { _id: 1, gateCode: 1 } });
    let migratedRecords = 0;
    let skippedRecords = 0;

    for await (const releaseOrder of cursor) {
      if (!/^\d{6}$/.test(releaseOrder.gateCode || "")) {
        skippedRecords += 1;
        continue;
      }

      // Reuse the same salted scrypt format used by new Release Orders.
      const hashedGateCode = await hashGateCode(releaseOrder.gateCode);
      const result = await collection.updateOne(
        { _id: releaseOrder._id, gateCode: releaseOrder.gateCode },
        { $set: { gateCode: hashedGateCode } },
      );

      if (result.modifiedCount === 1) {
        migratedRecords += 1;
      } else {
        // Another process changed the record before this migration updated it.
        skippedRecords += 1;
      }
    }

    return { migratedRecords, skippedRecords };
  } finally {
    await mongoose.disconnect();
  }
}

// Run only when this explicit migration script is invoked by an operator.
migrateLegacyGateCodes()
  .then((result) => {
    console.log("Legacy Gate Code migration completed:", result);
  })
  .catch((error) => {
    console.error("Legacy Gate Code migration failed. No Gate Code values were printed.");
    if (error.code) console.error("Database error code:", error.code);
    process.exitCode = 1;
  });
