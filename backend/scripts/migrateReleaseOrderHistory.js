import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDatabase from "../config/database.js";
import ReleaseOrder from "../models/ReleaseOrder.js";

dotenv.config();

// Backfill legacy Release Orders and replace only the obsolete one-order-per-container index.
async function migrateReleaseOrderHistory() {
  if (process.env.CONFIRM_RELEASE_ORDER_HISTORY_MIGRATION !== "yes") {
    throw new Error("Set CONFIRM_RELEASE_ORDER_HISTORY_MIGRATION=yes after verifying MONGO_URI to run this migration.");
  }

  // Prevent automatic index creation before legacy records have their required values.
  mongoose.set("autoIndex", false);
  await connectDatabase();

  try {
    const collection = ReleaseOrder.collection;
    const orders = await ReleaseOrder.find().select("_id container status isRevoked createdAt releaseOrderNumber").lean();
    const indexes = await collection.indexes();
    const obsoleteContainerIndexes = indexes.filter((index) =>
      index.name === "container_1" &&
      index.unique &&
      !index.partialFilterExpression &&
      !index.sparse &&
      !index.expireAfterSeconds &&
      !index.collation &&
      Object.keys(index.key).length === 1 &&
      index.key.container === 1,
    );

    if (obsoleteContainerIndexes.length > 1) {
      throw new Error("More than one obsolete unique container index exists. Inspect the collection indexes manually.");
    }

    const otherUniqueContainerIndexes = indexes.filter((index) =>
      index.unique &&
      Object.keys(index.key).length === 1 &&
      index.key.container === 1 &&
      !obsoleteContainerIndexes.includes(index) &&
      index.partialFilterExpression?.status !== "ISSUED",
    );

    if (otherUniqueContainerIndexes.length > 0) {
      throw new Error("An unrecognized unique container index exists. Inspect the collection indexes manually.");
    }

    // Check the resulting values before changing any records or indexes.
    const releaseOrderNumbers = new Set();
    const issuedContainers = new Set();
    for (const order of orders) {
      const releaseOrderNumber = typeof order.releaseOrderNumber === "string" && order.releaseOrderNumber.trim()
        ? order.releaseOrderNumber
        : `RO-${String(order._id).toUpperCase()}`;
      const status = order.isRevoked || order.status === "REVOKED" ? "REVOKED" : "ISSUED";
      if (!order.container) {
        throw new Error(`Release Order ${order._id} has no container reference. Resolve the record before migration.`);
      }
      const containerId = String(order.container);

      if (releaseOrderNumbers.has(releaseOrderNumber)) {
        throw new Error(`Duplicate Release Order number found during preflight: ${releaseOrderNumber}`);
      }
      releaseOrderNumbers.add(releaseOrderNumber);

      if (status === "ISSUED" && issuedContainers.has(containerId)) {
        throw new Error(`Multiple issued Release Orders exist for container ${containerId}. Resolve the records before migration.`);
      }
      if (status === "ISSUED") issuedContainers.add(containerId);
    }

    for (const order of orders) {
      const updates = {};

      if (typeof order.releaseOrderNumber !== "string" || !order.releaseOrderNumber.trim()) {
        updates.releaseOrderNumber = `RO-${String(order._id).toUpperCase()}`;
      }

      updates.status = order.isRevoked || order.status === "REVOKED" ? "REVOKED" : "ISSUED";
      updates.issuedAt = order.createdAt || new Date();
      updates.isRevoked = updates.status === "REVOKED";

      await collection.updateOne({ _id: order._id }, { $set: updates });
    }

    // Ensure the unique order-number and one-issued-order-per-container indexes exist first.
    await ReleaseOrder.createIndexes();

    // Drop only the verified obsolete index after the replacement constraints are active.
    const obsoleteContainerIndex = obsoleteContainerIndexes[0];
    if (obsoleteContainerIndex) {
      await collection.dropIndex(obsoleteContainerIndex.name);
    }

    return {
      migratedOrders: orders.length,
      removedObsoleteIndex: obsoleteContainerIndex?.name || null,
    };
  } finally {
    await mongoose.disconnect();
  }
}

// Run only as an explicit operator-invoked migration command.
migrateReleaseOrderHistory()
  .then((result) => {
    console.log("Release Order history migration completed:", result);
  })
  .catch((error) => {
    console.error("Release Order history migration failed:", error.message);
    process.exitCode = 1;
  });
