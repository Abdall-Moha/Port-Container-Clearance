
import express from "express";

import BillOfLading from "../models/BillOfLading.js";
import Port from "../models/Port.js";
import ShippingLine from "../models/ShippingLine.js";
import User from "../models/User.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

// POST /api/bills-of-lading
// Importer or Clearing Agent only.
// Accepts blNumber, shippingLine, port, and optionally importerId.
// Importers create BLs for themselves; Agents create them on behalf of Importers.
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
  async (req, res, next) => {
    try {
      const { blNumber, shippingLine, port, importerId } = req.body;

      if (!blNumber || !shippingLine || !port) {
        return res.status(400).json({
          message: "BL number, shipping line, and port are required.",
        });
      }

      // Importers can only register BLs for themselves.
      let importer;

      if (req.user.role === "IMPORTER") {
        importer = req.user._id;
      } else {
        if (!importerId) {
          return res.status(400).json({
            message: "Importer ID is required when an Agent registers a BL.",
          });
        }

        if (!importerId.match(/^[0-9a-fA-F]{24}$/)) {
          return res.status(400).json({
            message: "Invalid importer ID.",
          });
        }

        importer = await User.findOne({
          _id: importerId,
          role: "IMPORTER",
          isActive: true,
        });

        if (!importer) {
          return res.status(404).json({
            message: "Active Importer not found.",
          });
        }

        importer = importer._id;
      }

      // Make sure the selected shipping line exists and is active.
      const activeShippingLine = await ShippingLine.findOne({
        _id: shippingLine,
        isActive: true,
      });

      if (!activeShippingLine) {
        return res.status(400).json({
          message: "Selected shipping line does not exist or is inactive.",
        });
      }

      // Make sure the selected port exists and is active.
      const activePort = await Port.findOne({
        _id: port,
        isActive: true,
      });

      if (!activePort) {
        return res.status(400).json({
          message: "Selected port does not exist or is inactive.",
        });
      }

      const normalizedBLNumber = blNumber.trim().toUpperCase();

      const existingBL = await BillOfLading.findOne({
        blNumber: normalizedBLNumber,
      });

      if (existingBL) {
        return res.status(409).json({
          message: "This Bill of Lading number already exists.",
        });
      }

      const billOfLading = await BillOfLading.create({
        blNumber: normalizedBLNumber,
        importer,
        shippingLine,
        port,
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "Bill of Lading registered successfully.",
        billOfLading,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/bills-of-lading
// Authenticated users.
// Importers see their own BLs.
// Clearing Agents see BLs they created.
// Admins and Customs Officers can view all BLs.
router.get("/", AuthMiddleware, async (req, res, next) => {
  try {
    let filter = {};

    if (req.user.role === "IMPORTER") {
      filter.importer = req.user._id;
    }

    if (req.user.role === "CLEARING_AGENT") {
      filter.createdBy = req.user._id;
    }

    const billsOfLading = await BillOfLading.find(filter)
      .populate("importer", "fullName email phone")
      .populate("shippingLine", "name code")
      .populate("port", "name code location")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: billsOfLading.length,
      billsOfLading,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills-of-lading/:id
// Authenticated users.
// Returns one BL with its importer, shipping line, and port details.
// Importers and Agents can only view their permitted BLs.
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: "Invalid Bill of Lading ID.",
      });
    }

    const billOfLading = await BillOfLading.findById(id)
      .populate("importer", "fullName email phone")
      .populate("shippingLine", "name code")
      .populate("port", "name code location")
      .populate("createdBy", "fullName email");

    if (!billOfLading) {
      return res.status(404).json({
        message: "Bill of Lading not found.",
      });
    }

    // Importers can only access their own BLs.
    if (
      req.user.role === "IMPORTER" &&
      !billOfLading.importer._id.equals(req.user._id)
    ) {
      return res.status(403).json({
        message: "You do not have permission to view this BL.",
      });
    }

    // Agents can only access BLs they registered.
    if (
      req.user.role === "CLEARING_AGENT" &&
      !billOfLading.createdBy._id.equals(req.user._id)
    ) {
      return res.status(403).json({
        message: "You do not have permission to view this BL.",
      });
    }

    return res.status(200).json({ billOfLading });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/bills-of-lading/:id
// Importer or Clearing Agent only.
// Accepts shippingLine and port.
// Importers can update their own BLs; Agents can update BLs they created.
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { shippingLine, port } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid Bill of Lading ID.",
        });
      }

      const billOfLading = await BillOfLading.findById(id);

      if (!billOfLading) {
        return res.status(404).json({
          message: "Bill of Lading not found.",
        });
      }

      // Check ownership before allowing updates.
      if (
        req.user.role === "IMPORTER" &&
        !billOfLading.importer.equals(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can only update your own BLs.",
        });
      }

      if (
        req.user.role === "CLEARING_AGENT" &&
        !billOfLading.createdBy.equals(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can only update BLs you registered.",
        });
      }

      const updates = {};

      if (shippingLine !== undefined) {
        const activeShippingLine = await ShippingLine.findOne({
          _id: shippingLine,
          isActive: true,
        });

        if (!activeShippingLine) {
          return res.status(400).json({
            message: "Selected shipping line does not exist or is inactive.",
          });
        }

        updates.shippingLine = shippingLine;
      }

      if (port !== undefined) {
        const activePort = await Port.findOne({
          _id: port,
          isActive: true,
        });

        if (!activePort) {
          return res.status(400).json({
            message: "Selected port does not exist or is inactive.",
          });
        }

        updates.port = port;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "No valid fields provided for update.",
        });
      }

      Object.assign(billOfLading, updates);
      await billOfLading.save();

      return res.status(200).json({
        message: "Bill of Lading updated successfully.",
        billOfLading,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
